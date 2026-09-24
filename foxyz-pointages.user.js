// ==UserScript==
// @name         Foxyz - Extraction pointages
// @namespace    mecanickel
// @version      0.8
// @description  Extrait le tableau "Activite du personnel" vers un JSON verifie
// @updateURL    https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-pointages.user.js
// @downloadURL  https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-pointages.user.js
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://*.gpao-foxyz.fr/ERP/Interfaces/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Lit le tableau "Activite du personnel" et produit un JSON verifie,
 * destine a la macro Excel de la paie.
 *
 * Rien ne s'affiche sur la page tant qu'on n'ouvre pas l'outil depuis le
 * menu du hub. Le panneau se ferme par sa propre croix. L'etat n'est pas
 * memorise, contrairement au panier de Push commande : reafficher des
 * resultats calcules sur une autre page serait trompeur.
 *
 * Diagnostic console : window.fzPointages() renvoie l'objet complet.
 */

(function () {
    'use strict';

    // ------------------------------------------------------------------
    // PARAMETRES
    // ------------------------------------------------------------------
    var SEUIL_ABERRANT = 16;      // heures/jour au-dela desquelles on alerte
    var TOLERANCE_TOTAL = 0.011;  // ecart max tolere entre total Foxyz et total recalcule
    var TOLERANCE_CUMUL = 0.05;   // ecart max tolere sur la somme de tous les salaries
    var COLONNES = ['pres', 'sup', 'abs', 'aff', 'prod'];

    // Une cellule est VIDE, ou elle est un nombre. Rien d'autre :
    // "9,46" ne doit surtout pas devenir 9.
    //
    // Deux ecritures acceptees, parce que Foxyz produit les deux :
    //   "9.46", "0.00", "247"      -> sans separateur
    //   "1 787.98", "2 006.95"     -> espace des milliers au-dela de 1000
    // L'espace insecable est deja ramene a un espace simple par
    // normaliserTexte. Les groupes doivent faire exactement 3 chiffres :
    // "1 23.5" reste refuse.
    var RE_NOMBRE = /^-?(?:\d{1,3}(?: \d{3})+|\d+)(?:\.\d+)?$/;

    // Deux natures d'anomalie, qui n'appellent pas la meme reaction :
    //   bloquant      -> le script a mal lu : donnees inexploitables
    //   avertissement -> le script a bien lu : c'est Foxyz qu'il faut corriger
    var GRAVITE = {
        valeur_illisible:   'bloquant',
        salarie_ignore:     'bloquant',
        total_absent:       'bloquant',
        colonne_finale_inconnue: 'avertissement',
        colonne_finale_non_verifiee: 'avertissement',
        total_divergent:    'bloquant',
        structure_ligne:    'bloquant',
        date_illisible:     'bloquant',
        nb_jours_divergent: 'bloquant',
        valeur_aberrante:   'avertissement',
        periode_non_close:  'avertissement'
    };

    // ------------------------------------------------------------------
    // OUTILS
    // ------------------------------------------------------------------

    // Normalise un libelle : espaces multiples reduits, bords coupes.
    // Couvre aussi l'espace insecable, que \s reconnait.
    function normaliserTexte(s) {
        return (s || '').replace(/\s+/g, ' ').trim();
    }

    // Formate une date en AAAA-MM-JJ dans le fuseau LOCAL.
    // toISOString() convertirait en UTC et reculerait d'un jour en France.
    function isoLocal(d) {
        var mois = String(d.getMonth() + 1);
        var jour = String(d.getDate());
        if (mois.length < 2) mois = '0' + mois;
        if (jour.length < 2) jour = '0' + jour;
        return d.getFullYear() + '-' + mois + '-' + jour;
    }

    // Dernier dimanche revolu : au-dela, la semaine est encore en cours
    // et les pointages du jour ne sont pas termines.
    function dernierDimancheRevolu() {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - (d.getDay() === 0 ? 7 : d.getDay()));
        return d;
    }

    // Lecture d'une cellule, avec verdict explicite.
    //   { valeur: 9.46, illisible: false, brut: '9.46' }  -> nombre
    //   { valeur: null, illisible: false, brut: '' }       -> cellule vide
    //   { valeur: null, illisible: true,  brut: '9,46' }   -> contenu refuse
    //
    // Vide et 0.00 n'ont PAS le meme sens metier :
    //   vide -> aucune saisie ce jour-la   -> null
    //   0.00 -> journee enregistree a zero -> 0
    function lireCellule(cellule) {
        if (!cellule) return { valeur: null, illisible: false, brut: '' };
        var txt = normaliserTexte(cellule.textContent);
        if (txt === '') return { valeur: null, illisible: false, brut: '' };
        if (!RE_NOMBRE.test(txt)) return { valeur: null, illisible: true, brut: txt };
        return { valeur: parseFloat(txt.replace(/ /g, '')), illisible: false, brut: txt };
    }

    // "01/09/26" -> "2026-09-01"
    function dateVersIso(txt) {
        var m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(normaliserTexte(txt));
        if (!m) return null;
        return '20' + m[3] + '-' + m[2] + '-' + m[1];
    }

    // "01-09-2026" (champ de filtre Foxyz) -> "2026-09-01"
    function dateFiltreVersIso(txt) {
        var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(normaliserTexte(txt));
        if (!m) return null;
        return m[3] + '-' + m[2] + '-' + m[1];
    }

    var JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    function jourSemaine(iso) {
        var p = iso.split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        return JOURS[d.getDay()];
    }

    // Arrondi au centieme : evite 5.9599999999999982 dans le JSON.
    function arrondi(n) {
        return Math.round(n * 100) / 100;
    }

    // ------------------------------------------------------------------
    // LOCALISATION DU TABLEAU
    // ------------------------------------------------------------------

    // On ne se fie pas a un index fige : on cherche le tableau qui contient
    // un thead avec une cellule "Date" et une cellule "Pres.".
    function trouverTableau(doc) {
        var tables = doc.querySelectorAll('table');
        for (var i = 0; i < tables.length; i++) {
            var tb = tables[i];
            if (!tb.tHead || tb.rows.length < 4) continue;
            var t0 = normaliserTexte(tb.rows[0].textContent);
            var t1 = tb.rows[1] ? normaliserTexte(tb.rows[1].textContent) : '';
            if (t0.indexOf('Date') === 0 && t1.indexOf('Pres.') === 0) return tb;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // LECTURE DE L'EN-TETE : qui est ou
    // ------------------------------------------------------------------

    // Parcourt la ligne des noms en cumulant les colspan.
    // Retourne [{ nom, id_employe, colDebut }] pour les vrais salaries.
    //
    // Le tableau se termine par la colonne de totaux de Foxyz : elle
    // occupe elle aussi 5 colonnes et n'a pas d'onclick, donc rien ne la
    // distingue d'un salarie dont l'onclick serait casse.
    //
    // On ne la reconnait ni a son libelle (Foxyz peut la renommer) ni a
    // sa position (un salarie pourrait s'y trouver), mais a ce qu'elle
    // CONTIENT : par definition, son total vaut la somme des totaux de
    // tous les salaries. Si l'addition tombe juste, c'est la colonne de
    // totaux. Sinon, c'est un salarie, et un salarie ne doit jamais
    // disparaitre en silence d'un export destine a la paie.
    function lireSalaries(table, anomalies) {
        var ligne = table.rows[0];
        var ligneTotaux = table.rows[2];
        var blocs = [];
        var col = 0;

        for (var i = 0; i < ligne.cells.length; i++) {
            var th = ligne.cells[i];
            var span = th.colSpan || 1;
            if (span === COLONNES.length) {
                var oc = th.getAttribute('onclick') || '';
                var m = /id_employe=(\d+)/.exec(oc);
                blocs.push({
                    nom: normaliserTexte(th.textContent),
                    id_employe: m ? Number(m[1]) : null,
                    colDebut: col
                });
            }
            col += span;
        }

        var identifies = blocs.filter(function (b) { return b.id_employe !== null; });
        var anonymes = blocs.filter(function (b) { return b.id_employe === null; });

        // Somme des totaux "Pres." de tous les salaries identifies.
        var cumul = 0;
        var cumulLisible = true;
        identifies.forEach(function (b) {
            var c = lireCellule(ligneTotaux.cells[b.colDebut]);
            if (c.valeur === null) cumulLisible = false;
            else cumul += c.valeur;
        });

        // Parmi les blocs sans identifiant, celui dont le total "Pres."
        // egale ce cumul est la colonne de totaux. Au plus un seul.
        var colonneTotaux = null;
        anonymes.forEach(function (b) {
            b.total = lireCellule(ligneTotaux.cells[b.colDebut]);
        });
        if (cumulLisible && identifies.length > 0) {
            for (var k = 0; k < anonymes.length; k++) {
                var ct = anonymes[k].total;
                if (ct.valeur !== null &&
                    Math.abs(ct.valeur - cumul) <= TOLERANCE_CUMUL) {
                    colonneTotaux = anonymes[k];
                    break;
                }
            }
        }

        anonymes.forEach(function (b) {
            if (b === colonneTotaux) {
                // Reconnue par l'arithmetique. Un libelle inattendu ne
                // remet pas la reconnaissance en cause, mais signale que
                // Foxyz a change quelque chose.
                if (b.nom.toLowerCase().indexOf('total') !== 0) {
                    anomalies.push({
                        type: 'colonne_finale_inconnue',
                        nom: b.nom,
                        motif: 'colonne de totaux reconnue par le calcul, libelle inattendu'
                    });
                }
                return;
            }
            // Sans cumul fiable, on ne peut pas trancher entre colonne de
            // totaux et salarie sans identifiant. On le dit, au lieu de
            // designer un salarie fantome. Ce cas suppose qu'un total de
            // salarie est deja illisible, donc un bloquant existe deja.
            if (!cumulLisible) {
                anomalies.push({
                    type: 'colonne_finale_non_verifiee',
                    nom: b.nom,
                    colonne_debut: b.colDebut,
                    motif: 'colonne sans id_employe : impossible de dire s\'il ' +
                           's\'agit de la colonne de totaux, un total de salarie ' +
                           'etant illisible'
                });
                return;
            }

            anomalies.push({
                type: 'salarie_ignore',
                nom: b.nom,
                colonne_debut: b.colDebut,
                motif: (b.total.illisible
                    ? 'aucun id_employe, et son propre total est illisible : "' +
                      b.total.brut + '"'
                    : (b.total.valeur === null
                        ? 'aucun id_employe, et son total est vide'
                        : 'aucun id_employe, et son total (' + b.total.valeur +
                          ') ne correspond pas au cumul des salaries (' +
                          arrondi(cumul) + ')'))
            });
        });

        var salaries = identifies.map(function (b) {
            return { nom: b.nom, id_employe: b.id_employe, colDebut: b.colDebut };
        });

        return { salaries: salaries, nbColonnes: col };
    }

    // Ligne 2 du thead : les totaux calcules par Foxyz. Meme indexation
    // que les lignes de donnees (cellule 0 = colonne Date, vide).
    function lireTotauxFoxyz(table, salaries, anomalies) {
        var ligne = table.rows[2];
        var res = {};
        salaries.forEach(function (s) {
            var t = {};
            COLONNES.forEach(function (nomCol, k) {
                var c = lireCellule(ligne.cells[s.colDebut + k]);
                if (c.illisible) {
                    anomalies.push({
                        type: 'valeur_illisible',
                        emplacement: 'ligne de totaux',
                        id_employe: s.id_employe,
                        nom: s.nom,
                        colonne: nomCol,
                        contenu: c.brut
                    });
                }
                t[nomCol] = c.valeur;
            });
            res[s.id_employe] = t;
        });
        return res;
    }

    // ------------------------------------------------------------------
    // EXTRACTION
    // ------------------------------------------------------------------

    function extraire(doc) {
        doc = doc || document;

        var table = trouverTableau(doc);
        if (!table) {
            return { erreur: 'Tableau de pointages introuvable. Es-tu bien sur la page "Activite du personnel" ?' };
        }

        var anomalies = [];

        var entete = lireSalaries(table, anomalies);
        var salaries = entete.salaries;
        if (salaries.length === 0) {
            return { erreur: 'Aucun salarie detecte dans l\'en-tete du tableau.' };
        }

        var totauxFoxyz = lireTotauxFoxyz(table, salaries, anomalies);

        // Prepare un accumulateur par salarie
        var donnees = {};
        salaries.forEach(function (s) {
            donnees[s.id_employe] = { jours: [], somme: {} };
            COLONNES.forEach(function (c) { donnees[s.id_employe].somme[c] = 0; });
        });

        // Lignes de donnees = celles du tbody
        var lignesDates = [];
        for (var i = 0; i < table.rows.length; i++) {
            var tr = table.rows[i];
            if (tr.parentElement && tr.parentElement.tagName === 'TBODY') lignesDates.push(tr);
        }

        lignesDates.forEach(function (tr) {
            var iso = dateVersIso(tr.cells[0] ? tr.cells[0].textContent : '');
            if (!iso) {
                anomalies.push({
                    type: 'date_illisible',
                    texte: normaliserTexte(tr.cells[0] ? tr.cells[0].textContent : '')
                });
                return;
            }

            // Garde-fou structurel : si le nombre de cellules ne correspond pas
            // a ce qu'annonce l'en-tete, le mappage des colonnes est fausse.
            if (tr.cells.length !== entete.nbColonnes) {
                anomalies.push({
                    type: 'structure_ligne',
                    date: iso,
                    cellules_attendues: entete.nbColonnes,
                    cellules_lues: tr.cells.length
                });
            }

            var jour = jourSemaine(iso);

            salaries.forEach(function (s) {
                var enr = { date: iso, jour: jour };
                COLONNES.forEach(function (nomCol, k) {
                    var c = lireCellule(tr.cells[s.colDebut + k]);
                    if (c.illisible) {
                        anomalies.push({
                            type: 'valeur_illisible',
                            emplacement: 'ligne de donnees',
                            id_employe: s.id_employe,
                            nom: s.nom,
                            date: iso,
                            colonne: nomCol,
                            contenu: c.brut
                        });
                    }
                    enr[nomCol] = c.valeur;
                    if (c.valeur !== null) donnees[s.id_employe].somme[nomCol] += c.valeur;
                });

                if (enr.pres !== null && enr.pres > SEUIL_ABERRANT) {
                    anomalies.push({
                        type: 'valeur_aberrante',
                        id_employe: s.id_employe,
                        nom: s.nom,
                        date: iso,
                        pres: enr.pres
                    });
                }

                donnees[s.id_employe].jours.push(enr);
            });
        });

        // --------------------------------------------------------------
        // CONTROLE : total recalcule contre total affiche par Foxyz
        // --------------------------------------------------------------
        var sortie = salaries.map(function (s) {
            var d = donnees[s.id_employe];
            var tf = totauxFoxyz[s.id_employe] || {};
            var recalc = {};
            COLONNES.forEach(function (c) { recalc[c] = arrondi(d.somme[c]); });

            // Trois verdicts possibles, jamais de faux "OK" :
            //   OK           -> compare et concordant
            //   DIVERGENT    -> compare et different
            //   NON_VERIFIE  -> total Foxyz absent ou illisible, donc
            //                   rien n'a pu etre compare. Un "OK" ici
            //                   serait un mensonge dangereux sur une paie.
            var divergent = false;
            var nonVerifie = false;

            COLONNES.forEach(function (c) {
                var attendu = tf[c];
                if (attendu === null || attendu === undefined) {
                    nonVerifie = true;
                    anomalies.push({
                        type: 'total_absent',
                        id_employe: s.id_employe,
                        nom: s.nom,
                        colonne: c,
                        total_recalcule: recalc[c]
                    });
                    return;
                }
                if (Math.abs(attendu - recalc[c]) > TOLERANCE_TOTAL) {
                    divergent = true;
                    anomalies.push({
                        type: 'total_divergent',
                        id_employe: s.id_employe,
                        nom: s.nom,
                        colonne: c,
                        total_foxyz: attendu,
                        total_recalcule: recalc[c]
                    });
                }
            });

            var controle = divergent ? 'DIVERGENT'
                         : (nonVerifie ? 'NON_VERIFIE' : 'OK');

            return {
                id_employe: s.id_employe,
                nom: s.nom,
                totaux_foxyz: tf,
                totaux_recalcules: recalc,
                controle: controle,
                jours: d.jours
            };
        });

        // --------------------------------------------------------------
        // PERIODE
        // --------------------------------------------------------------
        var chDebut = doc.getElementById('debut_creation_search');
        var chFin = doc.getElementById('fin_creation_search');
        var debut = chDebut ? dateFiltreVersIso(chDebut.value) : null;
        var fin = chFin ? dateFiltreVersIso(chFin.value) : null;

        var joursAttendus = null;
        if (debut && fin) {
            var d1 = new Date(debut), d2 = new Date(fin);
            joursAttendus = Math.round((d2 - d1) / 86400000) + 1;
            if (joursAttendus !== lignesDates.length) {
                anomalies.push({
                    type: 'nb_jours_divergent',
                    attendus: joursAttendus,
                    lus: lignesDates.length
                });
            }
        }

        // Semaine en cours : les pointages du jour ne sont pas fermes,
        // les heures paraitront incompletes.
        var limiteIso = isoLocal(dernierDimancheRevolu());
        if (fin && fin > limiteIso) {
            anomalies.push({
                type: 'periode_non_close',
                fin_demandee: fin,
                dernier_dimanche_revolu: limiteIso
            });
        }

        // --------------------------------------------------------------
        // STATUT
        // --------------------------------------------------------------
        anomalies.forEach(function (a) {
            a.gravite = GRAVITE[a.type] || 'bloquant';
        });

        var nbBloquants = anomalies.filter(function (a) {
            return a.gravite === 'bloquant';
        }).length;
        var nbAvertissements = anomalies.length - nbBloquants;

        var statut = nbBloquants > 0 ? 'ERREUR'
                   : (nbAvertissements > 0 ? 'A_VERIFIER' : 'OK');

        return {
            meta: {
                source: 'foxyz-pointages',
                version: '0.8',
                exporte_le: new Date().toISOString(),
                url: (doc.defaultView && doc.defaultView.location)
                     ? doc.defaultView.location.href : 'test://fixture',
                periode_debut: debut,
                periode_fin: fin,
                nb_jours_attendus: joursAttendus,
                nb_jours_lus: lignesDates.length,
                nb_salaries: sortie.length,
                statut: statut,
                nb_bloquants: nbBloquants,
                nb_avertissements: nbAvertissements
            },
            salaries: sortie,
            anomalies: anomalies
        };
    }

    // ------------------------------------------------------------------
    // TELECHARGEMENT
    // ------------------------------------------------------------------
    function telecharger(obj) {
        var nom = 'pointages_' + (obj.meta.periode_debut || 'export') +
                  '_' + (obj.meta.periode_fin || '') + '.json';
        var blob = new Blob([JSON.stringify(obj, null, 2)],
                            { type: 'application/json;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nom;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
            a.remove();
        }, 1000);
    }

    // ------------------------------------------------------------------
    // INTERFACE
    // ------------------------------------------------------------------
    function creerPanneau() {
        var p = document.createElement('div');
        p.id = 'fzp_panneau';
        p.style.cssText = 'position:fixed;bottom:140px;right:20px;width:360px;' +
            'max-height:60vh;overflow:auto;background:#fff;border:2px solid #CB4315;' +
            'border-radius:6px;padding:12px;z-index:99999;font:13px sans-serif;' +
            'box-shadow:0 2px 12px rgba(0,0,0,.25);display:none';
        document.body.appendChild(p);
        return p;
    }

    function texteAnomalie(a) {
        if (a.type === 'valeur_illisible') {
            return a.nom + (a.date ? ' le ' + a.date : ' (ligne de totaux)') +
                   ', colonne ' + a.colonne + ' : contenu "' + a.contenu +
                   '" non numerique';
        }
        if (a.type === 'salarie_ignore') {
            return 'Salarie "' + a.nom + '" sans identifiant : colonne non lue';
        }
        if (a.type === 'total_absent') {
            return a.nom + ', colonne ' + a.colonne +
                   ' : aucun total Foxyz lisible, controle impossible' +
                   ' (somme calculee ' + a.total_recalcule + ')';
        }
        if (a.type === 'colonne_finale_non_verifiee') {
            return 'Colonne "' + a.nom + '" non identifiee : un total de salarie ' +
                   'illisible empeche de verifier s\'il s\'agit de la colonne de totaux';
        }
        if (a.type === 'colonne_finale_inconnue') {
            return 'Derniere colonne du tableau nommee "' + a.nom +
                   '" : verifier qu\'il s\'agit bien de la colonne de totaux';
        }
        if (a.type === 'total_divergent') {
            return a.nom + ' : total ' + a.colonne + ' Foxyz ' + a.total_foxyz +
                   ' / recalcule ' + a.total_recalcule;
        }
        if (a.type === 'valeur_aberrante') {
            return a.nom + ' le ' + a.date + ' : ' + a.pres +
                   ' h - pointage probablement reste ouvert, a fermer dans Foxyz';
        }
        if (a.type === 'nb_jours_divergent') {
            return 'Jours attendus ' + a.attendus + ', lus ' + a.lus;
        }
        if (a.type === 'periode_non_close') {
            return 'La periode va jusqu\'au ' + a.fin_demandee +
                   ', au-dela du dernier dimanche revolu (' +
                   a.dernier_dimanche_revolu + '). La semaine en cours est incomplete.';
        }
        if (a.type === 'structure_ligne') {
            return 'Ligne ' + a.date + ' : ' + a.cellules_lues +
                   ' cellules au lieu de ' + a.cellules_attendues;
        }
        if (a.type === 'date_illisible') {
            return 'Date illisible : "' + a.texte + '"';
        }
        return a.type + ' ' + JSON.stringify(a);
    }

    function afficher(panneau, res) {
        panneau.innerHTML = '';
        panneau.style.display = 'block';

        function ligne(html, couleur) {
            var d = document.createElement('div');
            d.innerHTML = html;
            d.style.margin = '3px 0';
            if (couleur) d.style.color = couleur;
            panneau.appendChild(d);
        }

        if (res.erreur) {
            ligne('<b>Erreur</b>', '#b00');
            ligne(res.erreur);
            return;
        }

        var st = res.meta.statut;

        ligne('<b>Extraction pointages</b>');
        ligne('Periode : ' + res.meta.periode_debut + ' au ' + res.meta.periode_fin);
        ligne('Jours lus : ' + res.meta.nb_jours_lus +
              (res.meta.nb_jours_attendus ? ' / ' + res.meta.nb_jours_attendus : ''));
        ligne('Salaries : ' + res.meta.nb_salaries);

        if (st === 'OK') {
            ligne('<b>Controle des totaux : OK</b>', '#0a7');
        } else if (st === 'ERREUR') {
            ligne('<b>LECTURE INCORRECTE - ne pas utiliser ce fichier</b>', '#b00');
            ligne('Le script n\'a pas lu le tableau correctement.', '#b00');
        } else {
            ligne('<b>Lecture correcte, donnees Foxyz a corriger</b>', '#c60');
        }

        function listerAnomalies(gravite, titre, couleur) {
            var lot = res.anomalies.filter(function (a) { return a.gravite === gravite; });
            if (lot.length === 0) return;
            ligne('<u>' + titre + '</u>', couleur);
            var vus = {};
            var affichees = 0;
            lot.forEach(function (a) {
                var cle = a.type + (a.nom || '') + (a.date || '') + (a.colonne || '');
                if (vus[cle]) return;
                vus[cle] = true;
                affichees++;
                if (affichees > 15) return;
                ligne('&bull; ' + texteAnomalie(a), couleur);
            });
            if (affichees > 15) {
                ligne('... et ' + (affichees - 15) + ' autre(s), voir le JSON.', couleur);
            }
        }

        listerAnomalies('bloquant', 'Erreurs de lecture', '#b00');
        listerAnomalies('avertissement', 'A corriger dans Foxyz', '#c60');

        var bt = document.createElement('button');
        bt.textContent = 'Telecharger le JSON';
        bt.style.cssText = 'margin-top:10px;width:100%;padding:8px;background:#CB4315;' +
            'color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:13px';
        bt.onclick = function () { telecharger(res); };
        panneau.appendChild(bt);

        var fer = document.createElement('button');
        fer.textContent = 'Fermer';
        fer.style.cssText = 'margin-top:6px;width:100%;padding:6px;background:#eee;' +
            'border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px';
        fer.onclick = function () { panneau.style.display = 'none'; };
        panneau.appendChild(fer);
    }

    // ------------------------------------------------------------------
    // CONNECTEUR HUB (seul code lie au hub dans ce script)
    // ------------------------------------------------------------------
    function connecterHub(outil) {
        var t0 = Date.now();
        var t = setInterval(function () {
            if (window.__foxyz_hub__) {
                clearInterval(t);
                window.__foxyz_hub__.enregistrer(outil);
            } else if (Date.now() - t0 > 10000) {
                clearInterval(t);
                console.warn('[foxyz-pointages] Hub introuvable, outil non enregistre.');
            }
        }, 200);
    }

    // ------------------------------------------------------------------
    // DEMARRAGE
    // ------------------------------------------------------------------
    function demarrer() {
        // Le panneau existe des le chargement, mais reste cache : rien ne
        // doit apparaitre sur la page avant que l'outil soit ouvert.
        var panneau = creerPanneau();

        // Acces console pour diagnostic manuel : window.fzPointages()
        window.fzPointages = extraire;

        connecterHub({
            id: 'pointages',
            label: 'Pointages',
            icone: 'RH',
            onOpen: function () {
                afficher(panneau, extraire());
            }
        });

        console.log('[foxyz-pointages] v0.8 prete. window.fzPointages() pour un test console.');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(demarrer, 500);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(demarrer, 500);
        });
    }

    // Export pour le banc de test Node (ignore dans le navigateur)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { extraire: extraire, lireCellule: lireCellule, isoLocal: isoLocal };
    }
})();
