// ==UserScript==
// @name         Foxyz — Suivi OF (pense-bête CF)
// @namespace    mecanickel
// @version      1.3.3
// @updateURL    https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-suivi-of.user.js
// @downloadURL  https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-suivi-of.user.js
// @description  Tableau des OF en cours par commercial : besoins, CF rattachées, consultations, CF non rattachées et pistes, alertes. LECTURE SEULE.
// @author       Bastien BARBIER
// @match        https://mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * ============================================================================
 *  LECTURE SEULE — ce script n'écrit RIEN dans Foxyz.
 *  Uniquement des GET (fonction lireGET, seule fonction réseau du script) :
 *    - ../Tableaux/_liste_ordre_fabrication.php             (OF en cours)
 *    - ../Tableaux/_tableau_general.php?id_tableau_foxyz=9   (lignes de commande)
 *    - ../Tableaux/_tableau_general.php?id_tableau_foxyz=14  (consultations : toutes + en attente)
 *    - ../Tableaux/_tableau_general.php?id_tableau_foxyz=15  (lignes de CF : toutes + « en cours »)
 *    - ../Tableaux/_tableau_general.php?id_tableau_foxyz=13  (articles fournisseurs : famille / type)
 *    - ../Formulaires/commande_fournisseur_reception.php?id_cf=N  (CF rattachées ou en cours : statut, délai)
 *    - ../Formulaires/commande_fournisseur_rapide.php?id_cf=N     (fiche CF : fournisseur, commentaire,
 *      affectation de chaque ligne, marqueur « Envoyé par mail » ; mise en cache dans le navigateur)
 *    - ../Formulaires/consultation.php?id_consultation=N          (affectations, marqueur « Envoyé par mail » ; mise en cache)
 *  Le HTML reçu est lu avec DOMParser (aucun script exécuté, rien injecté).
 *  Aucun POST vers Foxyz, aucun formulaire modifié, aucun bouton d'action cliqué.
 *  EXCEPTION v1.3 (choix de Bastien) : appelTodoist() fait des GET/POST vers
 *  https://api.todoist.com/api/v1 (projets, création de tâche), uniquement sur clic
 *  de l'utilisateur. Le mail passe par un lien mailto: (rien n'est envoyé par l'outil).
 *  Les liens ouvrent la fiche native dans un NOUVEL ONGLET : l'onglet charge
 *  Foxyz puis appelle ouvrir_popup_total(fiche), comme un clic de l'utilisateur.
 *  Réglages (alertes désactivées / ignorées) et caches : stockés dans le
 *  navigateur (localStorage), propres à chaque poste, jamais dans Foxyz.
 * ============================================================================
 *
 *  CHANGELOG
 *  1.3.3 - 2026-11-17 - Règle 6 (rouge, désactivable) : CF rattachée avec une ligne non
 *          clôturée, ou consultation en attente non transformée, jamais envoyée par mail
 *          (marqueur .mail_envoye absent de la fiche). Rien d'affiché pour les envoyées.
 *  1.3.2 - 2026-11-17 - Todoist : titre commençant par la commande (besoin : « Cde 177 —
 *          <besoin> » ; OF : « Cde 177 — OF 462 — client — repère ») ; échéance le
 *          lendemain à 9 h ; projet « Affaire » par défaut ; section « Achats
 *          fournisseurs » pour un besoin, « Projets » pour un OF (modifiables dans
 *          « Alertes ▾ »).
 *  1.3.1 - 2026-11-17 - Todoist : tâche d'OF réduite à une ligne (Cde / OF / client /
 *          repère), sans liste des points ; bouton « + Todoist » sur chaque besoin
 *          (« passer la CF pour … » si non couvert, « suivre la CF de … » sinon).
 *  1.3 - 2026-11-17 - Export des actions :
 *        - « ✉ mail » : ouvre la messagerie par défaut (lien mailto, sans destinataire)
 *          avec un mail pré-rempli (besoins traités ? point d'avancement ?) ;
 *        - « + Todoist » : crée une tâche par ligne via l'API Todoist v1 (jeton saisi
 *          par l'utilisateur dans « Alertes ▾ », gardé dans ce navigateur) ;
 *        - par ligne, ou par sélection (cases à cocher par ligne et par commande) ;
 *        - date du dernier mail / de la dernière tâche affichée sur la ligne.
 *  1.2.3 - 2026-11-17 - Règle 1 STRICTE (décision Bastien, remplace D1 laxiste) : chaque
 *          besoin doit avoir une ligne de CF rattachée de même référence d'article.
 *          Colonne Besoins : « ✓ CF n » ou « sans CF » par besoin, boutons stock /
 *          inutile sur chaque besoin non couvert.
 *  1.2.2 - 2026-11-17 - Retours de Bastien :
 *          - paliers d'urgence en JOURS OUVRÉS jusqu'à la date client : ≤ 6 (ou
 *            dépassée) niveau réel ; 7-21 au plus « À surveiller » ; 22-36
 *            « À anticiper » ; > 36 « Plus tard » ;
 *          - frais de port (type T13 « TRANSPORT SUR VENTES » ou libellé « FRAIS DE
 *            PORT ») ignorés : ni besoin, ni CF couvrante, ni CF en retard, ni
 *            CF non rattachée ;
 *          - onglet CF non rattachées : menu « Familles » (type d'article T13),
 *            4 familles cochées par défaut ; + 1 GET de T13 (articles fournisseurs) ;
 *          - session Foxyz expirée détectée (erreur claire, rien mis en cache) ;
 *            fiche CF vide en cache relue.
 *  1.2.1 - 2026-11-16 - Besoin : bouton « toujours » (article ignoré partout) remplacé par
 *          « inutile » (besoin ignoré sur cette ligne d'OF seulement, ex. pièce passée en
 *          sous-traitance). La raison (stock / inutile) est affichée sur le besoin barré.
 *  1.2 - 2026-11-16 - Retours de Bastien :
 *        - onglet « CF non rattachées » : lignes de CF sans affectation à un OF
 *          (ou à une phase invalide), avec PISTES de rattachement purement
 *          indicatives (n° de commande cité dans le commentaire de la CF, même
 *          article qu'un besoin, même fournisseur qu'une consultation liée) ;
 *          les pistes apparaissent aussi sur la ligne d'OF concernée ;
 *        - « ignorer » au niveau du BESOIN : pour cette ligne d'OF, ou pour
 *          l'article partout (matière prise en stock) ;
 *        - compteurs cliquables pour filtrer par statut ;
 *        - horizon : une alerte dont la date client est à plus de 2 semaines
 *          devient « À anticiper » (2 à 4 sem.) ou « Plus tard » (> 4 sem.).
 *  1.1 - 2026-11-16 - Nouvel onglet, lisibilité, regroupement par commande,
 *        alertes désactivables, toutes les consultations, repère de repli.
 *  1.0 - 2026-11-16 - Association ligne de CF <-> OF par l'affectation.
 *  0.5 - 2026-11-16 - Première version complète.
 *
 *  RÈGLES D'ALERTE (décisions de Bastien, STOP 1 du 16/11/2026)
 *   1 ROUGE   besoin (non ignoré, hors frais de port) sans ligne de CF rattachée
 *             de même référence d'article
 *   2 ROUGE   ligne de CF rattachée non clôturée, délai négocié dépassé
 *   3 ORANGE  ligne de CF rattachée non clôturée, délai négocié postérieur à
 *             date client - 10 jours ouvrés (lun-ven hors fériés FR)
 *   4 ORANGE  consultation(s) liée(s) à la ligne, aucune transformée en CF
 *   5 INFO    ligne d'OF sans besoin et sans CF
 *  PALIERS (jours ouvrés jusqu'à la date client) : ≤ 6 niveau réel ; 7-21 au plus
 *  « À surveiller » ; 22-36 « À anticiper » ; > 36 « Plus tard ».
 *  FRAIS DE PORT : jamais pris en compte (ni besoin, ni CF).
 *
 *  PRÉREQUIS : colonnes affichées dans la vue de l'utilisateur
 *   T9  (Commandes)  : N° Commande, Prénom salarié, N° OF, Délai négocié ligne, N° Devis
 *                      (+ facultatif : Référence de la ligne de commande)
 *   T14 (Consult.)   : N° Consultation (+ facultatif : Entreprise)
 *   T15 (CF)         : N° Commande fournisseur, N° Consultation
 *  Le script le vérifie et s'arrête avec un message clair si une colonne manque.
 */

(function () {
  'use strict';

  var NL = String.fromCharCode(10);
  var COULEUR = '#CB4315';

  // ===== DEBUT LOGIQUE SUIVI OF
  // Bloc de fonctions pures (aucun accès réseau ni à la page), testé sous Node
  // par Outil Suivi OF Foxyz/tests/logique.test.js.

  var MARGE_JOURS_OUVRES = 10;
  // Paliers d'urgence, en JOURS OUVRÉS entre aujourd'hui et la date client :
  //   ≤ 6 (ou dépassée) : niveau réel (rouge = À traiter, orange = À surveiller)
  //   7 à 21            : au plus « À surveiller »
  //   22 à 36           : « À anticiper »
  //   > 36              : « Plus tard »
  var PALIER_TRAITER = 6;
  var PALIER_SURVEILLER = 21;
  var PALIER_ANTICIPER = 36;

  var REGLES = {
    1: 'Besoins sans CF rattachée',
    2: 'CF en retard',
    3: 'CF prévue trop tard',
    4: 'Consultation non transformée en CF',
    5: 'OF sans besoin',
    6: 'CF ou consultation jamais envoyée par mail'
  };

  var CHAMPS_T9 = {
    commande:   { id: 187, libelle: 'N° Commande' },
    commercial: { id: 65,  libelle: 'Prénom salarié' },
    of:         { id: 250, libelle: 'N° OF' },
    dateClient: { id: 208, libelle: 'Délai négocié pour la ligne de commande' },
    devis:      { id: 156, libelle: 'N° Devis' },
    refLigne:   { id: 4030, libelle: 'Référence de la ligne de commande', optionnel: true }
  };
  var CHAMPS_T14 = {
    consultation: { id: 395, libelle: 'N° Consultation' },
    entreprise:   { id: 2,   libelle: 'Entreprise / Raison sociale', optionnel: true }
  };
  var CHAMPS_T15 = {
    cf:           { id: 425,  libelle: 'N° Commande fournisseur' },
    consultation: { id: 4318, libelle: 'N° Consultation' }
  };
  var CHAMPS_T13 = {
    reference: { id: 352, libelle: 'Référence' },
    type:      { id: 353, libelle: 'Type' }
  };

  /** Familles (type d'article T13) cochées par défaut dans l'onglet CF non rattachées. */
  var FAMILLES_DEFAUT = [
    'SOUS TRAITANCE AUTRE',
    'FOURNITURE PIECES DETACHEES VENTES',
    'MATIERES NON STOCKEES AUTRE PLASTIQUE',
    'MATIERES NON STOCKEES PLASTIQUE'
  ];
  var FAMILLE_INCONNUE = '(famille inconnue)';

  /** Index référence d'article -> type (famille), depuis les lignes de T13. */
  function indexerTypes(lignesT13) {
    var t = {};
    (lignesT13 || []).forEach(function (l) {
      var ref = majuscule(l.reference);
      if (ref && l.type && !t[ref]) { t[ref] = majuscule(l.type); }
    });
    return t;
  }

  /** Famille d'un article : T13 par référence, sinon « (TYPE / FAMILLE / ) » du libellé de réception. */
  function familleArticle(reference, libelle, types) {
    var t = types && types[majuscule(reference)];
    if (t) { return t; }
    var m = String(libelle || '').match(/\(([^()\/]+)\s*\/[^()]*\/\s*\)\s*$/);
    return m ? majuscule(m[1]) : '';
  }

  /** Frais de port / transport (type « TRANSPORT SUR VENTES » ou libellé « FRAIS DE PORT ») : non pris en compte. */
  function estFraisDePort(reference, libelle, types) {
    if (/TRANSPORT/.test(familleArticle(reference, libelle, types))) { return true; }
    return /FRAIS\s+DE\s+PORT|TRANSPORT\s+SUR\s+VENTES/.test(majuscule(String(reference || '') + ' ' + String(libelle || '')));
  }

  function propre(s) {
    return String(s == null ? '' : s).replace(/[\s  ]+/g, ' ').trim();
  }

  function majuscule(s) { return propre(s).toUpperCase(); }

  /** "16/11/2026" ou "2026-11-16" -> Date locale (minuit) ou null. */
  function lireDate(texte) {
    var s = String(texte || '');
    var m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) { return new Date(+m[3], +m[2] - 1, +m[1]); }
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m && m[1] !== '0000') { return new Date(+m[1], +m[2] - 1, +m[3]); }
    return null;
  }

  function cleJour(d) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function formatDate(d) {
    if (!d) { return ''; }
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /** Nombre de jours calendaires de `a` à `b` (b - a). */
  function joursEntre(a, b) {
    var ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    var ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / 86400000);
  }

  /** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
  function paques(annee) {
    var a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(annee, mois - 1, jour);
  }

  function estFerie(d) {
    var a = d.getFullYear(), md = (d.getMonth() + 1) * 100 + d.getDate();
    if ([101, 501, 508, 714, 815, 1101, 1111, 1225].indexOf(md) !== -1) { return true; }
    var p = paques(a);
    var mobiles = [1, 39, 50].map(function (n) { return cleJour(new Date(a, p.getMonth(), p.getDate() + n)); });
    return mobiles.indexOf(cleJour(d)) !== -1;
  }

  function estOuvre(d) {
    var j = d.getDay();
    return j !== 0 && j !== 6 && !estFerie(d);
  }

  /** Jours ouvrés de `a` (exclu) à `b` (inclus) ; négatif si b est avant a. */
  function joursOuvresEntre(a, b) {
    var sens = cleJour(b) >= cleJour(a) ? 1 : -1;
    var d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var fin = cleJour(b), n = 0;
    while (cleJour(d) !== fin) {
      d.setDate(d.getDate() + sens);
      if (estOuvre(d)) { n += sens; }
    }
    return n;
  }

  /** Recule de n jours ouvrés. */
  function retirerJoursOuvres(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var reste = n;
    while (reste > 0) {
      d.setDate(d.getDate() - 1);
      if (estOuvre(d)) { reste--; }
    }
    return d;
  }

  /** Référence d'article d'un libellé « REF (DÉSIGNATION) ». */
  function refArticle(libelle) {
    return majuscule(String(libelle || '').split(' (')[0]);
  }

  /** Découpe le HTML d'une cellule sur les <br> et renvoie les morceaux texte non vides. */
  function morceauxCellule(td, doc) {
    return td.innerHTML.split(/<br\s*\/?>/i).map(function (h) {
      var tmp = doc.createElement('div');
      tmp.innerHTML = h;
      return propre(tmp.textContent);
    }).filter(Boolean);
  }

  function attrOnclick(el, re) {
    var nodes = [el].concat(Array.prototype.slice.call(el.querySelectorAll('[onclick]')));
    for (var i = 0; i < nodes.length; i++) {
      var m = (nodes[i].getAttribute('onclick') || '').match(re);
      if (m) { return m[1]; }
    }
    return '';
  }

  /**
   * Liste native des OF en cours. Colonnes fixes : on les repère par le libellé
   * de l'en-tête. La dernière colonne (en-tête « État ») contient les CF
   * rattachées à la ligne d'OF. Une ligne <tr id="ligne_of_N"> = une ligne d'OF.
   */
  function parserListeOF(doc) {
    var table = doc.querySelector('table');
    if (!table) { throw new Error('Liste des OF : aucun tableau dans la réponse de Foxyz.'); }
    var ths = table.querySelectorAll('thead tr:first-child th');
    var attendus = { of: /^OF\./, delai: /^Délai/, affectation: /^Affectation/, repere: /^Repère/, quantite: /^Quantité/, besoins: /^Besoins/ };
    var idx = {};
    Array.prototype.forEach.call(ths, function (th, i) {
      var t = propre(th.textContent);
      Object.keys(attendus).forEach(function (k) { if (idx[k] === undefined && attendus[k].test(t)) { idx[k] = i; } });
    });
    var manquants = Object.keys(attendus).filter(function (k) { return idx[k] === undefined; });
    if (manquants.length) {
      throw new Error('Liste des OF : colonnes introuvables (' + manquants.join(', ') + '). La présentation de Foxyz a changé : prévenir Bastien.');
    }
    idx.cf = ths.length - 1;

    var lignes = [];
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr[id^="ligne_of_"]'), function (tr) {
      var c = tr.cells;
      if (c.length < ths.length) { return; }
      var of = (propre(c[idx.of].textContent).match(/^\d+/) || [''])[0];
      if (!of) { return; }
      // Affectation : 3 <div> (commande / client / contact), pas de <br>.
      var aff = Array.prototype.map.call(c[idx.affectation].querySelectorAll(':scope > div'), function (x) { return propre(x.textContent); });
      if (!aff.length) { aff = morceauxCellule(c[idx.affectation], doc); }
      var cfs = [];
      Array.prototype.forEach.call(c[idx.cf].querySelectorAll('span[onclick]'), function (s) {
        var m = propre(s.textContent).match(/CF\.\s*(\d+)\s*:\s*(.*)$/);
        if (m) { cfs.push({ cf: m[1], libelle: propre(m[2]) }); }
      });
      var besoins = morceauxCellule(c[idx.besoins], doc).map(function (t) {
        var m = t.match(/^-\s*([\d\s.,]+?)\s+(\S+)\s+(.+)$/);
        var b = m ? { qte: propre(m[1]), unite: m[2], libelle: propre(m[3]) } : { qte: '', unite: '', libelle: t.replace(/^-\s*/, '') };
        b.reference = refArticle(b.libelle);
        b.cle = 'b:' + majuscule(b.libelle);
        b.cleArticle = 'a:' + b.reference;
        return b;
      });
      lignes.push({
        idLigne: tr.id.replace('ligne_of_', ''),
        of: of,
        idOf: attrOnclick(c[idx.of], /id_of=(\d+)/) || of,
        dateClient: lireDate(c[idx.delai].textContent),
        prio: (propre(c[idx.delai].textContent).match(/Prio\.\s*:\s*(\d+)/) || ['', ''])[1],
        commande: (propre(aff[0] || '').match(/Cde\.\s*(\d+)/) || ['', ''])[1],
        idCommande: attrOnclick(c[idx.affectation], /id_commande=(\d+)/),
        client: aff[1] || '',
        contact: aff[2] || '',
        repere: propre(c[idx.repere].textContent),
        quantite: propre(c[idx.quantite].textContent),
        besoins: besoins,
        cfs: cfs
      });
    });
    return lignes;
  }

  /**
   * Tableau général Foxyz : colonnes repérées par id_foxyz_champ, jamais par
   * position. Un champ { optionnel: true } absent ne bloque pas (valeur '').
   */
  function parserTableau(doc, champs, nomTableau) {
    var table = doc.querySelector('.tableau_data table') || doc.querySelector('table');
    if (!table) { throw new Error('Impossible de trouver le tableau « ' + nomTableau + ' » dans la réponse de Foxyz.'); }
    var ths = table.querySelectorAll('thead tr:first-child th');
    if (!ths.length) { ths = table.querySelectorAll('thead th'); }
    var index = {}, manquantes = [];
    Object.keys(champs).forEach(function (nom) {
      var pos = -1;
      Array.prototype.forEach.call(ths, function (th, i) {
        if (pos === -1 && th.querySelector('[id_foxyz_champ="' + champs[nom].id + '"]')) { pos = i; }
      });
      if (pos !== -1) { index[nom] = pos; } else if (!champs[nom].optionnel) { manquantes.push(champs[nom].libelle); }
    });
    if (manquantes.length) {
      throw new Error('Il manque des colonnes dans le tableau « ' + nomTableau + ' » : ' + manquantes.join(', ') +
        '. Les réafficher dans Foxyz (Personnaliser > colonnes). C\'est un réglage d\'affichage, pas une panne de l\'outil.');
    }
    // Ne jamais sauter la première ligne du tbody : les indicateurs sont dans le thead.
    var lignes = [];
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
      var c = tr.cells, l = {}, ok = true;
      Object.keys(champs).forEach(function (nom) {
        if (index[nom] === undefined) { l[nom] = ''; return; }
        if (!c[index[nom]]) { ok = false; return; }
        l[nom] = propre(c[index[nom]].textContent);
      });
      if (ok) { lignes.push(l); }
    });
    return lignes;
  }

  /** T9 -> index par n° OF : { commande, commercial, dateClient, devis, refLigne }. */
  function indexerT9(lignes) {
    var anneeMax = new Date().getFullYear() + 5;
    var parOF = {};
    lignes.forEach(function (l) {
      var d = lireDate(l.dateClient);
      if (d && (d.getFullYear() > anneeMax || d.getFullYear() < 2000)) {
        throw new Error('Le tableau des commandes semble regroupé (date lue : ' + l.dateClient + '). Retirer le regroupement dans Foxyz puis actualiser.');
      }
      if (/^\d+$/.test(l.of)) {
        parOF[l.of] = {
          commande: l.commande, commercial: l.commercial, dateClient: d,
          devis: /^\d+$/.test(l.devis) ? l.devis : '',
          refLigne: l.refLigne && l.refLigne !== '-' ? l.refLigne : ''
        };
      }
    });
    return parOF;
  }

  /** Fiche réception d'une CF (GET). Statut et délai par ligne. */
  function parserReceptionCF(doc, html) {
    var idCf = (doc.querySelector('#id_cf') || {}).value || '';
    var entete = (String(html || '').match(/margin-left:1em;['"]?>([^<]+)</) || ['', ''])[1];
    entete = propre(entete);
    var fournisseur = (entete.match(/\(([^()]*)\)\s*$/) || ['', ''])[1];
    var lignes = [];
    var n = 1;
    while (doc.querySelector('#id_ligne_commande_fournisseur_' + n)) {
      var article = propre((doc.querySelector('#id_article_fournisseur_commande_fournisseur_' + n) || {}).value);
      var souhaite = doc.querySelector('#date_cloture_prev_' + n);
      var negocie = doc.querySelector('#date_cloture_prev_four_' + n);
      var statut = '';
      var bloc = souhaite ? souhaite.closest('div[class*="fond"]') : null;
      if (bloc && bloc.children[1]) { statut = propre(bloc.children[1].textContent); }
      var mRef = article.match(/^\d+\s*:\s*(.*)\s\([^()]*\)\s*$/);
      lignes.push({
        idLigne: (doc.querySelector('#id_ligne_commande_fournisseur_' + n) || {}).value || '',
        article: article,
        reference: mRef ? propre(mRef[1]) : article.replace(/^\d+\s*:\s*/, ''),
        delaiSouhaite: lireDate(souhaite && souhaite.value),
        delaiNegocie: lireDate(negocie && negocie.value),
        statut: statut,
        cloturee: /clôtur|clotur/i.test(statut)
      });
      n++;
    }
    return { idCf: idCf, entete: entete, fournisseur: fournisseur, lignes: lignes };
  }

  /**
   * Fiche CF (commande_fournisseur_rapide.php, GET) : OF d'affectation de chaque
   * ligne de CF. Renvoie { idLigneCF: ['462', ...] }. Champ affectation_<n>_<k>
   * du type « LOP. 999 : OF. 462 FR. 881 / … ».
   */
  function parserAffectationsCF(doc) {
    var res = {};
    var n = 1;
    var champ;
    while ((champ = doc.querySelector('#id_ligne_commande_fournisseur_' + n))) {
      var ofs = [];
      Array.prototype.forEach.call(doc.querySelectorAll('input[id^="affectation_' + n + '_"]'), function (i) {
        var m = propre(i.value).match(/\bOF\.\s*(\d+)/);
        if (m && ofs.indexOf(m[1]) === -1) { ofs.push(m[1]); }
      });
      res[champ.value] = ofs;
      n++;
    }
    return res;
  }

  /**
   * Fiche CF complète (commande_fournisseur_rapide.php, GET) : fournisseur
   * (alias et raison sociale), référence, commentaire général, et pour chaque
   * ligne : article, référence, OF d'affectation, textes d'affectation.
   */
  /**
   * Marqueur d'envoi par mail d'une fiche CF (commande_fournisseur_rapide.php) ou
   * consultation : <b class="mail_envoye">Envoyé par mail le JJ/MM/AAAA hh:mm:ss (Prénom NOM)</b>.
   * Absent si le document n'a jamais été envoyé par Foxyz. Renvoie le texte, ou ''.
   */
  function parserEnvoiMail(doc) {
    var b = doc.querySelector('.mail_envoye');
    return b ? propre(b.textContent) : '';
  }

  function parserFicheCF(doc, idCf) {
    var ent = propre((doc.querySelector('#id_entreprise') || {}).value);
    var mEnt = ent.match(/^\d+\s*:\s*(.*?)\s*(?:\((.*)\))?\s*$/) || ['', ent, ''];
    var aff = parserAffectationsCF(doc);
    var lignes = [];
    var n = 1;
    var champ;
    while ((champ = doc.querySelector('#id_ligne_commande_fournisseur_' + n))) {
      var article = propre((doc.querySelector('#id_article_fournisseur_commande_fournisseur_' + n) || {}).value);
      var mRef = article.match(/^AF\.\s*\d+\s*:\s*(.*?)\s*\(/) || article.match(/^AF\.\s*\d+\s*:\s*(.*)$/);
      var textes = [];
      Array.prototype.forEach.call(doc.querySelectorAll('input[id^="affectation_' + n + '_"]'), function (i) {
        if (propre(i.value)) { textes.push(propre(i.value)); }
      });
      lignes.push({
        idLigne: champ.value,
        article: article.replace(/^AF\.\s*\d+\s*:\s*/, ''),
        reference: mRef ? majuscule(mRef[1]) : '',
        ofs: aff[champ.value] || [],
        affectations: textes
      });
      n++;
    }
    return {
      idCf: String(idCf || (doc.querySelector('#id_cf') || {}).value || ''),
      fournisseur: propre(mEnt[1]),
      raisonSociale: propre(mEnt[2] || ''),
      reference: propre((doc.querySelector('#reference_commande_fournisseur') || {}).value),
      commentaire: propre((doc.querySelector('#commentaire_general_commande_fournisseur') || {}).value),
      envoi: parserEnvoiMail(doc),
      lignes: lignes
    };
  }

  /**
   * Fiche consultation (GET) : cibles des affectations.
   *  « LOP. … : OF. 462 FR. … »           -> of
   *  « LC. … : Cde. 236 … »               -> commande
   *  « LD. 91 : DEV. 48 / CLIENT / DÉSIG » -> devis + désignation de la ligne de devis
   */
  function parserConsultation(doc) {
    var cibles = { of: [], commande: [], devis: [], lignesDevis: [], textes: [], envoi: parserEnvoiMail(doc) };
    function ajoute(t, v) { if (t.indexOf(v) === -1) { t.push(v); } }
    Array.prototype.forEach.call(doc.querySelectorAll('input[id^="affectation_"]'), function (i) {
      var v = propre(i.value);
      if (!v) { return; }
      cibles.textes.push(v);
      var m;
      if ((m = v.match(/\bOF\.\s*(\d+)/))) { ajoute(cibles.of, m[1]); }
      if ((m = v.match(/\bCde\.\s*(\d+)/i))) { ajoute(cibles.commande, m[1]); }
      if ((m = v.match(/\bDEV\.\s*(\d+)/))) {
        ajoute(cibles.devis, m[1]);
        var parts = v.split(' / ');
        cibles.lignesDevis.push({ devis: m[1], designation: propre(parts.slice(2).join(' / ')) });
      }
    });
    return cibles;
  }

  /**
   * Associe chaque CF citée par la liste OF (pour l'OF `of`) à une ligne de la
   * fiche réception : même référence (ou libellé contenu dans l'article) ET,
   * quand l'affectation des lignes est connue (r.affectations), ligne affectée
   * à cet OF. Une CF peut contenir plusieurs lignes de même article pour des OF
   * différents (ex. CF 376) : sans ce filtre, on jugerait la ligne d'un autre OF.
   */
  function associerLignesCF(cfsListe, receptions, of) {
    var utilisees = {};
    return cfsListe.map(function (c) {
      var r = receptions[c.cf];
      if (!r) { return { cf: c.cf, libelle: c.libelle, inconnue: true }; }
      if (r.erreur) { return { cf: c.cf, libelle: c.libelle, erreur: r.erreur }; }
      var lib = c.libelle.toUpperCase();
      var aff = r.affectations || null;
      function cherche(filtreOF) {
        var res = null;
        r.lignes.forEach(function (l, i) {
          var cle = c.cf + '#' + i;
          if (res || utilisees[cle]) { return; }
          if (filtreOF && aff && (aff[l.idLigne] || []).indexOf(of) === -1) { return; }
          if (l.reference.toUpperCase() === lib || l.article.toUpperCase().indexOf(lib) !== -1) {
            res = l; utilisees[cle] = true;
          }
        });
        return res;
      }
      var trouvee = (aff && of) ? cherche(true) : null;
      if (!trouvee) { trouvee = cherche(false); }
      return { cf: c.cf, libelle: c.libelle, fournisseur: r.fournisseur, envoi: r.envoi, ligne: trouvee, lignesCF: r.lignes };
    });
  }

  /** Affectation à une phase invalide (« FR. 0 » ou « FR. -1211 ») : Foxyz ne l'affiche nulle part. */
  function phaseInvalide(texte) {
    return /\bFR\.\s*(-\d+|0)\b/.test(String(texte || ''));
  }

  /**
   * Complète les CF de chaque ligne d'OF à partir des fiches CF.
   *
   * La colonne CF de la liste native des OF n'affiche QUE les lignes de CF non
   * clôturées (constaté sur PROD : CF 376, lignes clôturées des OF 753/754/755
   * absentes). Sans ce complément, un OF dont la matière est déjà reçue serait
   * signalé « besoins sans CF ». Les affectations des fiches CF (toutes, y compris
   * clôturées) sont la source complète.
   *
   * Pour chaque ligne de fiche CF affectée (phase valide) à un OF en cours, absente
   * de la liste OF : ajout à la ligne d'OF (si l'OF a plusieurs lignes : celles
   * dont un besoin a la même référence, sinon celle qui cite déjà la CF, sinon
   * toutes). Une CF non relue en réception (pas « en cours ») est clôturée.
   * Modifie lignesOF[].cfs et receptions (fiches de substitution). Renvoie le
   * nombre de rattachements ajoutés.
   */
  function rattacherDepuisFiches(lignesOF, fichesCF, ouvertes, receptions, types) {
    var parOF = {};
    lignesOF.forEach(function (l) { (parOF[l.of] = parOF[l.of] || []).push(l); });
    var ajouts = 0;
    Object.keys(fichesCF).forEach(function (idCf) {
      var f = fichesCF[idCf];
      if (!f || f.erreur || !f.lignes) { return; }
      f.lignes.forEach(function (lc) {
        if (estFraisDePort(lc.reference, lc.article, types)) { return; }
        lc.ofs.forEach(function (of) {
          var cands = parOF[of];
          if (!cands) { return; }
          var textes = lc.affectations.filter(function (t) { return t.indexOf('OF. ' + of + ' ') !== -1 || new RegExp('OF\\.\\s*' + of + '\\b').test(t); });
          if (textes.length && textes.every(phaseInvalide)) { return; }
          // Déjà présente dans la liste OF (ligne de CF en cours) ?
          var rec = receptions[idCf];
          var recLigne = rec && !rec.erreur && rec.lignes ? rec.lignes.filter(function (x) { return x.idLigne === lc.idLigne; })[0] : null;
          var cloturee = recLigne ? recLigne.cloturee : !ouvertes[idCf];
          var dejaListee = cands.some(function (l) { return l.cfs.some(function (c) { return c.cf === idCf; }); });
          if (dejaListee && !cloturee) { return; }
          var cibles = cands;
          if (cands.length > 1) {
            var parRef = cands.filter(function (l) { return lc.reference && l.besoins.some(function (b) { return b.reference === lc.reference; }); });
            var citant = cands.filter(function (l) { return l.cfs.some(function (c) { return c.cf === idCf; }); });
            cibles = parRef.length ? parRef : (citant.length ? citant : cands);
          }
          var lib = lc.reference || refArticle(lc.article);
          cibles.forEach(function (l) {
            if (l.cfs.some(function (c) { return c.cf === idCf && c.idLigneCF === lc.idLigne; })) { return; }
            l.cfs.push({ cf: idCf, libelle: lib, idLigneCF: lc.idLigne, depuisFiche: true });
            ajouts++;
          });
        });
      });
      // Fiche de substitution pour une CF non relue en réception : toutes lignes clôturées.
      if (!receptions[idCf]) {
        receptions[idCf] = {
          idCf: idCf, fournisseur: f.fournisseur, substitut: true,
          lignes: f.lignes.map(function (lc) {
            return { idLigne: lc.idLigne, article: lc.article, reference: lc.reference || refArticle(lc.article), delaiSouhaite: null, delaiNegocie: null, statut: 'CF clôturée', cloturee: true };
          })
        };
      }
      if (!receptions[idCf].erreur) {
        receptions[idCf].affectations = {};
        receptions[idCf].envoi = f.envoi;
        f.lignes.forEach(function (lc) { receptions[idCf].affectations[lc.idLigne] = lc.ofs; });
      }
    });
    return ajouts;
  }

  /** Les deux désignations commencent-elles l'une par l'autre (≥ 5 car.) ? */
  function memeDebut(a, b) {
    a = majuscule(a); b = majuscule(b);
    if (a.length < 5 || b.length < 5) { return false; }
    return a.indexOf(b) === 0 || b.indexOf(a) === 0;
  }

  /**
   * Consultations liées à chaque ligne d'OF. Liens Foxyz explicites uniquement :
   *  - affectation OF. N                   -> la ligne de cet OF ;
   *  - affectation Cde. N                  -> toutes les lignes de la commande ;
   *  - affectation DEV. N (ligne de devis) -> lignes de la commande issue du devis
   *    (T9 « N° Devis »). Si la commande a plusieurs lignes, on garde celles dont
   *    le repère / la référence de ligne commence comme la désignation de la ligne
   *    de devis ; si aucune ne correspond, toutes les lignes de la commande.
   * Renvoie { idLigne: [consultation, ...] }.
   */
  function lierConsultations(lignes, consultations) {
    var res = {};
    function ajoute(l, c) {
      res[l.idLigne] = res[l.idLigne] || [];
      if (res[l.idLigne].indexOf(c) === -1) { res[l.idLigne].push(c); }
    }
    consultations.forEach(function (c) {
      lignes.forEach(function (l) {
        if (c.cibles.of.indexOf(l.of) !== -1) { ajoute(l, c); }
        if (l.commande && c.cibles.commande.indexOf(l.commande) !== -1) { ajoute(l, c); }
      });
      (c.cibles.lignesDevis || []).forEach(function (ld) {
        var cands = lignes.filter(function (l) { return l.devis && l.devis === ld.devis; });
        if (!cands.length) { return; }
        var fines = cands.filter(function (l) { return memeDebut(l.repere, ld.designation) || memeDebut(l.refLigne, ld.designation); });
        (fines.length ? fines : cands).forEach(function (l) { ajoute(l, c); });
      });
    });
    return res;
  }

  /**
   * CF non rattachées et pistes de rattachement.
   * fichesCF   : { idCf: parserFicheCF(...) }
   * ouvertes   : { idCf: true } (CF « en cours », T15 état 18)
   * receptions : { idCf: parserReceptionCF(...) } (statut par ligne des CF lues)
   * lignes     : lignes d'OF construites (avec cfs, besoins, consultations, commande)
   *
   * Une ligne de CF est « non rattachée » si elle n'a aucune affectation à un OF,
   * ou si elle est affectée à un OF en cours sur une phase invalide (« FR. 0 »,
   * « FR. -1211 »). Les PISTES sont purement indicatives :
   * elles ne modifient aucune alerte et ne rattachent rien.
   *  - commentaire : un nombre du commentaire de la CF = n° d'une commande en cours ;
   *  - article     : même référence qu'un besoin d'une ligne d'OF ;
   *  - fournisseur : même fournisseur qu'une consultation liée à la ligne et non transformée.
   *  Ligne de CF clôturée : pistes retenues seulement si le commentaire cite la commande.
   * Renvoie { lignesCF: [...], pistesParLigne: { idLigneOF: [{ cf, raisons }] } }.
   */
  function analyserCFNonRattachees(fichesCF, ouvertes, receptions, lignes, types) {
    var ofEnCours = {}, cfVisibles = {}, parCommande = {};
    lignes.forEach(function (l) {
      ofEnCours[l.of] = true;
      (l.cfs || []).forEach(function (c) { cfVisibles[l.of + '|' + c.cf] = true; });
      (parCommande[l.commande] = parCommande[l.commande] || []).push(l);
    });
    var resultat = [], pistesParLigne = {};

    function ajoutePiste(l, cf, raison) {
      var t = pistesParLigne[l.idLigne] = pistesParLigne[l.idLigne] || [];
      var p = null;
      for (var i = 0; i < t.length; i++) { if (t[i].cf === cf) { p = t[i]; } }
      if (!p) { p = { cf: cf, raisons: [] }; t.push(p); }
      if (p.raisons.indexOf(raison) === -1) { p.raisons.push(raison); }
    }

    Object.keys(fichesCF).forEach(function (idCf) {
      var f = fichesCF[idCf];
      if (!f || f.erreur) { return; }
      var rec = receptions[idCf];
      var nombres = (f.commentaire.match(/\b\d{2,5}\b/g) || []);
      f.lignes.forEach(function (lc, i) {
        if (estFraisDePort(lc.reference, lc.article, types)) { return; }
        var motif = '';
        if (!lc.ofs.length) { motif = 'Aucune affectation'; }
        else if (lc.affectations.length && lc.affectations.every(phaseInvalide)) {
          var ofsEnCours = lc.ofs.filter(function (of) { return ofEnCours[of]; });
          if (ofsEnCours.length) { motif = 'Affectation à une phase invalide (OF ' + ofsEnCours.join(', ') + ')'; }
        }
        if (!motif) { return; }

        var statutLigne = rec && !rec.erreur && rec.lignes[i] && rec.lignes[i].idLigne === lc.idLigne ? rec.lignes[i] : null;
        var ouverte = !!ouvertes[idCf] && !(statutLigne && statutLigne.cloturee);
        var pistes = [];
        // Piste commentaire
        nombres.forEach(function (n) {
          (parCommande[n] || []).forEach(function (l) {
            if (!l.besoins.length) { return; }   // une ligne sans besoin n'attend pas de CF
            pistes.push({ type: 'commentaire', ligne: l, texte: 'commentaire « ' + n + ' » = Cde ' + n });
          });
        });
        // Piste article
        if (lc.reference) {
          lignes.forEach(function (l) {
            l.besoins.forEach(function (b) {
              if (b.reference === lc.reference) { pistes.push({ type: 'article', ligne: l, texte: 'même article que le besoin ' + b.reference }); }
            });
          });
        }
        // Piste fournisseur de consultation liée non transformée
        lignes.forEach(function (l) {
          (l.consultations || []).forEach(function (c) {
            if (c.transformee || !c.fournisseur) { return; }
            var fc = majuscule(c.fournisseur);
            if (fc && (fc === majuscule(f.fournisseur) || fc === majuscule(f.raisonSociale))) {
              pistes.push({ type: 'fournisseur', ligne: l, texte: 'même fournisseur que CONS. ' + c.numero });
            }
          });
        });
        // Ligne clôturée : beaucoup de CF historiques sans affectation (même matière,
        // même fournisseur). Pour éviter le bruit, on ne garde que les lignes d'OF
        // dont la commande est citée dans le commentaire ; les autres raisons
        // (article, fournisseur) s'y ajoutent alors en complément.
        if (!ouverte) {
          var citees = {};
          pistes.forEach(function (p) { if (p.type === 'commentaire') { citees[p.ligne.idLigne] = true; } });
          pistes = pistes.filter(function (p) { return citees[p.ligne.idLigne]; });
        }
        pistes.forEach(function (p) { ajoutePiste(p.ligne, idCf, p.texte); });

        resultat.push({
          cf: idCf, idLigne: lc.idLigne, fournisseur: f.fournisseur, referenceCF: f.reference,
          commentaire: f.commentaire, article: lc.article, reference: lc.reference,
          famille: familleArticle(lc.reference, statutLigne ? statutLigne.article : '', types) || FAMILLE_INCONNUE,
          affectations: lc.affectations, motif: motif, ouverte: ouverte,
          delai: statutLigne ? (statutLigne.delaiNegocie || statutLigne.delaiSouhaite) : null,
          pistes: pistes.map(function (p) { return { type: p.type, texte: p.texte, of: p.ligne.of, idOf: p.ligne.idOf, idLigneOF: p.ligne.idLigne, commande: p.ligne.commande }; })
        });
      });
    });
    resultat.sort(function (a, b) { return (+b.cf) - (+a.cf); });
    return { lignesCF: resultat, pistesParLigne: pistesParLigne };
  }

  var RANG = { ok: 0, info: 1, tard: 2, anticiper: 3, orange: 4, rouge: 5 };

  /**
   * Alertes d'une ligne d'OF (toutes, sans tenir compte des réglages).
   * Chaque motif : { regle: 1..6, cle, niveau, texte }. La clé identifie le motif
   * de façon stable pour « ignorer » (ex. 'r2:CF349:G-131-10-A'). Le motif de la
   * règle 1 porte la liste des besoins (ignorables un par un).
   */
  /**
   * Couverture besoin par besoin (règle 1 stricte, décision Bastien du 17/11) :
   * un besoin est couvert par une ligne de CF rattachée à la ligne d'OF ET de
   * même référence d'article (c'est ainsi que Foxyz range une ligne de CF sous
   * un besoin dans la revue de lancement). Plusieurs besoins de même référence
   * partagent la couverture. Renvoie un tableau aligné sur ligne.besoins :
   * liste des n° de CF qui couvrent chaque besoin (vide = non couvert).
   */
  function couvertureBesoins(ligne) {
    var parRef = {};
    (ligne.cfsAssociees || []).forEach(function (c) {
      var refs = [majuscule(c.libelle)];
      if (c.ligne && c.ligne.reference) { refs.push(majuscule(c.ligne.reference)); }
      refs.forEach(function (r) {
        if (!r) { return; }
        parRef[r] = parRef[r] || [];
        if (parRef[r].indexOf(c.cf) === -1) { parRef[r].push(c.cf); }
      });
    });
    // La référence peut contenir « ( » (ex. « SOUS TRAITANCE USINAGE (GENERIQUE) ») :
    // le besoin « REF (DÉSIG) » est aussi comparé par son début.
    var refs = Object.keys(parRef);
    return ligne.besoins.map(function (b) {
      var lib = majuscule(b.libelle);
      var res = (parRef[majuscule(b.reference)] || []).slice();
      refs.forEach(function (r) {
        if (lib === r || lib.indexOf(r + ' (') === 0) {
          parRef[r].forEach(function (cf) { if (res.indexOf(cf) === -1) { res.push(cf); } });
        }
      });
      return res;
    });
  }

  function calculerAlertes(ligne, aujourdhui, marge, types) {
    var m = marge === undefined ? MARGE_JOURS_OUVRES : marge;
    var motifs = [];
    function ajouter(regle, cle, n, texte, extra) {
      for (var i = 0; i < motifs.length; i++) { if (motifs[i].cle === cle) { return; } }
      var mo = { regle: regle, cle: cle, niveau: n, texte: texte };
      if (extra) { Object.keys(extra).forEach(function (k) { mo[k] = extra[k]; }); }
      motifs.push(mo);
    }
    var jour = cleJour(aujourdhui);
    // Frais de port : ni besoin à couvrir, ni CF qui couvre.
    var cfs = (ligne.cfsAssociees || []).filter(function (c) {
      var l = c.ligne;
      return !estFraisDePort(l ? l.reference : c.libelle, l ? l.article : c.libelle, types);
    });
    var couverture = couvertureBesoins(ligne);
    var besoins = ligne.besoins.filter(function (b) { return !estFraisDePort(b.reference, b.libelle, types); });
    var nonCouverts = ligne.besoins.filter(function (b, i) { return besoins.indexOf(b) !== -1 && !couverture[i].length; });

    if (nonCouverts.length) {
      ajouter(1, 'r1', 'rouge', nonCouverts.length === besoins.length
        ? (besoins.length > 1 ? 'Aucun des ' + besoins.length + ' besoins n\'a de CF' : 'Besoin sans CF rattachée')
        : nonCouverts.length + ' besoin(s) sur ' + besoins.length + ' sans CF', { besoins: nonCouverts, total: besoins.length });
    }
    if (!besoins.length && !cfs.length) { ajouter(5, 'r5', 'info', 'OF sans besoin'); }

    var limite = ligne.dateClient ? retirerJoursOuvres(ligne.dateClient, m) : null;
    cfs.forEach(function (c) {
      if (c.erreur || c.inconnue) {
        ajouter(2, 'r2:CF' + c.cf + ':illisible', 'orange', 'CF ' + c.cf + ' : fiche illisible, état inconnu (données incomplètes)');
        return;
      }
      var aJuger = c.ligne ? [c.ligne] : c.lignesCF;
      aJuger.forEach(function (l) {
        if (l.cloturee || estFraisDePort(l.reference, l.article, types)) { return; }
        var d = l.delaiNegocie || l.delaiSouhaite;
        var ref = l.reference || c.libelle;
        var nom = 'CF ' + c.cf + ' (' + ref + ')';
        if (!d) { ajouter(3, 'r3:CF' + c.cf + ':' + ref, 'orange', nom + ' : aucun délai renseigné'); return; }
        if (cleJour(d) < jour) {
          ajouter(2, 'r2:CF' + c.cf + ':' + ref, 'rouge', nom + ' en retard : délai ' + formatDate(d) + ' dépassé');
        } else if (limite && cleJour(d) > cleJour(limite)) {
          ajouter(3, 'r3:CF' + c.cf + ':' + ref, 'orange', nom + ' prévue le ' + formatDate(d) + ', après le ' + formatDate(limite) + ' (date client − ' + m + ' j. ouvrés)');
        }
      });
    });

    // Règle 6 : CF (avec une ligne non clôturée) ou consultation en attente jamais
    // envoyée par mail. envoi === '' : fiche lue, marqueur absent ; undefined : inconnu.
    var vues = {};
    cfs.forEach(function (c) {
      if (c.envoi !== '' || vues[c.cf]) { return; }
      var lignesCF = c.ligne ? [c.ligne] : (c.lignesCF || []);
      if (!lignesCF.some(function (l) { return !l.cloturee; })) { return; }
      vues[c.cf] = true;
      ajouter(6, 'r6:CF' + c.cf, 'rouge', 'CF ' + c.cf + (c.fournisseur ? ' (' + c.fournisseur + ')' : '') + ' jamais envoyée par mail');
    });
    (ligne.consultations || []).forEach(function (c) {
      if (!c.enAttente || c.transformee || !c.cibles || c.cibles.envoi !== '') { return; }
      ajouter(6, 'r6:CONS' + c.numero, 'rouge', 'CONS. ' + c.numero + (c.fournisseur ? ' (' + c.fournisseur + ')' : '') + ' jamais envoyée par mail');
    });

    var cons = ligne.consultations || [];
    if (cons.length && !cons.some(function (c) { return c.transformee; })) {
      ajouter(4, 'r4:' + cons.map(function (c) { return c.numero; }).join(','), 'orange',
        (cons.length > 1 ? 'Consultations ' : 'Consultation ') + cons.map(function (c) { return 'CONS. ' + c.numero; }).join(', ') + ' non transformée' + (cons.length > 1 ? 's' : '') + ' en CF');
    }
    return motifs;
  }

  /** Un besoin est-il ignoré (sur cette ligne, ou l'article partout) ? */
  function besoinIgnore(idLigne, b, ignores) {
    var ign = ignores || {};
    return !!(ign[idLigne + '|' + b.cle] || ign['*|' + b.cleArticle]);
  }

  /**
   * Horizon de la date client, en jours ouvrés : 0 = ≤ 6 (ou dépassée),
   * 1 = 7 à 21, 2 = 22 à 36, 3 = > 36.
   */
  function horizon(dateClient, aujourdhui) {
    if (!dateClient) { return 0; }
    var j = joursOuvresEntre(aujourdhui, dateClient);
    if (j > PALIER_ANTICIPER) { return 3; }
    if (j > PALIER_SURVEILLER) { return 2; }
    if (j > PALIER_TRAITER) { return 1; }
    return 0;
  }

  /**
   * Applique les réglages de l'utilisateur et l'horizon.
   * reglages = { regles: { 1: true|false, … }, ignores: { 'idLigne|cle': true, '*|a:REF': true } }
   * Renvoie { niveau (affiché), niveauBrut, actifs, ignores, desactives, besoinsIgnores }.
   */
  function appliquerReglages(idLigne, motifs, reglages, dateClient, aujourdhui) {
    var r = reglages || {};
    var regles = r.regles || {};
    var ign = r.ignores || {};
    var res = { niveau: 'ok', niveauBrut: 'ok', actifs: [], ignores: [], desactives: [], besoinsIgnores: 0 };
    motifs.forEach(function (mo) {
      if (regles[mo.regle] === false) { res.desactives.push(mo); return; }
      if (mo.regle === 1 && mo.besoins) {
        var restants = mo.besoins.filter(function (b) { return !besoinIgnore(idLigne, b, ign); });
        res.besoinsIgnores = mo.besoins.length - restants.length;
        if (!restants.length) { res.ignores.push({ regle: 1, cle: mo.cle, niveau: mo.niveau, texte: 'Besoins sans CF : tous ignorés', parBesoin: true }); return; }
        mo = { regle: 1, cle: mo.cle, niveau: mo.niveau, besoins: mo.besoins,
          texte: restants.length === mo.besoins.length ? mo.texte : restants.length + ' besoin(s) sans CF (' + res.besoinsIgnores + ' ignoré(s))' };
      } else if (ign[idLigne + '|' + mo.cle]) { res.ignores.push(mo); return; }
      res.actifs.push(mo);
      if (RANG[mo.niveau] > RANG[res.niveauBrut]) { res.niveauBrut = mo.niveau; }
    });
    res.niveau = res.niveauBrut;
    if ((res.niveau === 'rouge' || res.niveau === 'orange') && aujourdhui) {
      var h = horizon(dateClient, aujourdhui);
      if (h === 1) { res.niveau = 'orange'; } else if (h === 2) { res.niveau = 'anticiper'; } else if (h === 3) { res.niveau = 'tard'; }
    }
    return res;
  }

  /**
   * Prénom de l'utilisateur connecté. Source 1 : champ caché #id_employe_detail
   * (« Prénom NOM »). Source 2 : titre de page « ERP : Prénom NOM ».
   */
  function prenomUtilisateur(nomComplet, titre) {
    var n = propre(nomComplet);
    if (n) { return n.split(' ')[0]; }
    var m = String(titre || '').match(/^ERP\s*:\s*(\S+)/);
    return m ? m[1] : '';
  }

  /** Assemble les lignes finales (motifs bruts, sans réglages). */
  function construireLignes(lignesOF, parOF, receptions, consultations, aujourdhui, marge, types) {
    var lignes = lignesOF.map(function (l) {
      var t9 = parOF[l.of] || null;
      return {
        idLigne: l.idLigne, of: l.of, idOf: l.idOf, commande: l.commande, idCommande: l.idCommande,
        client: l.client, contact: l.contact, quantite: l.quantite, prio: l.prio,
        repere: l.repere || (t9 && t9.refLigne) || '',
        refLigne: t9 ? t9.refLigne : '',
        devis: t9 ? t9.devis : '',
        besoins: l.besoins,
        cfs: l.cfs,
        dateClient: l.dateClient || (t9 && t9.dateClient) || null,
        commercial: t9 ? (t9.commercial || 'Sans commercial') : 'Commande introuvable',
        cfsAssociees: associerLignesCF(l.cfs, receptions, l.of)
      };
    });
    var liens = lierConsultations(lignes, consultations || []);
    lignes.forEach(function (l) {
      l.consultations = liens[l.idLigne] || [];
      l.motifs = calculerAlertes(l, aujourdhui, marge, types);
    });
    return lignes;
  }

  /** Chemin de fiche autorisé pour l'ouverture en nouvel onglet (anti-injection). */
  function cheminFicheValide(chemin) {
    return /^\.\.\/Formulaires\/[a-z_]+\.php\?[a-z_]+=\d+$/.test(String(chemin || ''));
  }

  // ---------------------------------------------------------------- export (v1.3)

  var SAUT = String.fromCharCode(10);

  function isoJour(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /**
   * Résumé d'une ligne d'OF pour l'export : titre + points (alertes actives,
   * besoins sans CF non ignorés, CF en cours). `eff` = appliquerReglages(...).
   */
  function resumeExport(l, eff, ignores) {
    var titre = 'Cde ' + l.commande + ' / OF ' + l.of + ' — ' + (l.client || '?') +
      (l.repere ? ' — ' + l.repere : '') + (l.quantite ? ' (' + l.quantite + ')' : '');
    var points = [];
    (eff.actifs || []).forEach(function (m) {
      if (m.regle === 1) {
        m.besoins.filter(function (b) { return !besoinIgnore(l.idLigne, b, ignores); }).forEach(function (b) {
          points.push('Besoin sans CF : ' + (b.qte ? b.qte + ' ' + b.unite + ' ' : '') + b.libelle);
        });
      } else {
        points.push(m.texte);
      }
    });
    (l.cfsAssociees || []).forEach(function (c) {
      var lg = c.ligne;
      if (!lg || lg.cloturee) { return; }
      var d = lg.delaiNegocie || lg.delaiSouhaite;
      points.push('CF ' + c.cf + ' ' + (lg.reference || c.libelle) + ' en cours' + (c.fournisseur ? ' chez ' + c.fournisseur : '') + (d ? ', délai ' + formatDate(d) : ', sans délai'));
    });
    return { titre: titre, dateClient: l.dateClient ? formatDate(l.dateClient) : '', points: points };
  }

  /** Mail à un collaborateur : besoins traités ? point d'avancement ? */
  function corpsMail(resumes, signature) {
    var plusieurs = resumes.length > 1;
    var sujet = plusieurs
      ? 'Suivi de ' + resumes.length + ' OF : besoins et avancement'
      : 'Suivi ' + resumes[0].titre.split(' — ').slice(0, 2).join(' — ') + ' : besoins et avancement';
    var c = ['Bonjour,', '',
      'Peux-tu me confirmer que ' + (plusieurs ? 'les besoins ci-dessous ont' : 'le besoin ci-dessous a') +
        ' bien été traité' + (plusieurs ? 's' : '') + ' (commande fournisseur passée), et me faire un point sur l\'avancement ?', ''];
    resumes.forEach(function (r) {
      c.push('• ' + r.titre + (r.dateClient ? ' — date client ' + r.dateClient : ''));
      if (!r.points.length) { c.push('    - point d\'avancement'); }
      r.points.forEach(function (p) { c.push('    - ' + p); });
      c.push('');
    });
    c.push('Merci,');
    if (signature) { c.push(signature); }
    return { sujet: sujet, corps: c.join(SAUT) };
  }

  /** Lien mailto (sans destinataire : choisi dans la messagerie). */
  function urlMailto(sujet, corps) {
    return 'mailto:?subject=' + encodeURIComponent(sujet) + '&body=' + encodeURIComponent(corps);
  }

  var PRIORITE_TODOIST = { rouge: 4, orange: 3, anticiper: 2 };   // 4 = P1 dans Todoist

  function descriptionTodoist(lignes, resume, lienOF) {
    var desc = lignes.slice();
    if (resume.dateClient) { desc.push('Date client : ' + resume.dateClient); }
    if (lienOF) { desc.push('Ouvrir l\'OF dans Foxyz : ' + lienOF); }
    return desc.join(SAUT);
  }

  /** Échéance Todoist : lendemain 9 h (heure locale), en UTC RFC3339 (due_datetime). */
  function echeanceDemain9h(aujourdhui) {
    var d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + 1, 9, 0, 0);
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /**
   * Tâche Todoist (API v1) pour une ligne d'OF : une seule ligne commençant par
   * la commande (« Cde 177 — OF 462 — client — repère »), échéance lendemain 9 h.
   */
  function tacheTodoist(resume, niveau, aujourdhui, lienOF) {
    return {
      content: resume.titre.replace(' / OF ', ' — OF '),
      description: descriptionTodoist([], resume, lienOF),
      priority: PRIORITE_TODOIST[niveau] || 1,
      due_datetime: echeanceDemain9h(aujourdhui)
    };
  }

  /**
   * Tâche Todoist pour UN besoin : commence par la commande puis le nom du
   * besoin (« Cde 177 — 218703-3X8 (GOUPILLE …) »), échéance lendemain 9 h.
   */
  function tacheTodoistBesoin(resume, b, couvert, niveau, aujourdhui, lienOF) {
    var cde = resume.titre.split(' / ')[0];
    var ofClient = resume.titre.split(' — ').slice(0, 2).join(' — ').replace(/^Cde [^/]+\/ /, '');
    return {
      content: cde + ' — ' + b.libelle,
      description: descriptionTodoist([
        (couvert ? 'Suivre la CF de ' : 'Passer la CF pour ') + (b.qte ? b.qte + ' ' + b.unite + ' ' : '') + b.libelle,
        ofClient
      ], resume, lienOF),
      priority: couvert ? 1 : (PRIORITE_TODOIST[niveau] || 1),
      due_datetime: echeanceDemain9h(aujourdhui)
    };
  }

  /** Projet / section par défaut : premier nom qui correspond au motif (insensible à la casse). */
  function trouverParNom(liste, motif) {
    return (liste || []).filter(function (x) { return motif.test(String(x.name || '')); })[0] || null;
  }

  // ===== FIN LOGIQUE SUIVI OF

  if (typeof window === 'undefined' || typeof document === 'undefined') { return; }

  // =========================================================================
  //  STOCKAGE LOCAL (navigateur uniquement, jamais Foxyz)
  // =========================================================================

  var CLE_REGLAGES = 'foxyz_suivi_of_reglages_v1';
  var CLE_CONSULT = 'foxyz_suivi_of_consultations_v1';
  var CLE_FICHES_CF = 'foxyz_suivi_of_fiches_cf_v1';
  var DUREE_CACHE_CF = 7 * 86400000;

  function lireLocal(cle, defaut) {
    try { var v = window.localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch (e) { return defaut; }
  }
  function ecrireLocal(cle, valeur) {
    try { window.localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { console.warn('[Foxyz-suivi-of] stockage local impossible', e); }
  }

  var reglages = lireLocal(CLE_REGLAGES, null) || {};
  reglages.regles = reglages.regles || { 1: true, 2: true, 3: true, 4: true, 5: true };
  reglages.ignores = reglages.ignores || {};
  reglages.groupe = reglages.groupe || 'commande';
  reglages.familles = reglages.familles || {};   // famille -> true/false (absente = valeur par défaut)
  function familleCochee(f) {
    return reglages.familles[f] !== undefined ? !!reglages.familles[f] : FAMILLES_DEFAUT.indexOf(f) !== -1;
  }
  function sauverReglages() { ecrireLocal(CLE_REGLAGES, reglages); }

  // Todoist (v1.3) : jeton saisi par l'utilisateur, gardé dans CE navigateur seulement.
  var CLE_TODOIST = 'foxyz_suivi_of_todoist_v1';
  var CLE_ENVOIS = 'foxyz_suivi_of_envois_v1';
  var todoist = lireLocal(CLE_TODOIST, null) || { jeton: '', projet: '', projets: [] };
  function sauverTodoist() { ecrireLocal(CLE_TODOIST, todoist); }
  var envois = lireLocal(CLE_ENVOIS, null) || {};   // idLigne -> { mail: ts, todoist: ts }
  function noterEnvoi(idLigne, type) {
    envois[idLigne] = envois[idLigne] || {};
    envois[idLigne][type] = Date.now();
    ecrireLocal(CLE_ENVOIS, envois);
  }

  // =========================================================================
  //  RÉSEAU — lecture seule. lireGET est la SEULE fonction qui parle au serveur.
  // =========================================================================

  var MAX_PARALLELE = 3;
  var enCours = 0, file_attente = [];

  function base() {
    return location.origin + location.pathname.replace(/\/Interfaces\/.*$/, '');
  }

  function lireGET(chemin) {
    return new Promise(function (resolve, reject) {
      function lancer() {
        enCours++;
        fetch(base() + chemin, { method: 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function (r) {
            if (!r.ok) { throw new Error('Foxyz a répondu ' + r.status + ' (' + chemin.split('?')[0] + ')'); }
            return r.text();
          })
          .then(function (html) {
            // Session expirée : Foxyz répond 200 avec une page « Il faut être connecté ».
            // Sans ce contrôle, des fiches vides seraient lues et mises en cache.
            if (html.length < 2000 && /Il faut (&ecirc;|ê)tre connect/.test(html)) {
              throw new Error('session Foxyz expirée : reconnecte-toi puis clique sur Actualiser');
            }
            return html;
          })
          .then(resolve, reject)
          .then(function () {
            enCours--;
            if (file_attente.length) { file_attente.shift()(); }
          });
      }
      if (enCours < MAX_PARALLELE) { lancer(); } else { file_attente.push(lancer); }
    });
  }

  // =========================================================================
  //  TODOIST — SEULE requête d'écriture du script, et uniquement vers
  //  api.todoist.com (jamais vers Foxyz). Déclenchée par un clic de l'utilisateur.
  // =========================================================================

  var API_TODOIST = 'https://api.todoist.com/api/v1';

  function appelTodoist(methode, chemin, corps) {
    if (!todoist.jeton) { return Promise.reject(new Error('aucun jeton Todoist : le saisir dans « Alertes ▾ »')); }
    var opts = { method: methode, headers: { 'Authorization': 'Bearer ' + todoist.jeton }, credentials: 'omit' };
    if (corps) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(corps); }
    return fetch(API_TODOIST + chemin, opts).then(function (r) {
      if (r.status === 401 || r.status === 403) { throw new Error('jeton Todoist refusé (' + r.status + ')'); }
      if (!r.ok) { throw new Error('Todoist a répondu ' + r.status); }
      return r.json();
    });
  }

  function parser(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  var NEUTRE = '&etat_group_foxyz=&etat_somme_foxyz=&etat_champs_foxyz=';

  function urlTableau(id, etat) {
    return '/Tableaux/_tableau_general.php?id_tableau_foxyz=' + id + '&input_s0=' + (etat || '') + NEUTRE;
  }

  /** Consultations (cache navigateur ; relit les nouvelles et celles en attente). */
  async function chargerConsultations(get, progres, erreurs, toutRelire, docT15) {
    var r = await Promise.all([get(urlTableau(14, '')), get(urlTableau(14, ';21;'))]);
    var infos = {};
    parserTableau(parser(r[0]), CHAMPS_T14, 'Consultations').forEach(function (l) {
      if (/^\d+$/.test(l.consultation) && !infos[l.consultation]) { infos[l.consultation] = { fournisseur: l.entreprise }; }
    });
    var enAttente = {};
    parserTableau(parser(r[1]), CHAMPS_T14, 'Consultations en attente').forEach(function (l) {
      if (/^\d+$/.test(l.consultation)) { enAttente[l.consultation] = true; }
    });
    var cfsParCons = {};
    parserTableau(docT15, CHAMPS_T15, 'Commandes fournisseurs').forEach(function (l) {
      if (/^\d+$/.test(l.consultation)) {
        cfsParCons[l.consultation] = cfsParCons[l.consultation] || [];
        if (cfsParCons[l.consultation].indexOf(l.cf) === -1) { cfsParCons[l.consultation].push(l.cf); }
      }
    });

    var cache = toutRelire ? {} : lireLocal(CLE_CONSULT, {});
    var aLire = Object.keys(infos).filter(function (n) { return !cache[n] || enAttente[n]; });
    var faits = 0;
    await Promise.all(aLire.map(function (n) {
      return get('/Formulaires/consultation.php?id_consultation=' + n).then(function (html) {
        cache[n] = { cibles: parserConsultation(parser(html)), lu: Date.now() };
      }).catch(function (e) {
        erreurs.push('Consultation ' + n + ' : ' + e.message);
      }).then(function () {
        faits++;
        if (aLire.length > 20 && faits % 10 === 0) { progres('Lecture des consultations (' + faits + '/' + aLire.length + ') — mise en cache, une seule fois…'); }
      });
    }));
    Object.keys(cache).forEach(function (n) { if (!infos[n]) { delete cache[n]; } });
    ecrireLocal(CLE_CONSULT, cache);

    return Object.keys(infos).filter(function (n) { return cache[n]; }).map(function (n) {
      var cibles = cache[n].cibles;
      if (!cibles.lignesDevis) { cibles.lignesDevis = []; }
      return {
        numero: n, cibles: cibles, fournisseur: infos[n].fournisseur || '',
        enAttente: !!enAttente[n], cfs: cfsParCons[n] || [], transformee: !!cfsParCons[n]
      };
    });
  }

  /** Charge tout. Renvoie { lignes, cfNonRattachees, erreurs, avertissements, stats }. */
  async function charger(progres, toutRelire) {
    var erreurs = [], avert = [];
    var t0 = Date.now();
    var nbRequetes = 0;
    function get(u) { nbRequetes++; return lireGET(u); }

    progres('Lecture des OF en cours, des commandes et des CF…');
    var r = await Promise.all([
      get('/Tableaux/_liste_ordre_fabrication.php'), get(urlTableau(9, '')),
      get(urlTableau(15, '')), get(urlTableau(15, ';18;')),
      get(urlTableau(13, '')).catch(function (e) { return e; })
    ]);
    // Familles d'articles (T13 « Type ») : frais de port et filtre de l'onglet CF.
    var types = {};
    try {
      if (r[4] instanceof Error) { throw r[4]; }
      types = indexerTypes(parserTableau(parser(r[4]), CHAMPS_T13, 'Articles fournisseurs'));
    } catch (e) {
      avert.push('Familles d\'articles non lues (' + e.message + ') : frais de port reconnus au libellé seulement, filtre Familles limité.');
    }
    var lignesOF = parserListeOF(parser(r[0]));
    var parOF = indexerT9(parserTableau(parser(r[1]), CHAMPS_T9, 'Commandes clients (lignes)'));
    var docT15 = parser(r[2]);
    var tousCF = {}, ouvertes = {};
    parserTableau(docT15, CHAMPS_T15, 'Commandes fournisseurs').forEach(function (l) { if (/^\d+$/.test(l.cf)) { tousCF[l.cf] = true; } });
    parserTableau(parser(r[3]), CHAMPS_T15, 'Commandes fournisseurs en cours').forEach(function (l) { if (/^\d+$/.test(l.cf)) { ouvertes[l.cf] = true; } });

    var rattachees = {};
    lignesOF.forEach(function (l) { l.cfs.forEach(function (c) { rattachees[c.cf] = true; }); });

    // Fiches CF (affectations, commentaire) : cache. Relues si : absentes, en cours,
    // citées par la liste OF, anciennes (> 7 j), ou sans affectation alors que leur
    // commentaire cite une commande en cours (rattachement probablement imminent).
    var cacheCF = toutRelire ? {} : lireLocal(CLE_FICHES_CF, {});
    var maintenant = Date.now();
    var commandesEnCours = {};
    lignesOF.forEach(function (l) { commandesEnCours[l.commande] = true; });
    function aSurveiller(c) {
      if (!c.lignes || !c.lignes.some(function (lc) { return !lc.ofs.length; })) { return false; }
      return (String(c.commentaire || '').match(/\b\d{2,5}\b/g) || []).some(function (n) { return commandesEnCours[n]; });
    }
    var fichesALire = Object.keys(tousCF).filter(function (id) {
      var c = cacheCF[id];
      return !c || !c.lignes || !c.lignes.length || ouvertes[id] || rattachees[id] || (maintenant - (c.lu || 0)) > DUREE_CACHE_CF || aSurveiller(c);
    });
    // Fiches réception (statut et délai par ligne) : CF rattachées ou en cours.
    var receptionsALire = Object.keys(tousCF).filter(function (id) { return ouvertes[id] || rattachees[id]; });
    Object.keys(rattachees).forEach(function (id) { if (receptionsALire.indexOf(id) === -1) { receptionsALire.push(id); } });

    var total = fichesALire.length + receptionsALire.length, faits = 0;
    function avance() {
      faits++;
      if (faits % 5 === 0 || faits === total) {
        progres('Lecture des CF (' + faits + '/' + total + ')' + (fichesALire.length > 60 ? ' — mise en cache, une seule fois…' : '…'));
      }
    }
    var receptions = {};
    await Promise.all(receptionsALire.map(function (id) {
      return get('/Formulaires/commande_fournisseur_reception.php?id_cf=' + id).then(function (html) {
        receptions[id] = parserReceptionCF(parser(html), html);
      }).catch(function (e) {
        receptions[id] = { erreur: e.message };
        erreurs.push('CF ' + id + ' : ' + e.message);
      }).then(avance);
    }).concat(fichesALire.map(function (id) {
      return get('/Formulaires/commande_fournisseur_rapide.php?id_cf=' + id).then(function (html) {
        var f = parserFicheCF(parser(html), id);
        f.lu = Date.now();
        cacheCF[id] = f;
      }).catch(function (e) {
        if (rattachees[id]) { avert.push('CF ' + id + ' : affectations non lues (' + e.message + '), association par article seul'); }
        else { erreurs.push('Fiche CF ' + id + ' : ' + e.message); }
      }).then(avance);
    })));
    Object.keys(cacheCF).forEach(function (id) { if (!tousCF[id]) { delete cacheCF[id]; } });
    ecrireLocal(CLE_FICHES_CF, cacheCF);

    // Rattachements complets depuis les fiches CF (la liste OF n'affiche que les
    // lignes de CF non clôturées) + affectations pour l'association ligne <-> OF.
    var ajouts = rattacherDepuisFiches(lignesOF, cacheCF, ouvertes, receptions, types);

    var consultations = [];
    progres('Lecture des consultations…');
    try {
      consultations = await chargerConsultations(get, progres, erreurs, toutRelire, docT15);
    } catch (e) {
      avert.push('Consultations non vérifiées : ' + e.message);
    }

    progres('Calcul des alertes et des pistes…');
    var lignes = construireLignes(lignesOF, parOF, receptions, consultations, new Date(), MARGE_JOURS_OUVRES, types);
    var analyse = analyserCFNonRattachees(cacheCF, ouvertes, receptions, lignes, types);
    lignes.forEach(function (l) { l.pistes = analyse.pistesParLigne[l.idLigne] || []; });
    return {
      lignes: lignes, cfNonRattachees: analyse.lignesCF, erreurs: erreurs, avertissements: avert,
      stats: { requetes: nbRequetes, duree: Date.now() - t0, cf: Object.keys(tousCF).length, consultations: consultations.length, rattachementsFiches: ajouts }
    };
  }

  // =========================================================================
  //  NAVIGATION : fiches et outil dans un nouvel onglet
  // =========================================================================

  var HASH_FICHE = '#foxyz_fiche=';
  var HASH_OUTIL = '#foxyz_suivi_of';

  function urlInterfaces() {
    return base() + '/Interfaces/';
  }

  function urlOnglet(chemin) {
    return urlInterfaces() + HASH_FICHE + encodeURIComponent(chemin);
  }

  /** À l'arrivée dans un onglet ouvert par l'outil : ouvre la fiche demandée. */
  function traiterHash() {
    var h = location.hash || '';
    if (h.indexOf(HASH_FICHE) === 0) {
      var chemin = '';
      try { chemin = decodeURIComponent(h.slice(HASH_FICHE.length)); } catch (e) { chemin = ''; }
      history.replaceState(null, '', location.pathname + location.search);
      if (cheminFicheValide(chemin)) {
        setTimeout(function () { window.ouvrir_popup_total(chemin); }, 400);
      } else {
        console.warn('[Foxyz-suivi-of] fiche refusée :', chemin);
      }
    } else if (h === HASH_OUTIL) {
      setTimeout(function () { ouvrirPanneau(true); }, 200);
    }
  }

  // =========================================================================
  //  INTERFACE
  // =========================================================================

  var etat = {
    donnees: null, commercial: null, alertesSeules: false, recherche: '', tri: { col: 'date', sens: 1 },
    horodatage: null, deplies: {}, toutDeplie: false, ongletDedie: false, filtreNiveaux: {},
    vue: 'of', cfToutes: false, selection: {}, visibles: []
  };
  var refs = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var NIVEAUX = ['rouge', 'orange', 'anticiper', 'tard', 'info', 'ok'];
  var COULEURS_NIVEAU = { rouge: '#D32F2F', orange: '#EF6C00', anticiper: '#9E7C00', tard: '#607D8B', info: '#5C7A99', ok: '#2E7D32' };
  var FONDS_NIVEAU = { rouge: '#FDECEA', orange: '#FFF3E0', anticiper: '#FFF8DC', tard: '#ECEFF1', info: '#EEF2F6', ok: '#E8F5E9' };
  var LIBELLES_NIVEAU = { rouge: 'À traiter', orange: 'À surveiller', anticiper: 'À anticiper', tard: 'Plus tard', info: 'Info', ok: 'OK' };
  var AIDES_NIVEAU = {
    rouge: 'Alerte rouge, date client dans 6 jours ouvrés ou moins (ou dépassée)',
    orange: 'Alerte orange à 6 jours ouvrés ou moins, ou toute alerte à 7-21 jours ouvrés',
    anticiper: 'Alerte, date client dans 22 à 36 jours ouvrés',
    tard: 'Alerte, date client dans plus de 36 jours ouvrés',
    info: 'Information (OF sans besoin)', ok: 'Aucune alerte'
  };

  function style(el, css) { el.style.cssText = css; return el; }

  var CSS = [
    '#foxyz_suivi_of a.sof-lien{color:' + COULEUR + ';text-decoration:none;font-weight:bold;}',
    '#foxyz_suivi_of a.sof-lien:hover{text-decoration:underline;}',
    '#foxyz_suivi_of .sof-item{padding:4px 0;border-bottom:1px solid #e3e3e3;}',
    '#foxyz_suivi_of .sof-item:last-child{border-bottom:0;}',
    '#foxyz_suivi_of td{padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top;}',
    '#foxyz_suivi_of th{position:sticky;top:0;z-index:1;background:#f4f4f4;text-align:left;padding:7px 8px;border-bottom:1px solid #bbb;white-space:nowrap;}',
    // width/min-width : Foxyz impose une largeur à tous les <button>.
    '#foxyz_suivi_of button{width:auto !important;min-width:0 !important;margin:0;}',
    '#foxyz_suivi_of .sof-btn{font-size:12px;padding:4px 10px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;}',
    '#foxyz_suivi_of .sof-btn:hover{border-color:' + COULEUR + ';}',
    '#foxyz_suivi_of .sof-btn.actif{background:' + COULEUR + ';color:#fff;border-color:' + COULEUR + ';}',
    '#foxyz_suivi_of .sof-mini{font-size:11px;color:#777;cursor:pointer;text-decoration:underline;margin-left:6px;white-space:nowrap;}',
    '#foxyz_suivi_of .sof-mini:hover{color:' + COULEUR + ';}',
    '#foxyz_suivi_of .sof-grp{cursor:pointer;user-select:none;}',
    '#foxyz_suivi_of .sof-grp:hover td{filter:brightness(0.97);}',
    '#foxyz_suivi_of .sof-cpt{color:#fff;border-radius:10px;padding:3px 9px;font-weight:bold;cursor:pointer;border:2px solid transparent;opacity:.9;}',
    '#foxyz_suivi_of .sof-cpt:hover{opacity:1;}',
    '#foxyz_suivi_of .sof-cpt.choisi{border-color:#222;opacity:1;box-shadow:0 0 0 2px #fff inset;}',
    '#foxyz_suivi_of .sof-piste{font-size:12px;color:#555;background:#F3F0FF;border-left:3px solid #7E57C2;padding:3px 6px;margin-top:4px;}'
  ].join(NL);

  function creerPanneau(dedie) {
    var fond = style(document.createElement('div'), 'position:fixed;inset:0;z-index:999990;background:' + (dedie ? '#fff' : 'rgba(0,0,0,.35)') + ';font-family:sans-serif;');
    fond.id = 'foxyz_suivi_of';
    var css = document.createElement('style');
    css.textContent = CSS;
    fond.appendChild(css);
    var boite = style(document.createElement('div'), 'position:absolute;inset:' + (dedie ? '0' : '16px') + ';background:#fff;border-radius:' + (dedie ? '0' : '8px') + ';box-shadow:0 4px 24px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;font-size:13px;color:#222;');
    fond.appendChild(boite);

    var entete = style(document.createElement('div'), 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 14px;border-bottom:2px solid ' + COULEUR + ';');
    entete.innerHTML =
      '<b style="color:' + COULEUR + ';font-size:16px;margin-right:6px;">Suivi OF</b>' +
      '<button class="sof-btn" data-vue="of">OF en cours</button>' +
      '<button class="sof-btn" data-vue="cf">CF non rattachées <span data-r="nbcf"></span></button>' +
      '<label>Commercial <select data-r="commercial" style="font-size:13px;"></select></label>' +
      '<label data-r="lblgroupe">Regrouper par <select data-r="groupe" style="font-size:13px;">' +
        '<option value="commande">Commercial › Commande</option>' +
        '<option value="commercial">Commercial</option>' +
        '<option value="client">Client › Commande</option>' +
      '</select></label>' +
      '<label data-r="lblalertes"><input type="checkbox" data-r="alertes"> Alertes uniquement</label>' +
      '<label data-r="lblcftoutes" style="display:none;"><input type="checkbox" data-r="cftoutes"> Aussi les lignes clôturées sans piste</label>' +
      '<span data-r="lblfamilles" style="position:relative;display:none;"><button class="sof-btn" data-r="familles">Familles ▾</button>' +
        '<div data-r="menufamilles" style="display:none;position:absolute;z-index:5;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #ccc;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.2);padding:8px 10px;min-width:340px;max-height:60vh;overflow:auto;"></div></span>' +
      '<input type="search" data-r="recherche" placeholder="Rechercher (client, OF, cde, article, CF, CONS)" style="font-size:13px;width:280px;padding:4px 6px;">' +
      '<span style="flex:1"></span>' +
      '<button class="sof-btn" data-r="deplier">Tout déplier</button>' +
      '<button class="sof-btn" data-r="reglages">Alertes ▾</button>' +
      (dedie ? '' : '<button class="sof-btn" data-r="onglet" title="Ouvrir l\'outil dans un onglet dédié">Ouvrir dans un onglet ↗</button>') +
      '<button data-r="actualiser" style="font-size:12px;padding:5px 12px;background:' + COULEUR + ';color:#fff;border:0;border-radius:4px;cursor:pointer;">Actualiser</button>' +
      '<span data-r="fermer" title="Fermer" style="cursor:pointer;font-weight:bold;font-size:20px;color:#888;padding:0 6px;">✕</span>' +
      '<div data-r="compteurs" style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;align-items:center;"></div>' +
      '<div data-r="selection" style="flex-basis:100%;display:none;flex-wrap:wrap;gap:8px;align-items:center;background:#E3F2FD;border-radius:4px;padding:5px 8px;"></div>' +
      '<div data-r="horodatage" style="flex-basis:100%;color:#777;font-size:11px;"></div>';
    boite.appendChild(entete);

    var panneauReglages = style(document.createElement('div'), 'display:none;padding:10px 14px;background:#fafafa;border-bottom:1px solid #ddd;');
    boite.appendChild(panneauReglages);
    var bandeau = style(document.createElement('div'), 'display:none;padding:8px 14px;background:#FDECEA;color:#B71C1C;border-bottom:1px solid #F5C6CB;white-space:pre-wrap;');
    boite.appendChild(bandeau);
    var corps = style(document.createElement('div'), 'flex:1;overflow:auto;');
    boite.appendChild(corps);

    function q(nom) { return entete.querySelector('[data-r="' + nom + '"]'); }
    var r = {
      fond: fond, corps: corps, bandeau: bandeau, reglages: panneauReglages, entete: entete,
      commercial: q('commercial'), groupe: q('groupe'), alertes: q('alertes'), recherche: q('recherche'),
      compteurs: q('compteurs'), horodatage: q('horodatage'), deplier: q('deplier'), nbcf: q('nbcf'),
      cftoutes: q('cftoutes'), lblgroupe: q('lblgroupe'), lblalertes: q('lblalertes'), lblcftoutes: q('lblcftoutes'),
      lblfamilles: q('lblfamilles'), menufamilles: q('menufamilles'), selection: q('selection')
    };
    r.selection.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-sel-action]');
      if (!b) { return; }
      var a = b.getAttribute('data-sel-action');
      var ids = Object.keys(etat.selection);
      if (a === 'vider') { etat.selection = {}; rendre(); }
      else if (a === 'tout') { (etat.visibles || []).forEach(function (l) { etat.selection[l.idLigne] = true; }); rendre(); }
      else if (a === 'mail') { exporterMail(ids); }
      else if (a === 'todoist') { exporterTodoist(ids); }
    });
    q('familles').onclick = function () {
      r.menufamilles.style.display = r.menufamilles.style.display === 'none' ? 'block' : 'none';
    };
    r.menufamilles.addEventListener('change', function (ev) {
      var cb = ev.target.closest('[data-famille]');
      if (!cb) { return; }
      reglages.familles[cb.getAttribute('data-famille')] = cb.checked;
      sauverReglages(); rendre();
    });
    r.menufamilles.addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-familles]');
      if (!a) { return; }
      var mode = a.getAttribute('data-familles');
      reglages.familles = {};
      if (mode !== 'defaut') {
        familles().forEach(function (f) { reglages.familles[f] = mode === 'toutes'; });
      }
      sauverReglages(); rendre();
    });

    r.groupe.value = reglages.groupe;
    q('fermer').onclick = fermerPanneau;
    q('actualiser').onclick = function () { lancerChargement(false); };
    if (q('onglet')) { q('onglet').onclick = function () { window.open(urlInterfaces() + HASH_OUTIL, '_blank'); }; }
    q('reglages').onclick = function () {
      panneauReglages.style.display = panneauReglages.style.display === 'none' ? 'block' : 'none';
      rendreReglages();
    };
    Array.prototype.forEach.call(entete.querySelectorAll('[data-vue]'), function (b) {
      b.onclick = function () { etat.vue = b.getAttribute('data-vue'); rendre(); };
    });
    r.deplier.onclick = function () { etat.toutDeplie = !etat.toutDeplie; etat.deplies = {}; rendre(); };
    r.commercial.onchange = function () { etat.commercial = r.commercial.value; rendre(); };
    r.groupe.onchange = function () { reglages.groupe = r.groupe.value; sauverReglages(); etat.deplies = {}; rendre(); };
    r.alertes.onchange = function () { etat.alertesSeules = r.alertes.checked; rendre(); };
    r.cftoutes.onchange = function () { etat.cfToutes = r.cftoutes.checked; rendre(); };
    r.recherche.addEventListener('input', function () { etat.recherche = r.recherche.value; rendre(); });
    r.compteurs.addEventListener('click', function (ev) {
      var c = ev.target.closest('[data-niveau]');
      if (!c) { return; }
      var n = c.getAttribute('data-niveau');
      if (n === '*') { etat.filtreNiveaux = {}; } else if (etat.filtreNiveaux[n]) { delete etat.filtreNiveaux[n]; } else { etat.filtreNiveaux[n] = true; }
      rendre();
    });

    panneauReglages.addEventListener('change', function (ev) {
      var dr = ev.target.getAttribute('data-r');
      if (dr === 'projet') {
        todoist.projet = ev.target.value; sauverTodoist();
        chargerSectionsTodoist(true).then(rendreReglages, function (e) { toast('Sections Todoist : ' + e.message, false); });
        return;
      }
      if (dr === 'sectionBesoin' || dr === 'sectionOF') { todoist[dr] = ev.target.value; sauverTodoist(); return; }
      var cb = ev.target.closest('[data-regle]');
      if (!cb) { return; }
      reglages.regles[cb.getAttribute('data-regle')] = cb.checked;
      sauverReglages();
      rendre();
    });
    panneauReglages.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-action]');
      if (!b) { return; }
      var a = b.getAttribute('data-action');
      if (a === 'reactiver') {
        reglages.ignores = {};
        sauverReglages(); rendreReglages(); rendre();
      } else if (a === 'reactiver-art') {
        delete reglages.ignores[b.getAttribute('data-cle')];
        sauverReglages(); rendreReglages(); rendre();
      } else if (a === 'relire') {
        lancerChargement(true);
      } else if (a === 'todoist-valider') {
        var champ = panneauReglages.querySelector('[data-r="jeton"]');
        var v = champ ? champ.value.trim() : '';
        if (!v) { return; }
        todoist.jeton = v; todoist.projet = ''; todoist.projets = [];
        sauverTodoist();
        chargerProjetsTodoist();
      } else if (a === 'todoist-projets') {
        chargerProjetsTodoist();
      } else if (a === 'todoist-oublier') {
        todoist = { jeton: '', projet: '', projets: [] };
        sauverTodoist(); rendreReglages();
      }
    });

    corps.addEventListener('click', function (ev) {
      var sel = ev.target.closest('[data-sel]');
      if (sel) {
        var ids = sel.getAttribute('data-sel').split(',');
        var tous = ids.every(function (id) { return etat.selection[id]; });
        ids.forEach(function (id) { if (tous) { delete etat.selection[id]; } else { etat.selection[id] = true; } });
        rendre();
        return;
      }
      var ex = ev.target.closest('[data-export]');
      if (ex) {
        var typeEx = ex.getAttribute('data-export');
        if (typeEx === 'mail') { exporterMail([ex.getAttribute('data-ligne')]); }
        else if (typeEx === 'todoist-besoin') { exporterTodoistBesoin(ex.getAttribute('data-ligne'), +ex.getAttribute('data-besoin')); }
        else { exporterTodoist([ex.getAttribute('data-ligne')]); }
        return;
      }
      var ig = ev.target.closest('[data-ignorer]');
      if (ig) {
        reglages.ignores[ig.getAttribute('data-ignorer')] = ig.getAttribute('data-raison') || true;
        sauverReglages(); rendre(); rendreReglages();
        return;
      }
      var re = ev.target.closest('[data-reactiver]');
      if (re) {
        delete reglages.ignores[re.getAttribute('data-reactiver')];
        sauverReglages(); rendre(); rendreReglages();
        return;
      }
      var g = ev.target.closest('[data-groupe]');
      if (g && !ev.target.closest('a')) {
        var k = g.getAttribute('data-groupe');
        etat.deplies[k] = !estDeplie(k);
        rendre();
        return;
      }
      var th = ev.target.closest('[data-tri]');
      if (th) {
        var col = th.getAttribute('data-tri');
        etat.tri = { col: col, sens: etat.tri.col === col ? -etat.tri.sens : 1 };
        rendre();
      }
    });

    document.body.appendChild(fond);
    return r;
  }

  function rendreReglages() {
    if (!refs) { return; }
    var cles = Object.keys(reglages.ignores);
    var articles = cles.filter(function (k) { return k.indexOf('*|a:') === 0; });
    var nbIgn = cles.length - articles.length;
    refs.reglages.innerHTML =
      '<b>Alertes actives</b> <span style="color:#777;">(réglages enregistrés sur ce poste uniquement)</span>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;margin:8px 0;">' +
      Object.keys(REGLES).map(function (k) {
        return '<label><input type="checkbox" data-regle="' + k + '"' + (reglages.regles[k] !== false ? ' checked' : '') + '> ' + k + '. ' + esc(REGLES[k]) + '</label>';
      }).join('') + '</div>' +
      '<div style="margin-bottom:6px;"><b>Articles toujours ignorés (pris en stock)</b> : ' +
      (articles.length ? articles.map(function (k) {
        return '<span style="display:inline-block;background:#eee;border-radius:10px;padding:1px 8px;margin:2px;">' + esc(k.slice(4)) +
          ' <span class="sof-mini" data-action="reactiver-art" data-cle="' + esc(k) + '">réactiver</span></span>';
      }).join('') : '<i style="color:#777;">aucun</i>') + '</div>' +
      '<div>' + nbIgn + ' besoin(s) / alerte(s) ignoré(s) ligne par ligne' +
      (cles.length ? ' <button class="sof-btn" data-action="reactiver">Tout réactiver</button>' : '') +
      ' <button class="sof-btn" data-action="relire" title="Relit toutes les fiches CF et consultation (~800 lectures, ~1 min)">Relire toutes les CF et consultations</button></div>' +
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #ddd;"><b>Todoist</b> ' +
      (todoist.jeton
        ? '<span style="color:#2E7D32;">jeton enregistré sur ce poste</span> — projet : <select data-r="projet" style="font-size:12px;">' +
            '<option value="">Boîte de réception</option>' +
            (todoist.projets || []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === todoist.projet ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') +
          '</select>' +
          ' — section besoins : ' + selectSection('sectionBesoin') +
          ' — section OF : ' + selectSection('sectionOF') +
          ' <button class="sof-btn" data-action="todoist-projets">Recharger projets et sections</button>' +
          ' <button class="sof-btn" data-action="todoist-oublier">Oublier le jeton</button>'
        : '<input type="password" data-r="jeton" placeholder="Jeton API Todoist" autocomplete="off" style="font-size:12px;width:260px;padding:3px 6px;"> ' +
          '<button class="sof-btn" data-action="todoist-valider">Valider le jeton</button>' +
          ' <span style="color:#777;font-size:11px;">Todoist › Paramètres › Intégrations › Développeur › jeton API. Gardé dans ce navigateur uniquement.</span>') +
      ' <span data-r="todoistmsg" style="font-size:12px;"></span></div>';
  }

  function selectSection(cle) {
    return '<select data-r="' + cle + '" style="font-size:12px;"><option value="">(aucune)</option>' +
      (todoist.sections || []).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === todoist[cle] ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') +
      '</select>';
  }

  function listeAPI(rep) {
    return (Array.isArray(rep) ? rep : (rep.results || [])).map(function (x) { return { id: String(x.id), name: x.name }; });
  }

  /** Sections du projet choisi ; par défaut « Achats fournisseurs » (besoins) et « Projets » (OF). */
  function chargerSectionsTodoist(reinitialiser) {
    if (!todoist.projet) { todoist.sections = []; todoist.sectionBesoin = ''; todoist.sectionOF = ''; sauverTodoist(); return Promise.resolve(); }
    return appelTodoist('GET', '/sections?project_id=' + encodeURIComponent(todoist.projet)).then(function (rep) {
      todoist.sections = listeAPI(rep);
      function garde(cle, motif) {
        var ok = todoist.sections.some(function (s) { return s.id === todoist[cle]; });
        if (reinitialiser || !ok) { var s = trouverParNom(todoist.sections, motif); todoist[cle] = s ? s.id : ''; }
      }
      garde('sectionBesoin', /achats?\s+fournisseurs?/i);
      garde('sectionOF', /^projets?$/i);
      sauverTodoist();
    });
  }

  function chargerProjetsTodoist() {
    var msg = refs && refs.reglages.querySelector('[data-r="todoistmsg"]');
    if (msg) { msg.textContent = ' Connexion à Todoist…'; msg.style.color = '#555'; }
    return appelTodoist('GET', '/projects').then(function (rep) {
      todoist.projets = listeAPI(rep);
      var nouveau = !todoist.projets.some(function (p) { return p.id === todoist.projet; });
      if (nouveau) { var p = trouverParNom(todoist.projets, /affaire/i); todoist.projet = p ? p.id : ''; }
      sauverTodoist();
      return chargerSectionsTodoist(nouveau);
    }).then(function () {
      rendreReglages();
      var m2 = refs && refs.reglages.querySelector('[data-r="todoistmsg"]');
      if (m2) { m2.textContent = ' Connecté : ' + todoist.projets.length + ' projet(s), ' + (todoist.sections || []).length + ' section(s) dans le projet.'; m2.style.color = '#2E7D32'; }
    }).catch(function (e) {
      if (/refusé/.test(e.message)) { todoist.jeton = ''; sauverTodoist(); rendreReglages(); }
      var m3 = refs && refs.reglages.querySelector('[data-r="todoistmsg"]');
      if (m3) { m3.textContent = ' ' + e.message; m3.style.color = '#B71C1C'; }
    });
  }

  function fermerPanneau() {
    if (!refs) { return; }
    refs.fond.remove();
    refs = null;
    etat.donnees = null;
    if (location.hash === HASH_OUTIL) { history.replaceState(null, '', location.pathname + location.search); }
  }

  function ouvrirPanneau(dedie) {
    if (refs) { refs.fond.style.display = 'block'; return; }
    etat.ongletDedie = dedie === true;
    refs = creerPanneau(etat.ongletDedie);
    lancerChargement(false);
  }

  async function lancerChargement(toutRelire) {
    if (!refs) { return; }
    refs.bandeau.style.display = 'none';
    refs.corps.innerHTML = '<div style="padding:40px;text-align:center;color:#555;font-size:14px;"><div data-r="progres">Chargement…</div></div>';
    var zone = refs.corps.querySelector('[data-r="progres"]');
    try {
      var d = await charger(function (t) { if (zone) { zone.textContent = t; } }, toutRelire);
      if (!refs) { return; }
      etat.donnees = d;
      etat.horodatage = new Date();
      var champMoi = document.querySelector('#id_employe_detail');
      var moi = prenomUtilisateur(champMoi ? champMoi.value : '', document.title);
      var commerciaux = [];
      d.lignes.forEach(function (l) { if (commerciaux.indexOf(l.commercial) === -1) { commerciaux.push(l.commercial); } });
      commerciaux.sort();
      if (etat.commercial === null) { etat.commercial = commerciaux.indexOf(moi) !== -1 ? moi : '*'; }
      refs.commercial.innerHTML = '<option value="*">Tous</option>' + commerciaux.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      }).join('');
      refs.commercial.value = commerciaux.indexOf(etat.commercial) !== -1 ? etat.commercial : '*';
      etat.commercial = refs.commercial.value;
      var msgs = d.erreurs.concat(d.avertissements);
      if (msgs.length) {
        refs.bandeau.textContent = 'Lecture incomplète — les lignes concernées sont signalées :' + NL + msgs.join(NL);
        refs.bandeau.style.display = 'block';
      }
      refs.horodatage.textContent = 'Chargé le ' + formatDate(etat.horodatage) + ' à ' + etat.horodatage.toTimeString().slice(0, 5) +
        ' (' + d.stats.requetes + ' requêtes, ' + (d.stats.duree / 1000).toFixed(1) + ' s, ' + d.stats.cf + ' CF, ' + d.stats.consultations + ' consultations)';
      rendre();
    } catch (e) {
      if (!refs) { return; }
      etat.donnees = null;
      refs.corps.innerHTML = '';
      refs.bandeau.textContent = 'Échec du chargement : aucun tableau affiché.' + NL + e.message;
      refs.bandeau.style.display = 'block';
      console.error('[Foxyz-suivi-of]', e);
    }
  }

  function texteRecherche(l) {
    return [l.client, l.contact, l.of, 'cde ' + l.commande, l.repere, l.commercial]
      .concat(l.besoins.map(function (b) { return b.libelle; }))
      .concat(l.cfsAssociees.map(function (c) { return 'cf ' + c.cf + ' ' + c.libelle + ' ' + (c.fournisseur || ''); }))
      .concat(l.consultations.map(function (c) { return 'cons ' + c.numero + ' cons. ' + c.numero + ' ' + c.fournisseur; }))
      .concat((l.pistes || []).map(function (p) { return 'cf ' + p.cf; }))
      .join(' ').toLowerCase();
  }

  function valeurTri(l, col) {
    switch (col) {
      case 'statut': return -RANG[l.eff.niveau];
      case 'date': return l.dateClient ? cleJour(l.dateClient) : 99999999;
      case 'client': return l.client.toLowerCase();
      case 'commande': return +l.commande || 0;
      case 'of': return +l.of || 0;
      default: return 0;
    }
  }

  function pastille(niveau, taille) {
    var t = taille || 14;
    return '<span style="display:inline-block;width:' + t + 'px;height:' + t + 'px;border-radius:50%;background:' + COULEURS_NIVEAU[niveau] + ';vertical-align:middle;"></span>';
  }

  function lien(chemin, texte) {
    return '<a class="sof-lien" href="' + esc(urlOnglet(chemin)) + '" target="_blank" rel="noopener">' + esc(texte) + '</a>';
  }

  // ---------------------------------------------------------------- export (v1.3)

  function ligneParId(id) {
    return (etat.donnees ? etat.donnees.lignes : []).filter(function (l) { return l.idLigne === id; })[0];
  }

  function toast(texte, ok) {
    if (!refs) { return; }
    var t = style(document.createElement('div'), 'position:absolute;right:24px;bottom:24px;max-width:460px;z-index:10;padding:10px 14px;border-radius:6px;font-size:13px;white-space:pre-wrap;box-shadow:0 2px 10px rgba(0,0,0,.3);color:#fff;background:' + (ok ? '#2E7D32' : '#B71C1C') + ';');
    t.textContent = texte;
    refs.fond.appendChild(t);
    setTimeout(function () { t.remove(); }, ok ? 5000 : 9000);
  }

  function signature() {
    var champ = document.querySelector('#id_employe_detail');
    return propre(champ ? champ.value : '') || prenomUtilisateur('', document.title);
  }

  /** Ouvre la messagerie par défaut (mailto, sans destinataire). Rien n'est envoyé par l'outil. */
  function exporterMail(ids) {
    var lignes = ids.map(ligneParId).filter(Boolean);
    if (!lignes.length) { return; }
    var m = corpsMail(lignes.map(function (l) { return resumeExport(l, l.eff, reglages.ignores); }), signature());
    var url = urlMailto(m.sujet, m.corps);
    if (url.length > 1800) {
      // Limite des liens mailto (~2000 caractères) : corps copié, à coller dans le mail.
      var court = urlMailto(m.sujet, 'Le détail a été copié : colle-le ici (Ctrl+V).');
      var ouvrir = function () { window.location.href = court; };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(m.corps).then(function () {
          toast('Mail long : le texte est copié dans le presse-papiers, colle-le dans le mail (Ctrl+V).', true); ouvrir();
        }, function () { toast('Mail trop long et copie impossible : sélectionne moins de lignes.', false); });
      } else { toast('Mail trop long : sélectionne moins de lignes.', false); return; }
    } else {
      window.location.href = url;
    }
    lignes.forEach(function (l) { noterEnvoi(l.idLigne, 'mail'); });
    rendre();
  }

  function lienOF(l) { return urlOnglet('../Formulaires/avancement_of.php?id_of=' + l.idOf); }

  /** Une tâche Todoist (une ligne) par ligne d'OF. */
  function exporterTodoist(ids) {
    var aujourdhui = new Date();
    return envoyerTodoist(ids.map(ligneParId).filter(Boolean).map(function (l) {
      return { ligne: l, cle: 'todoist', tache: tacheTodoist(resumeExport(l, l.eff, reglages.ignores), l.eff.niveau, aujourdhui, lienOF(l)) };
    }), true);
  }

  /** Une tâche Todoist pour un besoin précis. */
  function exporterTodoistBesoin(idLigne, index) {
    var l = ligneParId(idLigne);
    var b = l && l.besoins[index];
    if (!b) { return; }
    var couvert = couvertureBesoins(l)[index].length > 0;
    return envoyerTodoist([{ ligne: l, cle: 'todoist|' + b.cle,
      tache: tacheTodoistBesoin(resumeExport(l, l.eff, reglages.ignores), b, couvert, l.eff.niveau, new Date(), lienOF(l)) }], false);
  }

  /** Crée les tâches (POST api.todoist.com, séquentiel). */
  async function envoyerTodoist(items, viderSelection) {
    if (!items.length) { return; }
    if (!todoist.jeton) {
      toast('Saisis d\'abord ton jeton Todoist dans « Alertes ▾ ».', false);
      refs.reglages.style.display = 'block'; rendreReglages();
      return;
    }
    // Jeton validé avec une version antérieure : projet « Affaire » et sections pas encore lus.
    if (!todoist.sections) { await chargerProjetsTodoist(); }
    var ok = 0, echecs = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (todoist.projet) { it.tache.project_id = todoist.projet; }
      var section = it.cle === 'todoist' ? todoist.sectionOF : todoist.sectionBesoin;
      if (todoist.projet && section) { it.tache.section_id = section; }
      try {
        await appelTodoist('POST', '/tasks', it.tache);
        noterEnvoi(it.ligne.idLigne, it.cle); ok++;
      } catch (e) {
        echecs.push('OF ' + it.ligne.of + ' : ' + e.message);
        if (/jeton/.test(e.message)) { break; }
      }
    }
    if (ok && viderSelection) { etat.selection = {}; }
    rendre();
    toast(ok + ' tâche(s) créée(s) dans Todoist.' + (echecs.length ? NL + 'Échecs :' + NL + echecs.join(NL) : ''), !echecs.length);
  }

  function rendreSelection() {
    var ids = Object.keys(etat.selection).filter(ligneParId);
    etat.selection = {};
    ids.forEach(function (id) { etat.selection[id] = true; });
    var n = ids.length;
    refs.selection.style.display = etat.vue === 'of' ? 'flex' : 'none';
    refs.selection.innerHTML = n
      ? '<b>' + n + ' ligne(s) sélectionnée(s)</b>' +
        '<button class="sof-btn" data-sel-action="mail" title="Ouvre un mail pré-rempli dans ta messagerie (destinataire à choisir)">✉ Un mail pour la sélection</button>' +
        '<button class="sof-btn" data-sel-action="todoist">+ ' + n + ' tâche(s) Todoist</button>' +
        '<span class="sof-mini" data-sel-action="tout">cocher toutes les lignes affichées</span>' +
        '<span class="sof-mini" data-sel-action="vider">vider la sélection</span>'
      : '<span style="color:#555;font-size:12px;">Export : coche des lignes (ou une commande) pour un mail groupé ou des tâches Todoist, ou utilise ✉ / + Todoist sur une ligne.</span>' +
        '<span class="sof-mini" data-sel-action="tout">cocher toutes les lignes affichées</span>';
  }

  function celluleExport(l) {
    var e = envois[l.idLigne] || {};
    function quand(ts) { return ts ? formatDate(new Date(ts)) : ''; }
    return '<div style="margin-top:4px;font-size:11px;color:#777;">' +
      '<label style="cursor:pointer;"><input type="checkbox" data-sel="' + esc(l.idLigne) + '"' + (etat.selection[l.idLigne] ? ' checked' : '') + ' style="vertical-align:middle;margin:0 2px 0 0;"> sélection</label>' +
      '<span class="sof-mini" data-export="mail" data-ligne="' + esc(l.idLigne) + '" title="Mail pré-rempli au collaborateur (besoins traités ? avancement ?)">✉ mail</span>' +
      '<span class="sof-mini" data-export="todoist" data-ligne="' + esc(l.idLigne) + '" title="Créer UNE tâche Todoist pour cette ligne d\'OF (une seule ligne : Cde / OF / client / repère)">+ Todoist (OF)</span>' +
      (e.mail ? ' <span title="Mail préparé">✉ ' + quand(e.mail) + '</span>' : '') +
      (e.todoist ? ' <span title="Tâche Todoist créée">☑ ' + quand(e.todoist) + '</span>' : '') +
      '</div>';
  }

  function celluleStatut(l) {
    var e = l.eff;
    var precision = '';
    var palier = e.niveau !== e.niveauBrut ? { orange: '7 à 21', anticiper: '22 à 36', tard: 'plus de 36' }[e.niveau] : '';
    if (palier) { precision = ' <span style="font-weight:normal;font-size:11px;">(' + LIBELLES_NIVEAU[e.niveauBrut].toLowerCase() + ', livraison dans ' + palier + ' j. ouvrés)</span>'; }
    var h ='<div style="display:flex;align-items:center;gap:6px;background:' + FONDS_NIVEAU[e.niveau] + ';border-radius:4px;padding:4px 6px;">' +
      pastille(e.niveau, 16) + '<b style="font-size:14px;color:' + COULEURS_NIVEAU[e.niveau] + ';">' + LIBELLES_NIVEAU[e.niveau] + precision + '</b></div>';
    var coul = function (m) { return e.niveau !== e.niveauBrut ? COULEURS_NIVEAU[e.niveau] : COULEURS_NIVEAU[m.niveau]; };
    e.actifs.forEach(function (m) {
      // Règle 1 : on ignore besoin par besoin (dans la colonne Besoins), pas la ligne entière.
      var action = m.regle === 1 ? '' : '<span class="sof-mini" data-ignorer="' + esc(l.idLigne + '|' + m.cle) + '" title="Ne plus signaler cette alerte pour cette ligne">ignorer</span>';
      h += '<div class="sof-item" style="font-size:12px;color:' + coul(m) + ';">' + esc(m.texte) + action + '</div>';
    });
    e.ignores.forEach(function (m) {
      h += '<div class="sof-item" style="font-size:11px;color:#999;"><span style="text-decoration:line-through;">' + esc(m.texte) + '</span>' +
        (m.parBesoin ? '' : '<span class="sof-mini" data-reactiver="' + esc(l.idLigne + '|' + m.cle) + '">réactiver</span>') + '</div>';
    });
    return h + celluleExport(l);
  }

  function celluleBesoins(l) {
    if (!l.besoins.length) { return '<span style="color:#999;">—</span>'; }
    var couv = couvertureBesoins(l);
    var r1 = l.motifs.filter(function (m) { return m.regle === 1; })[0];
    var aCouvrir = r1 ? r1.besoins : [];
    return l.besoins.map(function (b, i) {
      var sansCF = aCouvrir.indexOf(b) !== -1;
      var ignLigne = !!reglages.ignores[l.idLigne + '|' + b.cle];
      var ignArt = !!reglages.ignores['*|' + b.cleArticle];
      var txt = (b.qte ? '<b>' + esc(b.qte + ' ' + b.unite) + '</b> ' : '') + esc(b.libelle);
      if (ignLigne || ignArt) {
        return '<div class="sof-item" style="color:#999;"><span style="text-decoration:line-through;">' + txt + '</span> <i style="font-size:11px;">' +
          (ignArt ? 'article ignoré partout' : (reglages.ignores[l.idLigne + '|' + b.cle] === 'inutile' ? 'ignoré (inutile)' : 'ignoré (stock)')) + '</i>' +
          '<span class="sof-mini" data-reactiver="' + esc(ignArt ? '*|' + b.cleArticle : l.idLigne + '|' + b.cle) + '">réactiver</span></div>';
      }
      var actions = sansCF
        ? '<span class="sof-mini" data-ignorer="' + esc(l.idLigne + '|' + b.cle) + '" data-raison="stock" title="Ne plus compter ce besoin pour cette ligne d\'OF : pris en stock">stock</span>' +
          '<span class="sof-mini" data-ignorer="' + esc(l.idLigne + '|' + b.cle) + '" data-raison="inutile" title="Ne plus compter ce besoin pour cette ligne d\'OF : besoin devenu inutile (ex. pièce passée en sous-traitance)">inutile</span>'
        : '';
      var etatB = couv[i].length
        ? ' <span style="font-size:11px;color:#2E7D32;white-space:nowrap;">✓ CF ' + esc(couv[i].join(', ')) + '</span>'
        : (sansCF ? ' <span style="font-size:11px;color:#D32F2F;font-weight:bold;white-space:nowrap;">sans CF</span>' : '');
      var envB = (envois[l.idLigne] || {})['todoist|' + b.cle];
      var todo = '<span class="sof-mini" data-export="todoist-besoin" data-ligne="' + esc(l.idLigne) + '" data-besoin="' + i + '" title="Créer une tâche Todoist pour ce besoin seulement">+ Todoist</span>' +
        (envB ? ' <span style="font-size:11px;color:#777;" title="Tâche Todoist créée">☑ ' + formatDate(new Date(envB)) + '</span>' : '');
      return '<div class="sof-item">' + txt + etatB + actions + todo + '</div>';
    }).join('');
  }

  function celluleCF(l) {
    var h = '';
    if (!l.cfsAssociees.length) { h = '<span style="color:#999;">—</span>'; }
    h += l.cfsAssociees.map(function (c) {
      var t = lien('../Formulaires/commande_fournisseur_reception.php?id_cf=' + c.cf, 'CF ' + c.cf) + ' ' + esc(c.libelle);
      if (c.erreur || c.inconnue) { return '<div class="sof-item">' + t + ' <i style="color:#B71C1C;">(données incomplètes)</i></div>'; }
      t += c.fournisseur ? '<div style="color:#666;font-size:12px;">' + esc(c.fournisseur) : '<div style="font-size:12px;">';
      var lg = c.ligne;
      if (lg) {
        var d = lg.delaiNegocie || lg.delaiSouhaite;
        t += (d ? ' · ' + formatDate(d) : (lg.cloturee ? '' : ' · sans délai')) +
          (lg.cloturee ? ' · <span style="color:#2E7D32;">clôturée</span>' : ' · <span style="color:#1565C0;">en cours</span>');
      } else {
        t += ' · <i>ligne de CF non identifiée</i>';
      }
      return '<div class="sof-item">' + t + '</div></div>';
    }).join('');
    (l.pistes || []).forEach(function (p) {
      h += '<div class="sof-piste" title="Piste indicative : CF non rattachée à un OF. À vérifier puis rattacher dans Foxyz si c\'est la bonne.">Piste : ' +
        lien('../Formulaires/commande_fournisseur_rapide.php?id_cf=' + p.cf, 'CF ' + p.cf) + ' non rattachée — ' + esc(p.raisons.join(' ; ')) + '</div>';
    });
    return h;
  }

  function celluleConsultations(l) {
    if (!l.consultations.length) { return '<span style="color:#999;">—</span>'; }
    return l.consultations.map(function (c) {
      var etatC = c.transformee
        ? '<span style="color:#2E7D32;">→ ' + c.cfs.map(function (n) { return 'CF ' + n; }).join(', ') + '</span>'
        : (c.enAttente ? '<span style="color:#EF6C00;">en attente de réponse</span>' : '<span style="color:#EF6C00;">non transformée en CF</span>');
      return '<div class="sof-item">' + lien('../Formulaires/consultation.php?id_consultation=' + c.numero, 'CONS. ' + c.numero) +
        (c.fournisseur ? ' <span style="color:#666;font-size:12px;">' + esc(c.fournisseur) + '</span>' : '') + '<div style="font-size:12px;">' + etatC + '</div></div>';
    }).join('');
  }

  function ligneHTML(l) {
    var jour = cleJour(new Date());
    var retard = l.dateClient && cleJour(l.dateClient) < jour;
    return '<tr>' +
      '<td style="min-width:200px;max-width:290px;">' + celluleStatut(l) + '</td>' +
      '<td style="white-space:nowrap;' + (retard ? 'color:#D32F2F;font-weight:bold;' : '') + '">' + esc(formatDate(l.dateClient)) + (l.prio ? '<div style="color:#999;font-size:11px;font-weight:normal;">Prio ' + esc(l.prio) + '</div>' : '') + '</td>' +
      '<td>' + esc(l.client) + '<div style="color:#999;font-size:11px;">' + esc(l.contact) + '</div></td>' +
      '<td style="white-space:nowrap;">' + (l.idCommande ? lien('../Formulaires/commande_rapide.php?id_commande=' + l.idCommande, 'Cde ' + l.commande) : esc('Cde ' + l.commande)) + '</td>' +
      '<td style="white-space:nowrap;">' + lien('../Formulaires/avancement_of.php?id_of=' + l.idOf, 'OF ' + l.of) + '</td>' +
      '<td style="min-width:140px;">' + (l.repere ? esc(l.repere) : '<i style="color:#999;">sans repère</i>') + '<div style="color:#777;">' + esc(l.quantite) + '</div></td>' +
      '<td style="min-width:240px;">' + celluleBesoins(l) + '</td>' +
      '<td style="min-width:240px;">' + celluleCF(l) + '</td>' +
      '<td style="min-width:150px;">' + celluleConsultations(l) + '</td>' +
      '</tr>';
  }

  function estDeplie(cle) {
    return etat.deplies[cle] !== undefined ? etat.deplies[cle] : etat.toutDeplie;
  }

  function pire(lignes) {
    var n = 'ok';
    lignes.forEach(function (l) { if (RANG[l.eff.niveau] > RANG[n]) { n = l.eff.niveau; } });
    return n;
  }

  function rendreCompteurs(compte) {
    var filtre = Object.keys(etat.filtreNiveaux).length;
    refs.compteurs.innerHTML = '<span style="color:#777;font-size:12px;">Filtrer :</span>' + NIVEAUX.map(function (n) {
      return '<span class="sof-cpt' + (etat.filtreNiveaux[n] ? ' choisi' : '') + '" data-niveau="' + n + '" title="' + esc(AIDES_NIVEAU[n]) + ' — cliquer pour filtrer" style="background:' + COULEURS_NIVEAU[n] + ';">' +
        LIBELLES_NIVEAU[n] + ' ' + compte[n] + '</span>';
    }).join('') + (filtre ? '<span class="sof-mini" data-niveau="*">tout afficher</span>' : '');
  }

  function rendre() {
    if (!refs || !etat.donnees) { return; }
    Array.prototype.forEach.call(refs.entete.querySelectorAll('[data-vue]'), function (b) {
      b.classList.toggle('actif', b.getAttribute('data-vue') === etat.vue);
    });
    var vueOF = etat.vue === 'of';
    refs.lblgroupe.style.display = vueOF ? '' : 'none';
    refs.lblalertes.style.display = vueOF ? '' : 'none';
    refs.deplier.style.display = vueOF ? '' : 'none';
    refs.compteurs.style.display = vueOF ? 'flex' : 'none';
    refs.lblcftoutes.style.display = vueOF ? 'none' : '';
    refs.lblfamilles.style.display = vueOF ? 'none' : '';
    if (vueOF) { refs.menufamilles.style.display = 'none'; }
    var nbCF = etat.donnees.cfNonRattachees.filter(function (c) { return (c.ouverte || c.pistes.length) && familleCochee(c.famille); }).length;
    refs.nbcf.textContent = '(' + nbCF + ')';
    if (!vueOF) { refs.selection.style.display = 'none'; rendreCF(); return; }

    refs.deplier.textContent = etat.toutDeplie ? 'Tout replier' : 'Tout déplier';
    var aujourdhui = new Date();
    var toutes = etat.donnees.lignes;
    toutes.forEach(function (l) { l.eff = appliquerReglages(l.idLigne, l.motifs, reglages, l.dateClient, aujourdhui); });

    var compte = {};
    NIVEAUX.forEach(function (n) { compte[n] = 0; });
    var visibles = toutes.filter(function (l) { return etat.commercial === '*' || l.commercial === etat.commercial; });
    visibles.forEach(function (l) { compte[l.eff.niveau]++; });
    var rq = etat.recherche.trim().toLowerCase();
    var filtre = Object.keys(etat.filtreNiveaux).length;
    visibles = visibles.filter(function (l) {
      if (filtre && !etat.filtreNiveaux[l.eff.niveau]) { return false; }
      if (etat.alertesSeules && (l.eff.niveau === 'ok' || l.eff.niveau === 'info')) { return false; }
      if (rq && texteRecherche(l).indexOf(rq) === -1) { return false; }
      return true;
    });
    rendreCompteurs(compte);
    etat.visibles = visibles;
    rendreSelection();

    var t = etat.tri;
    function cmp(a, b) {
      var va = valeurTri(a, t.col), vb = valeurTri(b, t.col);
      if (va < vb) { return -t.sens; }
      if (va > vb) { return t.sens; }
      return (+a.of || 0) - (+b.of || 0);
    }

    var mode = reglages.groupe;
    var cols = [['statut', 'Statut'], ['date', 'Date client'], ['client', 'Client'], ['commande', 'Commande'], ['of', 'OF'], [null, 'Repère / Qté'], [null, 'Besoins'], [null, 'CF rattachées'], [null, 'Consultations']];
    var h = '<table style="border-collapse:collapse;width:100%;"><thead><tr>' + cols.map(function (c) {
      var fl = c[0] && t.col === c[0] ? (t.sens > 0 ? ' ▲' : ' ▼') : '';
      return '<th' + (c[0] ? ' style="cursor:pointer;" data-tri="' + c[0] + '"' : '') + '>' + c[1] + fl + '</th>';
    }).join('') + '</tr></thead><tbody>';

    if (!visibles.length) {
      h += '<tr><td colspan="9" style="padding:30px;text-align:center;color:#777;">Aucune ligne à afficher.</td></tr>';
    }

    var cle1 = mode === 'client' ? 'client' : 'commercial';
    var g1 = {};
    visibles.forEach(function (l) { (g1[l[cle1]] = g1[l[cle1]] || []).push(l); });
    Object.keys(g1).sort().forEach(function (k1) {
      var L1 = g1[k1];
      h += '<tr><td colspan="9" style="background:#FBEDE7;color:' + COULEUR + ';font-weight:bold;font-size:14px;padding:7px 8px;border-top:2px solid ' + COULEUR + ';">' +
        esc(k1) + ' — ' + L1.length + ' ligne(s) d\'OF</td></tr>';
      if (mode === 'commercial') {
        L1.sort(cmp).forEach(function (l) { h += ligneHTML(l); });
        return;
      }
      var g2 = {};
      L1.forEach(function (l) { (g2[l.commande] = g2[l.commande] || []).push(l); });
      var cdes = Object.keys(g2).map(function (c) { return { cde: c, lignes: g2[c].sort(cmp) }; });
      cdes.sort(function (a, b) { return cmp(a.lignes[0], b.lignes[0]); });
      cdes.forEach(function (g) {
        var cleG = k1 + '|' + g.cde;
        var ouvert = estDeplie(cleG) || !!rq;
        var niv = pire(g.lignes);
        var l0 = g.lignes[0];
        var nb = {};
        g.lignes.forEach(function (l) { nb[l.eff.niveau] = (nb[l.eff.niveau] || 0) + 1; });
        var nbPistes = g.lignes.reduce(function (s, l) { return s + (l.pistes || []).length; }, 0);
        h += '<tr class="sof-grp" data-groupe="' + esc(cleG) + '"><td colspan="9" style="background:' + FONDS_NIVEAU[niv] + ';border-left:5px solid ' + COULEURS_NIVEAU[niv] + ';">' +
          '<span style="display:inline-block;width:16px;color:#555;">' + (ouvert ? '▼' : '▶') + '</span> ' +
          '<input type="checkbox" title="Sélectionner les lignes de cette commande pour l\'export" data-sel="' + esc(g.lignes.map(function (l) { return l.idLigne; }).join(',')) + '"' +
            (g.lignes.every(function (l) { return etat.selection[l.idLigne]; }) ? ' checked' : '') + ' style="vertical-align:middle;margin:0 4px 0 0;"> ' +
          pastille(niv, 14) + ' <b style="font-size:14px;">Cde ' + esc(g.cde) + '</b> — ' + esc(l0.client) +
          ' — ' + g.lignes.length + ' ligne(s) d\'OF — date client ' + esc(formatDate(l0.dateClient)) +
          ['rouge', 'orange', 'anticiper', 'tard'].map(function (n) {
            return nb[n] ? ' — <b style="color:' + COULEURS_NIVEAU[n] + ';">' + nb[n] + ' ' + LIBELLES_NIVEAU[n].toLowerCase() + '</b>' : '';
          }).join('') +
          (nbPistes ? ' — <span style="color:#7E57C2;font-weight:bold;">' + nbPistes + ' piste(s) de CF</span>' : '') +
          (l0.idCommande ? ' <span style="margin-left:8px;">' + lien('../Formulaires/commande_rapide.php?id_commande=' + l0.idCommande, 'ouvrir la commande') + '</span>' : '') +
          '</td></tr>';
        if (ouvert) { g.lignes.forEach(function (l) { h += ligneHTML(l); }); }
      });
    });
    h += '</tbody></table>';
    var defil = refs.corps.scrollTop;
    refs.corps.innerHTML = h;
    refs.corps.scrollTop = defil;
  }

  /** Familles présentes dans les CF non rattachées (+ familles par défaut), triées. */
  function familles() {
    var vues = {};
    FAMILLES_DEFAUT.forEach(function (f) { vues[f] = true; });
    ((etat.donnees && etat.donnees.cfNonRattachees) || []).forEach(function (c) { vues[c.famille] = true; });
    return Object.keys(vues).sort(function (a, b) { return a === FAMILLE_INCONNUE ? 1 : b === FAMILLE_INCONNUE ? -1 : a < b ? -1 : 1; });
  }

  function rendreMenuFamilles() {
    var nb = {};
    etat.donnees.cfNonRattachees.forEach(function (c) {
      if (etat.cfToutes || c.ouverte || c.pistes.length) { nb[c.famille] = (nb[c.famille] || 0) + 1; }
    });
    refs.menufamilles.innerHTML =
      '<div style="margin-bottom:6px;"><b>Familles d\'articles affichées</b>' +
      '<span class="sof-mini" data-familles="defaut">par défaut</span>' +
      '<span class="sof-mini" data-familles="toutes">toutes</span>' +
      '<span class="sof-mini" data-familles="aucune">aucune</span></div>' +
      familles().map(function (f) {
        return '<label style="display:block;white-space:nowrap;padding:2px 0;"><input type="checkbox" data-famille="' + esc(f) + '"' + (familleCochee(f) ? ' checked' : '') + '> ' +
          esc(f) + ' <span style="color:#999;">(' + (nb[f] || 0) + ')</span></label>';
      }).join('');
  }

  /** Vue « CF non rattachées ». */
  function rendreCF() {
    var rq = etat.recherche.trim().toLowerCase();
    var commercialDe = {};
    etat.donnees.lignes.forEach(function (l) { commercialDe[l.idLigne] = l.commercial; });
    rendreMenuFamilles();
    var nbFamilles = familles().filter(familleCochee).length;
    refs.lblfamilles.querySelector('[data-r="familles"]').textContent = 'Familles (' + nbFamilles + ') ▾';
    var liste = etat.donnees.cfNonRattachees.filter(function (c) {
      if (!familleCochee(c.famille)) { return false; }
      if (!etat.cfToutes && !c.ouverte && !c.pistes.length) { return false; }
      if (etat.commercial !== '*' && c.pistes.length && !c.pistes.some(function (p) { return commercialDe[p.idLigneOF] === etat.commercial; })) { return false; }
      if (rq) {
        var t = ['cf ' + c.cf, c.fournisseur, c.referenceCF, c.commentaire, c.article, c.motif].concat(c.pistes.map(function (p) { return 'of ' + p.of + ' cde ' + p.commande; })).join(' ').toLowerCase();
        if (t.indexOf(rq) === -1) { return false; }
      }
      return true;
    });
    var h = '<div style="padding:8px 14px;color:#555;font-size:12px;background:#F3F0FF;border-bottom:1px solid #ddd;">' +
      'Lignes de CF sans affectation à un OF (ou affectées à une phase hors liste). Par défaut : lignes en cours, et lignes clôturées ayant une piste. ' +
      'Les <b>pistes</b> sont indicatives : à vérifier, puis rattacher la CF dans Foxyz si c\'est la bonne. Le filtre commercial ne garde que les lignes dont une piste concerne ce commercial (les lignes sans piste restent visibles).</div>';
    h += '<table style="border-collapse:collapse;width:100%;"><thead><tr>' +
      ['CF', 'Fournisseur', 'Article', 'Délai / état', 'Commentaire CF', 'Problème', 'Pistes de rattachement'].map(function (c) { return '<th>' + c + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    if (!liste.length) { h += '<tr><td colspan="7" style="padding:30px;text-align:center;color:#777;">Aucune ligne de CF non rattachée à afficher.</td></tr>'; }
    liste.forEach(function (c) {
      h += '<tr>' +
        '<td style="white-space:nowrap;">' + lien('../Formulaires/commande_fournisseur_rapide.php?id_cf=' + c.cf, 'CF ' + c.cf) + '<div style="color:#999;font-size:11px;">' + esc(c.referenceCF) + '</div></td>' +
        '<td>' + esc(c.fournisseur) + '</td>' +
        '<td>' + esc(c.article) + '<div style="color:#999;font-size:11px;">' + esc(c.famille) + '</div></td>' +
        '<td style="white-space:nowrap;">' + (c.delai ? esc(formatDate(c.delai)) : '') + '<div style="font-size:12px;color:' + (c.ouverte ? '#1565C0' : '#2E7D32') + ';">' + (c.ouverte ? 'en cours' : 'clôturée') + '</div></td>' +
        '<td style="max-width:220px;white-space:pre-wrap;">' + esc(c.commentaire) + '</td>' +
        '<td style="font-size:12px;">' + esc(c.motif) + (c.affectations.length ? '<div style="color:#999;">' + esc(c.affectations.join(' ; ')) + '</div>' : '') + '</td>' +
        '<td style="min-width:240px;">' + (c.pistes.length ? c.pistes.map(function (p) {
          return '<div class="sof-item">' + lien('../Formulaires/avancement_of.php?id_of=' + p.idOf, 'OF ' + p.of) + ' (Cde ' + esc(p.commande) + ') — ' + esc(p.texte) + '</div>';
        }).join('') : '<span style="color:#999;">—</span>') + '</td>' +
        '</tr>';
    });
    h += '</tbody></table>';
    refs.corps.innerHTML = h;
  }

  // =========================================================================
  //  DÉMARRAGE
  // =========================================================================

  function waitForReady() {
    return new Promise(function (resolve) {
      var t = setInterval(function () {
        if (window.$ && typeof window.ouvrir_popup_total === 'function' && document.body) { clearInterval(t); resolve(); }
      }, 200);
    });
  }

  function connecterHub(outil) {
    var t0 = Date.now();
    var t = setInterval(function () {
      if (window.__foxyz_hub__) {
        clearInterval(t);
        window.__foxyz_hub__.enregistrer(outil);
      } else if (Date.now() - t0 > 10000) {
        clearInterval(t);
        console.warn('[Foxyz-suivi-of] Hub introuvable, outil non enregistre.');
      }
    }, 200);
  }

  waitForReady().then(function () {
    connecterHub({ id: 'suivi_of', label: 'Suivi OF', icone: 'OF', categorie: 'analyse', onOpen: function () { ouvrirPanneau(false); } });
    traiterHash();
    console.log('[Foxyz-suivi-of] pret v1.3.3');
  });
})();
