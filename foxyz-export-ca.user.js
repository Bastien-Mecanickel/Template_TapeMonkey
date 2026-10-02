// ==UserScript==
// @name         Foxyz — Export CA par commercial
// @namespace    mecanickel
// @version      1.6
// @description  Extrait le chiffre d'affaires facturé par commercial sur un mois donné (factures, avoirs et acomptes) et génère un fichier Excel à 2 feuilles. LECTURE SEULE.
// @author       Bastien BARBIER
// @match        https://mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * ============================================================================
 *  LECTURE SEULE — ce script n'écrit RIEN dans Foxyz.
 *  Deux appels GET (tableau 91 "Lignes des factures" et tableau 111
 *  "Lignes des factures d'acompte"), lecture du HTML renvoyé, fichier Excel
 *  construit en local. Aucun POST, aucun formulaire ouvert, aucun champ modifié.
 * ============================================================================
 *
 *  RÈGLE DE CALCUL (décision du 02/10/2026)
 *  ----------------------------------------
 *  Une facture finale porte le montant TOTAL de la commande, acompte NON déduit.
 *  Exemple : commande 12 → acompte 540,80 € puis facture finale 5 408,00 €.
 *  Les 5 408 € contiennent déjà les 540,80 €.
 *
 *  Donc :
 *   • un acompte compte dans le CA du mois où il est émis, à son montant plein ;
 *   • une facture finale compte dans son mois, DIMINUÉE des acomptes déjà
 *     émis sur la même commande.
 *  Le CA reste juste, et chaque commercial est crédité au bon moment.
 *  Le rapprochement se fait par N° Commande.
 *
 *  PRÉREQUIS (une seule fois par utilisateur, voir MODE_EMPLOI)
 *  ------------------------------------------------------------
 *  Les colonnes listées dans CHAMPS_FACTURES et CHAMPS_ACOMPTES doivent être
 *  affichées dans les tableaux 91 et 111. Le script le vérifie au lancement et
 *  s'arrête avec un message clair si une colonne manque.
 *  L'ORDRE des colonnes n'a aucune importance : on les repère par leur
 *  id_foxyz_champ, jamais par leur position.
 */

(function () {
    'use strict';

    // =========================================================================
    //  CONSTANTES MÉTIER
    //  C'est ici, et nulle part ailleurs, qu'on met à jour les listes.
    // =========================================================================

    /** Chargés d'affaires dont le CA est suivi. Clé = id_employe Foxyz. */
    const COMMERCIAUX = {
        3: 'Bastien BARBIER',
        4: 'Anthony BAILLY'
    };

    /** Autres salariés connus, pour que les anomalies soient lisibles. */
    const AUTRES_SALARIES = {
        1: 'David BAETENS',
        2: 'FOXYZ FOXYZ (compte éditeur)',
        5: 'Julie SAWEZUK'
    };

    /** Clients hors périmètre commercial : pas de chargé d'affaires, donc pas
     *  de prime. Leurs documents sont écartés du CA ET des anomalies, mais
     *  comptés dans une ligne de traçabilité du récap.
     *
     *  ETS J.MENUT : revente de copeaux, ce n'est pas un client commercial.
     *
     *  La comparaison se fait sur le début du nom, en majuscules et sans
     *  accent : 'ETS J.MENUT' couvre donc aussi 'ETS J.MENUT SARL'.
     *  Ajoute une ligne ici si un autre client de ce type apparaît. */
    const CLIENTS_EXCLUS = [
        'ETS J.MENUT'
    ];

    /** Tableau 91 — Lignes des factures (factures finales et avoirs).
     *
     *  Il n'existe PAS de colonne indiquant la nature du document : elle se
     *  déduit de la source et du signe du montant.
     *    tableau 91,  montant > 0 → Facture
     *    tableau 91,  montant < 0 → Avoir
     *    tableau 111, montant > 0 → Acompte
     *    tableau 111, montant < 0 → Avoir sur acompte
     */
    const CHAMPS_FACTURES = {
        numero:     { id: 273,  libelle: 'N° Facture' },
        date:       { id: 274,  libelle: 'Date création facture' },
        totalHT:    { id: 1091, libelle: 'Total HT Facture' },
        commercial: { id: 1736, libelle: 'commande.id_commercial_commande' },
        commande:   { id: 187,  libelle: 'N° Commande' },
        client:     { id: 2,    libelle: 'Entreprise / Raison sociale' }
    };

    /** Tableau 111 — Lignes des factures d'acompte. */
    const CHAMPS_ACOMPTES = {
        numero:     { id: 1466, libelle: 'N° Demande/facture acompte' },
        date:       { id: 1467, libelle: 'Date creation facture acompte' },
        totalHT:    { id: 1481, libelle: 'Total HT facture acompte' },
        commercial: { id: 1736, libelle: 'commande.id_commercial_commande' },
        commande:   { id: 187,  libelle: 'N° Commande' },
        client:     { id: 2,    libelle: 'Entreprise / Raison sociale' }
    };

    const TABLEAU_FACTURES = 91;
    const TABLEAU_ACOMPTES = 111;

    const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                     'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    // =========================================================================
    //  LECTURE DES TABLEAUX FOXYZ
    // =========================================================================

    /**
     * Récupère un tableau Foxyz en GET et renvoie le document HTML parsé.
     * input_s0 vide = aucun filtre d'état = TOUTES les lignes.
     * (Si input_s0 n'est pas transmis du tout, Foxyz applique son filtre par
     *  défaut ";22;" qui ne renvoie que les factures en cours.)
     */
    async function lireTableau(idTableau) {
        const base = location.origin + location.pathname.replace(/\/Interfaces\/.*$/, '');

        // Paramètres neutralisés explicitement :
        //   etat_group_foxyz  = regroupement  (le plus dangereux, voir ci-dessous)
        //   etat_somme_foxyz  = sommes
        //   etat_champs_foxyz = tri
        // Un regroupement actif fait ADDITIONNER par Foxyz toutes les colonnes
        // numériques du groupe — y compris le n° de facture, l'id du commercial
        // et les dates. Le total du CA devient alors faux sans aucun signal.
        // Ces paramètres sont des paramètres de LECTURE : ils n'enregistrent
        // rien et ne modifient pas la configuration de l'utilisateur.
        const url = `${base}/Tableaux/_tableau_general.php` +
                    `?id_tableau_foxyz=${idTableau}` +
                    `&input_s0=` +
                    `&etat_group_foxyz=` +
                    `&etat_somme_foxyz=` +
                    `&etat_champs_foxyz=`;

        const reponse = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (!reponse.ok) {
            throw new Error(`Foxyz a répondu ${reponse.status} à la lecture du tableau ${idTableau}.`);
        }

        // DOMParser n'exécute aucun script : on lit le HTML sans l'injecter dans la page.
        return new DOMParser().parseFromString(await reponse.text(), 'text/html');
    }

    /**
     * Repère les colonnes par leur id_foxyz_champ et renvoie { table, index }.
     * Lève une erreur lisible listant les colonnes absentes.
     */
    function repererColonnes(doc, champs, nomTableau) {
        const table = doc.querySelector('.tableau_data table') || doc.querySelector('table');
        if (!table) {
            throw new Error(`Impossible de trouver le tableau « ${nomTableau} » dans la réponse de Foxyz.`);
        }

        const entetes = table.querySelectorAll('thead th');
        if (!entetes.length) {
            throw new Error(`Le tableau « ${nomTableau} » ne contient aucun en-tête de colonne.`);
        }

        const index = {};
        const manquantes = [];

        for (const [nom, champ] of Object.entries(champs)) {
            let position = -1;
            entetes.forEach((th, i) => {
                if (position !== -1) return;
                // L'id du champ est porté par un descendant du <th> (icône de menu, filtre…)
                if (th.querySelector(`[id_foxyz_champ="${champ.id}"]`)) position = i;
            });
            if (position === -1) manquantes.push(champ.libelle);
            else index[nom] = position;
        }

        if (manquantes.length) {
            throw new Error(
                `Il manque des colonnes dans le tableau « ${nomTableau} » :\n\n` +
                manquantes.map(l => `  • ${l}`).join('\n') +
                "\n\nCe sont des colonnes à réafficher dans Foxyz " +
                "(Personnaliser → Mettre à jour les colonnes).\n" +
                "Préviens Bastien : c'est un réglage à remettre, pas une panne de l'outil."
            );
        }

        return { table, index };
    }

    /**
     * Extrait les lignes de données d'un tableau.
     *
     * ATTENTION — ne JAMAIS sauter la première ligne du <tbody>.
     * Foxyz place sa ligne d'indicateurs (sommes, moyennes) dans le <thead>,
     * pas dans le <tbody> : le corps du tableau ne contient que des données.
     * Un slice(1) supprimerait une vraie facture, et une facture n'ayant
     * qu'une seule ligne disparaîtrait entièrement du CA (bug corrigé en v1.3).
     *
     * On écarte les lignes parasites par leur contenu : un numéro de document
     * est toujours un entier simple. Une ligne de totaux (« : 4 224,00 ») ou
     * une ligne vide ne passe pas ce test.
     */
    function lireLignes(table, index, champs) {
        const nbColonnes = Object.keys(champs).length;

        return [...table.querySelectorAll('tbody tr')]
            .map(tr => {
                const cellules = [...tr.cells].map(td => td.innerText.trim());
                if (cellules.length < nbColonnes) return null;

                const ligne = {};
                for (const nom of Object.keys(index)) {
                    ligne[nom] = cellules[index[nom]];
                }
                ligne.totalHT    = nombre(ligne.totalHT);
                ligne.commercial = entier(ligne.commercial);
                return ligne;
            })
            .filter(l => l && /^\d+$/.test(l.numero) && l.numero !== '0');
    }

    // =========================================================================
    //  CONVERSIONS
    // =========================================================================

    /** "16 768,95" ou "-1 440,00" → 16768.95 / -1440. Espaces insécables compris. */
    function nombre(texte) {
        if (!texte || texte === '-') return 0;
        const valeur = parseFloat(String(texte).replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.'));
        return isNaN(valeur) ? 0 : valeur;
    }

    /** "3" → 3 ; "-" ou "" → 0 */
    function entier(texte) {
        const valeur = parseInt(String(texte).replace(/\D/g, ''), 10);
        return isNaN(valeur) ? 0 : valeur;
    }

    /**
     * Convertit une date Foxyz en nombre comparable AAAAMMJJ, ou null.
     * Gère "31/08/2026" (affichage) et "2026-08-31" (format brut), par sécurité.
     */
    function clefDate(texte) {
        if (!texte) return null;
        let m = String(texte).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) return +(m[3] + m[2] + m[1]);
        m = String(texte).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return +(m[1] + m[2] + m[3]);
        return null;
    }

    /** Renvoie { annee, mois } à partir d'une date Foxyz, ou null. */
    function moisDe(texte) {
        const clef = clefDate(texte);
        if (!clef) return null;
        return { annee: Math.floor(clef / 10000), mois: Math.floor(clef / 100) % 100 };
    }

    /** Nom affiché pour un id de salarié. */
    function nomSalarie(id) {
        if (COMMERCIAUX[id]) return COMMERCIAUX[id];
        if (AUTRES_SALARIES[id]) return AUTRES_SALARIES[id];
        if (!id) return 'Aucun commercial renseigné';
        return `Salarié inconnu (id ${id})`;
    }

    /**
     * Détecte un regroupement actif et refuse de produire un chiffre faux.
     *
     * Quand Foxyz regroupe, il additionne toutes les colonnes numériques du
     * groupe, dates comprises : deux factures de 2026 donnent une date en 2083,
     * trois en 2140, etc. Une date aberrante est donc la signature fiable d'une
     * agrégation, et elle se repère sans connaître le détail des données.
     *
     * Ce garde-fou double la neutralisation faite dans l'URL : si un jour Foxyz
     * renomme ses paramètres, le script s'arrêtera au lieu de mentir.
     */
    function verifierAgregation(lignes, nomTableau) {
        const anneeMax = new Date().getFullYear() + 1;
        const suspecte = lignes.find(l => {
            const d = moisDe(l.date);
            return d && (d.annee > anneeMax || d.annee < 2000);
        });

        if (suspecte) {
            throw new Error(
                `Les données du tableau « ${nomTableau} » semblent regroupées :\n` +
                `une date de ${moisDe(suspecte.date).annee} a été lue.\n\n` +
                "Quand un regroupement est actif, Foxyz additionne toutes les colonnes " +
                "chiffrées — montants, numéros de facture et dates — et le total du " +
                "chiffre d'affaires devient faux.\n\n" +
                "Dans Foxyz : ouvre le tableau, retire le regroupement, puis relance " +
                "l'export.\n\nAucun fichier n'a été généré."
            );
        }
    }

    /** Le client est-il hors périmètre commercial ? */
    function clientExclu(nom) {
        const propre = String(nom || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // retire les accents
            .toUpperCase().replace(/\s+/g, ' ').trim();
        return CLIENTS_EXCLUS.some(c => propre.startsWith(
            c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
        ));
    }

    /** Arrondi au centime. Les additions en virgule flottante produisent
     *  sinon des 139330.42999999996 disgracieux dans les cellules. */
    function arrondi(valeur) {
        return Math.round((valeur + Number.EPSILON) * 100) / 100;
    }

    /** Formatage monétaire pour les messages à l'écran. */
    function euros(valeur) {
        return valeur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    // =========================================================================
    //  TRAITEMENT MÉTIER
    // =========================================================================

    /**
     * Règles appliquées :
     *  - une facture = plusieurs lignes, mais le total HT est répété à
     *    l'identique : on DÉDOUBLONNE par numéro, on ne somme jamais les lignes ;
     *  - dans le tableau 91, les acomptes apparaissent comme des lignes vides
     *    (commande 0, total 0) : on les écarte, les vrais acomptes viennent du 111 ;
     *  - un acompte compte à son montant plein dans le mois où il est émis ;
     *  - une facture finale compte diminuée des acomptes de la même commande ;
     *  - un avoir (montant négatif) est déduit du CA de son commercial et listé
     *    en clair pour que la direction puisse en tenir compte ou non ;
     *  - tout document dont le commercial n'est pas dans COMMERCIAUX part en
     *    anomalie et n'entre pas dans le CA.
     */
    function traiter(lignesFactures, lignesAcomptes, annee, mois) {

        // --- 1. Dédoublonnage -------------------------------------------------
        const factures = new Map();
        let coquillesIgnorees = 0;

        for (const l of lignesFactures) {
            // Dans le tableau 91, une facture d'acompte apparaît comme une
            // coquille vide : montant à zéro et aucune commande rattachée.
            // Son vrai montant est dans le tableau 111, qu'on lit à part.
            const sansCommande = !l.commande || l.commande === '0' || l.commande === '-';
            if (l.totalHT === 0 && sansCommande) {
                coquillesIgnorees++;
                continue;
            }
            if (!factures.has(l.numero)) factures.set(l.numero, l);
        }

        const acomptes = new Map();
        for (const l of lignesAcomptes) {
            if (!acomptes.has(l.numero)) acomptes.set(l.numero, l);
        }

        // --- 2. Acomptes regroupés par commande (toutes périodes confondues) ---
        // Nécessaire pour déduire d'une facture finale les acomptes émis les
        // mois précédents.
        const acomptesParCommande = new Map();
        for (const a of acomptes.values()) {
            if (!a.commande || a.commande === '0') continue;
            if (!acomptesParCommande.has(a.commande)) acomptesParCommande.set(a.commande, []);
            acomptesParCommande.get(a.commande).push(a);
        }

        // --- 3. Structure de résultat ------------------------------------------
        const resultat = {
            parCommercial: {},
            avoirs: [],
            deductions: [],   // factures finales diminuées d'un ou plusieurs acomptes
            anomalies: [],
            exclus: [],       // clients hors perimetre commercial
            documentsDuMois: 0,
            coquillesIgnorees
        };

        for (const id of Object.keys(COMMERCIAUX)) {
            resultat.parCommercial[id] = {
                nom: COMMERCIAUX[id],
                caFactures: 0,   // factures finales, net d'acomptes
                caAcomptes: 0,
                avoirs: 0,
                net: 0,
                documents: []
            };
        }

        const estDuMois = (date) => {
            const d = moisDe(date);
            return d && d.annee === annee && d.mois === mois;
        };

        // --- 4. Factures finales et avoirs --------------------------------------
        for (const f of factures.values()) {
            if (!estDuMois(f.date)) continue;

            // Clients hors perimetre : ni CA, ni anomalie, juste tracabilite.
            if (clientExclu(f.client)) {
                resultat.exclus.push({ ...f, nature: f.totalHT < 0 ? 'Avoir' : 'Facture' });
                continue;
            }

            resultat.documentsDuMois++;

            const connu = Object.prototype.hasOwnProperty.call(COMMERCIAUX, f.commercial);
            const estAvoir = f.totalHT < 0;

            if (!connu) {
                resultat.anomalies.push({
                    numero: f.numero, commande: f.commande, date: f.date, client: f.client,
                    commercialNom: nomSalarie(f.commercial), montant: f.totalHT,
                    nature: estAvoir ? 'Avoir' : 'Facture',
                    motif: f.commercial
                        ? "Commercial hors liste des chargés d'affaires"
                        : "Aucun commercial renseigné sur la commande"
                });
                continue;
            }

            const bloc = resultat.parCommercial[f.commercial];

            if (estAvoir) {
                bloc.avoirs += f.totalHT;
                bloc.documents.push({ ...f, nature: 'Avoir', montantRetenu: f.totalHT });
                resultat.avoirs.push({ ...f, commercialNom: COMMERCIAUX[f.commercial] });
                continue;
            }

            // Déduction des acomptes DÉJÀ émis sur la même commande.
            // On exclut les acomptes postérieurs à la facture finale : ils
            // n'ont pas encore été comptés, les déduire creuserait le CA.
            const dateFacture = clefDate(f.date) || 0;
            const lies = (acomptesParCommande.get(f.commande) || [])
                .filter(a => (clefDate(a.date) || 0) <= dateFacture);
            const totalAcomptes = lies.reduce((s, a) => s + a.totalHT, 0);
            const montantRetenu = f.totalHT - totalAcomptes;

            if (lies.length) {
                resultat.deductions.push({
                    numero: f.numero, commande: f.commande, client: f.client,
                    commercialNom: COMMERCIAUX[f.commercial],
                    montantBrut: f.totalHT,
                    acomptes: lies.map(a => `n°${a.numero} (${euros(a.totalHT)})`).join(', '),
                    totalAcomptes,
                    montantRetenu
                });

                // Garde-fou : des acomptes supérieurs à la facture finale sont
                // le signe d'une saisie incohérente. On compte, mais on alerte.
                if (montantRetenu < 0) {
                    resultat.anomalies.push({
                        numero: f.numero, commande: f.commande, date: f.date, client: f.client,
                        commercialNom: COMMERCIAUX[f.commercial], montant: montantRetenu,
                        nature: 'Facture',
                        motif: `Acomptes (${euros(totalAcomptes)}) supérieurs à la facture finale (${euros(f.totalHT)}) — à vérifier`
                    });
                }
            }

            bloc.caFactures += montantRetenu;
            bloc.documents.push({
                ...f, nature: 'Facture', montantRetenu,
                acomptesDeduits: totalAcomptes
            });
        }

        // --- 5. Acomptes du mois -------------------------------------------------
        for (const a of acomptes.values()) {
            if (!estDuMois(a.date)) continue;

            if (clientExclu(a.client)) {
                resultat.exclus.push({ ...a, nature: 'Acompte' });
                continue;
            }

            resultat.documentsDuMois++;

            const connu = Object.prototype.hasOwnProperty.call(COMMERCIAUX, a.commercial);

            if (!connu) {
                resultat.anomalies.push({
                    numero: a.numero, commande: a.commande, date: a.date, client: a.client,
                    commercialNom: nomSalarie(a.commercial), montant: a.totalHT,
                    nature: 'Acompte',
                    motif: a.commercial
                        ? "Commercial hors liste des chargés d'affaires"
                        : "Aucun commercial renseigné sur la commande"
                });
                continue;
            }

            const bloc = resultat.parCommercial[a.commercial];

            // Un acompte négatif est un avoir sur acompte : même traitement.
            if (a.totalHT < 0) {
                bloc.avoirs += a.totalHT;
                bloc.documents.push({ ...a, nature: 'Avoir sur acompte', montantRetenu: a.totalHT });
                resultat.avoirs.push({ ...a, commercialNom: COMMERCIAUX[a.commercial] });
            } else {
                bloc.caAcomptes += a.totalHT;
                bloc.documents.push({ ...a, nature: 'Acompte', montantRetenu: a.totalHT });
            }
        }

        // --- 6. Totaux ------------------------------------------------------------
        for (const bloc of Object.values(resultat.parCommercial)) {
            bloc.caFactures = arrondi(bloc.caFactures);
            bloc.caAcomptes = arrondi(bloc.caAcomptes);
            bloc.avoirs     = arrondi(bloc.avoirs);
            bloc.net        = arrondi(bloc.caFactures + bloc.caAcomptes + bloc.avoirs); // avoirs déjà négatifs
        }

        return resultat;
    }

    // =========================================================================
    //  GÉNÉRATION DU FICHIER EXCEL
    // =========================================================================

    function genererExcel(resultat, annee, mois) {
        const libelleMois = `${MOIS_FR[mois - 1]} ${annee}`;
        const classeur = XLSX.utils.book_new();

        // ---------- Feuille 1 : RÉCAP ------------------------------------------
        const recap = [];
        recap.push([`Chiffre d'affaires facturé — ${libelleMois}`]);
        recap.push([`Extrait le ${new Date().toLocaleDateString('fr-FR')} — ${resultat.documentsDuMois} document(s) sur le mois`]);
        recap.push([]);
        recap.push(['Commercial', 'Factures finales (HT)', 'Acomptes (HT)', 'Avoirs (HT)', 'CA net (HT)', 'Nb documents']);

        let tFactures = 0, tAcomptes = 0, tAvoirs = 0;
        for (const bloc of Object.values(resultat.parCommercial)) {
            recap.push([bloc.nom, bloc.caFactures, bloc.caAcomptes, bloc.avoirs, bloc.net, bloc.documents.length]);
            tFactures += bloc.caFactures;
            tAcomptes += bloc.caAcomptes;
            tAvoirs   += bloc.avoirs;
        }
        recap.push(['TOTAL', arrondi(tFactures), arrondi(tAcomptes), arrondi(tAvoirs),
                    arrondi(tFactures + tAcomptes + tAvoirs), '']);

        recap.push([]);
        recap.push(["Les acomptes sont comptés dans le mois de leur émission. Les factures finales sont"]);
        recap.push(["diminuées des acomptes déjà émis sur la même commande, car elles portent le montant"]);
        recap.push(["total de la commande, acompte non déduit. Le détail de ces déductions figure ci-dessous."]);

        // Bloc déductions
        recap.push([]);
        recap.push([]);
        recap.push(['ACOMPTES DÉDUITS DES FACTURES FINALES']);
        if (resultat.deductions.length === 0) {
            recap.push(['Aucune facture finale du mois ne portait d\'acompte.']);
        } else {
            recap.push(['N° Facture', 'N° Commande', 'Client', 'Commercial',
                        'Montant facturé (HT)', 'Acomptes déjà comptés', 'Total déduit', 'Retenu au CA']);
            for (const d of resultat.deductions) {
                recap.push([d.numero, d.commande, d.client, d.commercialNom,
                            arrondi(d.montantBrut), d.acomptes,
                            arrondi(-d.totalAcomptes), arrondi(d.montantRetenu)]);
            }
        }

        // Bloc avoirs
        recap.push([]);
        recap.push([]);
        recap.push(['AVOIRS DU MOIS — déjà déduits du CA net ci-dessus']);
        if (resultat.avoirs.length === 0) {
            recap.push(['Aucun avoir sur ce mois.']);
        } else {
            recap.push(['N° Facture', 'N° Commande', 'Date', 'Client', 'Commercial', 'Montant HT']);
            for (const a of resultat.avoirs) {
                recap.push([a.numero, a.commande, a.date, a.client, a.commercialNom, a.totalHT]);
            }
            recap.push(['', '', '', '', 'Total avoirs', arrondi(tAvoirs)]);
        }

        // Bloc anomalies
        recap.push([]);
        recap.push([]);
        recap.push(['ANOMALIES — à vérifier, NON comptées dans le CA (sauf mention contraire)']);
        if (resultat.anomalies.length === 0) {
            recap.push(["Aucune anomalie. Tous les documents du mois sont rattachés à un chargé d'affaires."]);
        } else {
            recap.push(['N°', 'N° Commande', 'Date', 'Client', 'Rattaché à', 'Nature', 'Montant HT', 'Motif']);
            for (const a of resultat.anomalies) {
                recap.push([a.numero, a.commande, a.date, a.client, a.commercialNom,
                            a.nature, a.montant, a.motif]);
            }
        }

        // Bloc clients hors périmètre
        if (resultat.exclus.length) {
            recap.push([]);
            recap.push([]);
            recap.push(['HORS PÉRIMÈTRE COMMERCIAL — NON comptés dans le CA']);
            recap.push(["Ces clients n'ont pas de chargé d'affaires (ex. revente de copeaux). Listés pour information."]);
            recap.push(['N°', 'N° Commande', 'Date', 'Client', 'Nature', 'Montant HT']);
            let tExclus = 0;
            for (const e of resultat.exclus) {
                recap.push([e.numero, e.commande, e.date, e.client, e.nature, arrondi(e.totalHT)]);
                tExclus += e.totalHT;
            }
            recap.push(['', '', '', '', 'Total hors périmètre', arrondi(tExclus)]);
        }

        const feuilleRecap = XLSX.utils.aoa_to_sheet(recap);
        feuilleRecap['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 40 },
                                 { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 46 }];
        XLSX.utils.book_append_sheet(classeur, feuilleRecap, 'Récap');

        // ---------- Feuille 2 : DÉTAIL -------------------------------------------
        const detail = [['N°', 'N° Commande', 'Date', 'Client', 'Commercial',
                         'Nature', 'Montant facturé (HT)', 'Acomptes déduits', 'Retenu au CA (HT)']];

        const toutes = [];
        for (const [id, bloc] of Object.entries(resultat.parCommercial)) {
            for (const d of bloc.documents) {
                toutes.push([
                    d.numero, d.commande, d.date, d.client, COMMERCIAUX[id], d.nature,
                    arrondi(d.totalHT),
                    d.acomptesDeduits ? arrondi(-d.acomptesDeduits) : '',
                    arrondi(d.montantRetenu)
                ]);
            }
        }
        for (const a of resultat.anomalies) {
            toutes.push([a.numero, a.commande, a.date, a.client, a.commercialNom,
                         `${a.nature} — ANOMALIE`, a.montant, '', '']);
        }

        toutes.sort((x, y) => (clefDate(x[2]) || 0) - (clefDate(y[2]) || 0));
        detail.push(...toutes);

        const feuilleDetail = XLSX.utils.aoa_to_sheet(detail);
        feuilleDetail['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 13 }, { wch: 42 }, { wch: 20 },
                                  { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(classeur, feuilleDetail, 'Détail');

        const nomFichier = `CA_commerciaux_${annee}_${String(mois).padStart(2, '0')}.xlsx`;
        XLSX.writeFile(classeur, nomFichier);
        return nomFichier;
    }

    // =========================================================================
    //  INTERFACE
    // =========================================================================

    const ID_PANNEAU = 'fzca_panneau';

    function construirePanneau() {
        const existant = document.getElementById(ID_PANNEAU);
        if (existant) return existant;

        const panneau = document.createElement('div');
        panneau.id = ID_PANNEAU;
        panneau.style.cssText = `
            position: fixed; bottom: 200px; right: 20px; z-index: 99999;
            width: 340px; background: #fff; border: 2px solid #CB4315;
            border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.25);
            font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #222;
            display: none;
        `;

        // Les 18 derniers mois, le mois précédent en tête.
        const maintenant = new Date();
        const options = [];
        for (let i = 1; i <= 18; i++) {
            const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
            const valeur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            options.push(`<option value="${valeur}">${MOIS_FR[d.getMonth()]} ${d.getFullYear()}</option>`);
        }

        panneau.innerHTML = `
            <div style="background:#CB4315;color:#fff;padding:10px 12px;border-radius:5px 5px 0 0;
                        font-weight:bold;display:flex;justify-content:space-between;align-items:center;">
                <span>CA par commercial</span>
                <span id="fzca_fermer" style="cursor:pointer;font-size:18px;line-height:1;">&times;</span>
            </div>
            <div style="padding:14px;">
                <label style="display:block;margin-bottom:6px;font-weight:bold;">Mois à extraire</label>
                <select id="fzca_mois" style="width:100%;padding:7px;margin-bottom:12px;
                        border:1px solid #bbb;border-radius:4px;font-size:13px;">
                    ${options.join('')}
                </select>
                <button id="fzca_lancer" style="width:100%;padding:10px;background:#CB4315;color:#fff;
                        border:none;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer;">
                    Générer le fichier Excel
                </button>
                <div id="fzca_message" style="margin-top:12px;font-size:12px;line-height:1.5;
                     white-space:pre-wrap;"></div>
            </div>
        `;

        document.body.appendChild(panneau);
        panneau.querySelector('#fzca_fermer').onclick = () => { panneau.style.display = 'none'; };
        panneau.querySelector('#fzca_lancer').onclick = lancerExtraction;
        return panneau;
    }

    function message(texte, couleur) {
        const zone = document.getElementById('fzca_message');
        if (zone) {
            zone.textContent = texte;
            zone.style.color = couleur || '#222';
        }
    }

    async function lancerExtraction() {
        const bouton = document.getElementById('fzca_lancer');
        const [annee, mois] = document.getElementById('fzca_mois').value.split('-').map(Number);

        bouton.disabled = true;
        bouton.textContent = 'Lecture en cours…';

        try {
            message('Lecture des factures…');
            const docFactures = await lireTableau(TABLEAU_FACTURES);
            const f = repererColonnes(docFactures, CHAMPS_FACTURES, 'Lignes des factures');
            const lignesFactures = lireLignes(f.table, f.index, CHAMPS_FACTURES);
            verifierAgregation(lignesFactures, 'Lignes des factures');

            message('Lecture des acomptes…');
            const docAcomptes = await lireTableau(TABLEAU_ACOMPTES);
            const a = repererColonnes(docAcomptes, CHAMPS_ACOMPTES, "Lignes des factures d'acompte");
            const lignesAcomptes = lireLignes(a.table, a.index, CHAMPS_ACOMPTES);
            verifierAgregation(lignesAcomptes, "Lignes des factures d'acompte");

            if (lignesFactures.length === 0) {
                throw new Error("Aucune ligne de facture n'a été lue. Le tableau est peut-être vide, ou sa structure a changé.");
            }

            const resultat = traiter(lignesFactures, lignesAcomptes, annee, mois);

            if (resultat.documentsDuMois === 0) {
                message(`Aucun document trouvé pour ${MOIS_FR[mois - 1]} ${annee}.\n` +
                        `${lignesFactures.length} ligne(s) de facture et ${lignesAcomptes.length} ligne(s) ` +
                        `d'acompte lues au total, mais aucune sur ce mois.`, '#b00');
                return;
            }

            const nomFichier = genererExcel(resultat, annee, mois);

            let resume = `Fichier généré : ${nomFichier}\n\n`;
            for (const bloc of Object.values(resultat.parCommercial)) {
                resume += `${bloc.nom} : ${euros(bloc.net)} HT\n`;
            }
            if (resultat.deductions.length) resume += `\n${resultat.deductions.length} facture(s) diminuée(s) d'un acompte.`;
            if (resultat.avoirs.length)     resume += `\n${resultat.avoirs.length} avoir(s) déduit(s).`;
            if (resultat.anomalies.length)  resume += `\n⚠ ${resultat.anomalies.length} anomalie(s) à vérifier.`;

            message(resume, '#060');

        } catch (erreur) {
            console.error('[Export CA]', erreur);
            message('Impossible de générer le fichier.\n\n' + erreur.message, '#b00');
        } finally {
            bouton.disabled = false;
            bouton.textContent = 'Générer le fichier Excel';
        }
    }

    function ouvrirPanneau() {
        construirePanneau().style.display = 'block';
    }

    // =========================================================================
    //  RATTACHEMENT AU HUB
    // =========================================================================

    /**
     * Le hub (foxyz-hub.user.js) est propriétaire de window.__foxyz_hub__.
     * Il peut se charger après nous : on l'attend pendant 10 secondes.
     * Passé ce délai, bouton flottant de secours pour que l'outil reste
     * utilisable même si le hub n'est pas installé.
     */
    function connecterHub(outil) {
        const depart = Date.now();
        const minuteur = setInterval(function () {
            if (window.__foxyz_hub__) {
                clearInterval(minuteur);
                window.__foxyz_hub__.enregistrer(outil);
                console.log('[Foxyz-CA] enregistre dans le hub');
            } else if (Date.now() - depart > 10000) {
                clearInterval(minuteur);
                console.warn('[Foxyz-CA] Hub introuvable, bouton de secours active.');
                boutonDeSecours();
            }
        }, 200);
    }

    function boutonDeSecours() {
        if (document.getElementById('fzca_bouton')) return;
        const bouton = document.createElement('div');
        bouton.id = 'fzca_bouton';
        bouton.textContent = 'CA';
        bouton.title = 'Export CA par commercial';
        bouton.style.cssText = `
            position: fixed; bottom: 200px; right: 20px; z-index: 99998;
            width: 46px; height: 46px; border-radius: 50%; background: #CB4315;
            color: #fff; font: bold 15px Arial; display: flex;
            align-items: center; justify-content: center; cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,.3);
        `;
        bouton.onclick = ouvrirPanneau;
        document.body.appendChild(bouton);
    }

    connecterHub({
        id: 'export_ca',
        label: 'CA par commercial',
        icone: 'CA',
        onOpen: ouvrirPanneau
    });

})();
