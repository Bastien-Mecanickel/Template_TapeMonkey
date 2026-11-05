// ==UserScript==
// @name         Foxyz - Calculette temps & prix
// @namespace    mecanickel
// @version      1.4
// @description  Convertisseur heures-minutes-secondes vers centiemes, simulateur de prix par taux horaire, calculateur surmoulage (moules x empreintes)
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
  OUTIL 100% LOCAL : il ne lit ni n'ecrit rien dans l'ERP.
  Il calcule dans le navigateur, c'est a toi de recopier les valeurs dans Foxyz.
  => aucun risque a l'utiliser sur PROD.

  3 onglets :
    1. CONVERSION  : hh:mm <-> heures decimales (centiemes)
    2. PRIX        : prepa (fixe) + fabrication (variable) + masque (variable) + sous-traitance
                     -> cout, prix, prix unitaire ; + retro-calcul d'un prix cible
    3. SURMOULAGE  : qte / nb moules / empreintes par moule / mise en fab / temps unitaire
                     -> nb de tournees, temps total, puis les 2 valeurs a saisir dans Foxyz
                        (1 temps de preparation + 1 temps de fabrication unitaire)
*/

(function () {
  'use strict';

  // =========================================================================
  // CONSTANTES
  // =========================================================================
  var ORANGE = '#CB4315';
  var CLE_REGLAGES = 'fzcalc_reglages_v1';
  var TAUX_DEFAUT = { prep: 100, fab: 100, masque: 100, st_jour: 0 };

  var panneau = null;   // element DOM du panneau (cree a la 1ere ouverture)
  var ongletActif = 'conversion';

  // =========================================================================
  // HELPERS GENERIQUES
  // =========================================================================
  function waitForReady() {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      var t = setInterval(function () {
        if (window.$ || Date.now() - t0 > 10000) {
          clearInterval(t);
          resolve();
        }
      }, 200);
    });
  }

  // nombre tolerant : accepte la virgule francaise
  function nb(v) {
    var s = String(v == null ? '' : v).replace(',', '.').trim();
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // formatage francais
  function fmt(n, d) {
    if (d == null) { d = 2; }
    if (!isFinite(n)) { n = 0; }
    return n.toFixed(d).replace('.', ',');
  }
  function fmtEur(n) { return fmt(n, 2) + ' ' + String.fromCharCode(8364); }

  /*
    Lecture d une duree -> heures decimales. null si illisible.
    Formats acceptes :
      1:30       h:min
      1:30:20    h:min:sec
      1h30       h et min
      2m30       min et sec (le 2e nombre prend l unite juste en dessous du 1er)
      1h30m20s   combinaison libre de h / min / sec
      90min      minutes seules (min, mn ou m)
      30sec      secondes seules (sec ou s)
      1,5        nombre nu = heures decimales
  */
  function parseDuree(s) {
    s = String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
    if (!s) { return null; }
    var m;

    // h:min  ou  h:min:sec
    m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/);
    if (m) { return nb(m[1]) + nb(m[2]) / 60 + (m[3] ? nb(m[3]) / 3600 : 0); }

    // combinaison de suffixes : 1h30m20s, 30m, 45s, 2h...
    m = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)(?:min|mn|m))?(?:(\d+(?:\.\d+)?)(?:sec|s))?$/);
    if (m && (m[1] || m[2] || m[3])) {
      return nb(m[1] || 0) + nb(m[2] || 0) / 60 + nb(m[3] || 0) / 3600;
    }

    // 2m30 = 2 minutes 30 secondes (le 2e nombre prend l unite juste en dessous)
    m = s.match(/^(\d+)(?:min|mn|m)(\d{1,2})s?$/);
    if (m) { return nb(m[1]) / 60 + nb(m[2]) / 3600; }

    // 1h30 = 1 heure 30 minutes
    m = s.match(/^(\d+)h(\d{1,2})$/);
    if (m) { return nb(m[1]) + nb(m[2]) / 60; }

    // nombre nu = heures decimales
    m = s.match(/^\d+(?:\.\d+)?$/);
    if (m) { return nb(s); }
    return null;
  }

  // heures decimales -> "1h30m20s" / "30min20s" / "45s" (secondes omises si nulles)
  function versHMS(h) {
    if (!isFinite(h)) { h = 0; }
    var neg = h < 0;
    var tot = Math.round(Math.abs(h) * 3600);
    var hh = Math.floor(tot / 3600);
    var mm = Math.floor((tot % 3600) / 60);
    var ss = tot % 60;
    var out;
    if (hh > 0) {
      out = hh + 'h' + (mm < 10 ? '0' : '') + mm + (ss ? 'm' + (ss < 10 ? '0' : '') + ss + 's' : '');
    } else if (mm > 0) {
      out = mm + 'min' + (ss ? (ss < 10 ? '0' : '') + ss + 's' : '');
    } else {
      out = ss + 's';
    }
    return (neg ? '-' : '') + out;
  }

  // heures decimales -> "00:30:20" (format horloge strict, pour copier/relire)
  function versHorloge(h) {
    if (!isFinite(h)) { h = 0; }
    var neg = h < 0;
    var tot = Math.round(Math.abs(h) * 3600);
    var hh = Math.floor(tot / 3600);
    var mm = Math.floor((tot % 3600) / 60);
    var ss = tot % 60;
    return (neg ? '-' : '') + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm
      + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function lireReglages() {
    try {
      var o = JSON.parse(localStorage.getItem(CLE_REGLAGES) || '{}');
      return {
        prep: o.prep != null ? o.prep : TAUX_DEFAUT.prep,
        fab: o.fab != null ? o.fab : TAUX_DEFAUT.fab,
        masque: o.masque != null ? o.masque : TAUX_DEFAUT.masque,
        st_jour: o.st_jour != null ? o.st_jour : TAUX_DEFAUT.st_jour
      };
    } catch (e) { return JSON.parse(JSON.stringify(TAUX_DEFAUT)); }
  }

  function ecrireReglages(o) {
    try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(o)); } catch (e) {}
  }

  function el(id) { return panneau ? panneau.querySelector('#' + id) : null; }
  function val(id) { var e = el(id); return e ? e.value : ''; }
  function setTxt(id, txt) { var e = el(id); if (e) { e.textContent = txt; } }

  // =========================================================================
  // MOTEURS DE CALCUL (fonctions pures, faciles a relire / ajuster)
  // =========================================================================

  /*
    SIMULATEUR DE PRIX
    e = {
      qte, t_prep, t_fab, fab_est_totale, t_masque, masque_est_total,
      j_st, cout_jour_st, taux_prep, taux_fab, taux_masque, prix_cible
    }
  */
  function calcPrix(e) {
    var r = {};
    var q = Math.max(e.qte, 0);

    r.h_prep = e.t_prep;                                      // fixe
    r.h_fab = e.fab_est_totale ? e.t_fab : e.t_fab * q;       // variable
    r.h_masque = e.masque_est_total ? e.t_masque : e.t_masque * q;
    r.h_total = r.h_prep + r.h_fab + r.h_masque;

    r.c_prep = r.h_prep * e.taux_prep;
    r.c_fab = r.h_fab * e.taux_fab;
    r.c_masque = r.h_masque * e.taux_masque;
    r.c_st = e.j_st * e.cout_jour_st;

    r.total = r.c_prep + r.c_fab + r.c_masque + r.c_st;
    r.pu = q > 0 ? r.total / q : 0;

    // taux horaire moyen reellement pratique (hors sous-traitance)
    r.taux_moyen = r.h_total > 0 ? (r.total - r.c_st) / r.h_total : 0;

    // retro-calcul d'un prix cible : de combien faut-il bouger ?
    r.cible = null;
    if (e.prix_cible > 0 && r.total > 0) {
      var cible = e.prix_cible;
      var coef = cible / r.total;
      var part_heures = cible - r.c_st;   // ce qui reste pour payer les heures
      r.cible = {
        prix: cible,
        pu: q > 0 ? cible / q : 0,
        ecart: cible - r.total,
        ecart_pct: (coef - 1) * 100,
        coef: coef,
        taux_equivalent: r.h_total > 0 ? part_heures / r.h_total : 0
      };
    }
    return r;
  }

  /*
    SURMOULAGE
    Le modele Foxyz est lineaire : 1 temps de prepa fixe + 1 temps unitaire.
    La realite du surmoulage est en escalier : chaque tournee de moules
    redemande une mise en fabrication.

    e = { qte, nb_moules, empreintes, mise_en_fab, t_unitaire,
          unitaire_par_tournee, marge, taux }

    - mise_en_fab   : temps de mise en fab POUR UN MOULE (h decimales)
    - t_unitaire    : par piece, ou par tournee si unitaire_par_tournee = true
  */
  function calcSurmoulage(e) {
    var r = {};
    var q = Math.max(e.qte, 0);
    var moules = Math.max(e.nb_moules, 1);
    var empr = Math.max(e.empreintes, 1);

    r.pieces_par_tournee = moules * empr;
    r.tournees = r.pieces_par_tournee > 0 ? Math.ceil(q / r.pieces_par_tournee) : 0;

    // temps de mise en fabrication : une fois par moule, a chaque tournee
    r.h_mise_en_fab = r.tournees * moules * e.mise_en_fab;

    // temps de production
    r.h_prod = e.unitaire_par_tournee ? r.tournees * e.t_unitaire : q * e.t_unitaire;

    r.h_total = r.h_mise_en_fab + r.h_prod;

    // --- traduction vers Foxyz ---
    // prepa Foxyz = la mise en fab de la 1ere tournee (le reste part dans l'unitaire)
    r.foxyz_prep = moules * e.mise_en_fab;
    r.foxyz_unitaire = q > 0 ? (r.h_total - r.foxyz_prep) / q : 0;
    // controle : prep + unitaire * qte doit retomber sur h_total
    r.controle = r.foxyz_prep + r.foxyz_unitaire * q;

    // Foxyz raisonne en centiemes d heure : on mesure ce que coute l arrondi
    r.arr_prep = Math.round(r.foxyz_prep * 100) / 100;
    r.arr_unitaire = Math.round(r.foxyz_unitaire * 100) / 100;
    r.arr_total = r.arr_prep + r.arr_unitaire * q;
    r.arr_ecart = r.arr_total - r.h_total;

    // --- prix ---
    r.cout = r.h_total * e.taux;
    r.marge = e.marge > 0 ? e.marge : 1;
    r.prix = r.cout * r.marge;
    r.pu = q > 0 ? r.prix / q : 0;
    r.reste_dernier_moule = r.tournees * r.pieces_par_tournee - q;
    return r;
  }

  // =========================================================================
  // STYLES
  // =========================================================================
  function injecterStyles() {
    if (document.getElementById('fzcalc_styles')) { return; }
    var css = [
      '#fzcalc_panneau{position:fixed;bottom:20px;right:92px;width:400px;max-height:82vh;',
      'display:flex;flex-direction:column;background:#fff;border:1px solid #ccc;border-radius:6px;',
      'box-shadow:0 4px 18px rgba(0,0,0,.25);z-index:99999;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;}',
      '#fzcalc_entete{display:flex;align-items:center;justify-content:space-between;background:', ORANGE, ';',
      'color:#fff;padding:8px 10px;border-radius:5px 5px 0 0;font-weight:bold;font-size:13px;}',
      '#fzcalc_fermer{cursor:pointer;background:none;border:none;color:#fff;font-size:18px;line-height:1;padding:0 2px;}',
      '#fzcalc_onglets{display:flex;border-bottom:1px solid #ddd;background:#f6f6f6;}',
      '.fzcalc_onglet{flex:1;padding:8px 4px;text-align:center;cursor:pointer;border-right:1px solid #ddd;',
      'font-weight:bold;color:#666;}',
      '.fzcalc_onglet:last-child{border-right:none;}',
      '.fzcalc_onglet.actif{background:#fff;color:', ORANGE, ';box-shadow:inset 0 -2px 0 ', ORANGE, ';}',
      '#fzcalc_corps{padding:10px;overflow-y:auto;}',
      '.fzcalc_bloc{margin-bottom:12px;}',
      '.fzcalc_titre{font-weight:bold;color:#444;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #eee;}',
      '.fzcalc_ligne{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;gap:8px;}',
      '.fzcalc_ligne label{flex:1;color:#555;}',
      '.fzcalc_ligne input[type=number],.fzcalc_ligne input[type=search],.fzcalc_ligne input.fzcalc_txt{',
      'width:92px;padding:4px 6px;border:1px solid #bbb;border-radius:3px;font-size:12px;text-align:right;}',
      '.fzcalc_unite{width:34px;color:#888;font-size:11px;}',
      '.fzcalc_res{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dotted #e3e3e3;}',
      '.fzcalc_res b{font-variant-numeric:tabular-nums;}',
      '.fzcalc_fort{background:#fdf1ec;border:1px solid ', ORANGE, ';border-radius:4px;padding:8px;margin-top:8px;}',
      '.fzcalc_fort .fzcalc_res{border-bottom:1px dotted #e8c9bb;}',
      '.fzcalc_fort b{color:', ORANGE, ';font-size:14px;}',
      '.fzcalc_note{color:#888;font-size:11px;line-height:1.35;margin-top:6px;}',
      '.fzcalc_mini{font-size:11px;color:#888;}',
      '.fzcalc_bascule{font-size:11px;color:#555;display:flex;align-items:center;gap:4px;justify-content:flex-end;margin-bottom:6px;}',
      '#fzcalc_conv_sortie{font-size:16px;font-weight:bold;color:', ORANGE, ';text-align:center;padding:8px 0;}',
      '.fzcalc_conv_in{width:100%;padding:8px;border:1px solid #bbb;border-radius:3px;font-size:16px;text-align:center;}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'fzcalc_styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // =========================================================================
  // CONSTRUCTION DU PANNEAU
  // =========================================================================
  function champ(label, id, valeur, unite, pas) {
    return [
      '<div class="fzcalc_ligne"><label for="', id, '">', label, '</label>',
      '<input type="number" step="', (pas || 'any'), '" id="', id, '" value="', valeur, '">',
      '<span class="fzcalc_unite">', (unite || ''), '</span></div>'
    ].join('');
  }
  function res(label, id, gras) {
    return ['<div class="fzcalc_res"><span>', label, '</span>',
      (gras ? '<b id="' : '<span id="'), id, (gras ? '">-</b>' : '">-</span>'), '</div>'].join('');
  }

  function htmlConversion() {
    return [
      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Heures et minutes vers centiemes</div>',
      '<input class="fzcalc_conv_in" id="fzcalc_conv_hm" placeholder="2m30, 1h30, 1:30:20, 90min, 30sec">',
      '<div id="fzcalc_conv_sortie">-</div>',
      '<div class="fzcalc_mini" id="fzcalc_conv_sortie_bis" style="text-align:center"></div>',
      '<div class="fzcalc_note">Le second nombre prend toujours l unite juste en dessous du premier : 1h30 vaut 1 heure 30 minutes, 2m30 vaut 2 minutes 30 secondes. Aussi acceptes : 1:30 (h:min), 1:30:20 (h:min:sec), 90min, 30sec, ou un nombre nu lu en heures decimales.</div>',
      '</div>',
      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Centiemes vers heures, minutes, secondes</div>',
      '<input class="fzcalc_conv_in" id="fzcalc_conv_dec" placeholder="0,75">',
      '<div id="fzcalc_conv_sortie2">-</div>',
      '<div class="fzcalc_mini" id="fzcalc_conv_sortie2_bis" style="text-align:center"></div>',
      '</div>',
      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Repere rapide</div>',
      '<div class="fzcalc_mini">10 sec = 0,0028 h &nbsp;|&nbsp; 30 sec = 0,0083 h &nbsp;|&nbsp; 1 min = 0,0167 h<br>',
      '6 min = 0,10 h &nbsp;|&nbsp; 15 min = 0,25 h &nbsp;|&nbsp; 20 min = 0,33 h<br>',
      '30 min = 0,50 h &nbsp;|&nbsp; 45 min = 0,75 h &nbsp;|&nbsp; 50 min = 0,83 h</div>',
      '</div>'
    ].join('');
  }

  function htmlPrix(rg) {
    return [
      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Quantite et temps</div>',
      champ('Quantite a produire', 'fzcalc_p_qte', '1', 'pce'),
      champ('Preparation (fixe)', 'fzcalc_p_tprep', '0', 'h dec'),
      champ('Fabrication', 'fzcalc_p_tfab', '0', 'h dec'),
      '<div class="fzcalc_bascule"><input type="checkbox" id="fzcalc_p_fabtot"><label for="fzcalc_p_fabtot">temps de fabrication deja total (sinon : par piece)</label></div>',
      champ('Masque', 'fzcalc_p_tmasq', '0', 'h dec'),
      '<div class="fzcalc_bascule"><input type="checkbox" id="fzcalc_p_masqtot"><label for="fzcalc_p_masqtot">temps masque deja total (sinon : par piece)</label></div>',
      champ('Sous-traitance', 'fzcalc_p_jst', '0', 'j'),
      '</div>',

      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Taux horaires de vente</div>',
      champ('Preparation', 'fzcalc_p_taux_prep', rg.prep, 'E/h'),
      champ('Fabrication', 'fzcalc_p_taux_fab', rg.fab, 'E/h'),
      champ('Masque', 'fzcalc_p_taux_masq', rg.masque, 'E/h'),
      champ('Cout d un jour sous-traite', 'fzcalc_p_taux_st', rg.st_jour, 'E/j'),
      '<div class="fzcalc_note">Ces taux sont memorises dans le navigateur. Mets ici ceux de la fiche metier pour partir du prix Foxyz, puis fais-les varier.</div>',
      '</div>',

      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Resultat</div>',
      res('Heures preparation', 'fzcalc_p_hprep'),
      res('Heures fabrication', 'fzcalc_p_hfab'),
      res('Heures masque', 'fzcalc_p_hmasq'),
      res('Total heures', 'fzcalc_p_htot'),
      res('Sous-traitance', 'fzcalc_p_cst'),
      '<div class="fzcalc_fort">',
      res('Prix total', 'fzcalc_p_total', true),
      res('Prix unitaire', 'fzcalc_p_pu', true),
      '</div>',
      '</div>',

      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Aligner sur un prix cible</div>',
      champ('Prix total vise', 'fzcalc_p_cible', '0', 'E'),
      res('Ecart', 'fzcalc_p_ecart'),
      res('Coefficient a appliquer', 'fzcalc_p_coef'),
      res('Prix unitaire vise', 'fzcalc_p_cible_pu'),
      res('Taux horaire equivalent', 'fzcalc_p_tauxeq', true),
      '<div class="fzcalc_note">Le taux equivalent est celui qu il faudrait avoir en fiche metier pour tomber sur ce prix. Le coefficient se reporte en remise sur la ligne de devis, sans toucher la fiche metier.</div>',
      '</div>'
    ].join('');
  }

  function htmlSurmoulage(rg) {
    return [
      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Serie</div>',
      champ('Quantite a produire', 'fzcalc_s_qte', '100', 'pce'),
      champ('Nombre de moules', 'fzcalc_s_moules', '1', ''),
      champ('Empreintes par moule', 'fzcalc_s_empr', '1', 'pce'),
      '</div>',

      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Temps</div>',
      champ('Mise en fab par moule', 'fzcalc_s_mef', '0', 'h dec'),
      champ('Temps unitaire', 'fzcalc_s_tu', '0', 'h dec'),
      '<div class="fzcalc_bascule"><input type="checkbox" id="fzcalc_s_tu_tournee"><label for="fzcalc_s_tu_tournee">temps unitaire par tournee (sinon : par piece)</label></div>',
      '</div>',

      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Deroulement reel</div>',
      res('Pieces par tournee', 'fzcalc_s_ppt'),
      res('Nombre de tournees', 'fzcalc_s_tournees'),
      res('Places inutilisees sur la derniere', 'fzcalc_s_reste'),
      res('Heures de mise en fab', 'fzcalc_s_hmef'),
      res('Heures de production', 'fzcalc_s_hprod'),
      res('Temps total', 'fzcalc_s_htot', true),
      '</div>',

      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">A saisir dans Foxyz</div>',
      '<div class="fzcalc_fort">',
      res('Temps de preparation', 'fzcalc_s_fprep', true),
      res('Temps de fabrication (unitaire)', 'fzcalc_s_funit', true),
      '</div>',
      res('Temps total une fois arrondi', 'fzcalc_s_arrondi'),
      res('Valeurs non arrondies', 'fzcalc_s_exact'),
      '<div class="fzcalc_note" id="fzcalc_s_avert"></div>',
      '</div>',

      '<div class="fzcalc_bloc">',
      '<div class="fzcalc_titre">Prix</div>',
      champ('Taux horaire', 'fzcalc_s_taux', rg.fab, 'E/h'),
      champ('Marge (coefficient)', 'fzcalc_s_marge', '1', ''),
      res('Cout', 'fzcalc_s_cout'),
      res('Prix avec marge', 'fzcalc_s_prix', true),
      res('Prix unitaire avec marge', 'fzcalc_s_pu', true),
      '</div>'
    ].join('');
  }

  function construirePanneau() {
    injecterStyles();
    var rg = lireReglages();

    panneau = document.createElement('div');
    panneau.id = 'fzcalc_panneau';
    panneau.innerHTML = [
      '<div id="fzcalc_entete"><span>Calculette temps &amp; prix</span>',
      '<button id="fzcalc_fermer" title="Fermer">', String.fromCharCode(215), '</button></div>',
      '<div id="fzcalc_onglets">',
      '<div class="fzcalc_onglet actif" data-onglet="conversion">Conversion</div>',
      '<div class="fzcalc_onglet" data-onglet="prix">Prix</div>',
      '<div class="fzcalc_onglet" data-onglet="surmoulage">Surmoulage</div>',
      '</div>',
      '<div id="fzcalc_corps"></div>'
    ].join('');
    document.body.appendChild(panneau);

    panneau.querySelector('#fzcalc_fermer').addEventListener('click', fermerPanneau);

    var onglets = panneau.querySelectorAll('.fzcalc_onglet');
    for (var i = 0; i < onglets.length; i++) {
      onglets[i].addEventListener('click', function () {
        afficherOnglet(this.getAttribute('data-onglet'));
      });
    }

    // recalcul live sur toute saisie
    panneau.querySelector('#fzcalc_corps').addEventListener('input', recalculer);
    panneau.querySelector('#fzcalc_corps').addEventListener('change', recalculer);

    afficherOnglet(ongletActif);
  }

  function afficherOnglet(nom) {
    ongletActif = nom;
    var rg = lireReglages();
    var onglets = panneau.querySelectorAll('.fzcalc_onglet');
    for (var i = 0; i < onglets.length; i++) {
      onglets[i].className = 'fzcalc_onglet' + (onglets[i].getAttribute('data-onglet') === nom ? ' actif' : '');
    }
    var corps = panneau.querySelector('#fzcalc_corps');
    if (nom === 'conversion') { corps.innerHTML = htmlConversion(); }
    else if (nom === 'prix') { corps.innerHTML = htmlPrix(rg); }
    else { corps.innerHTML = htmlSurmoulage(rg); }
    recalculer();
  }

  // =========================================================================
  // RAFRAICHISSEMENT DE L AFFICHAGE
  // =========================================================================
  function recalculer() {
    if (!panneau) { return; }
    if (ongletActif === 'conversion') { majConversion(); }
    else if (ongletActif === 'prix') { majPrix(); }
    else { majSurmoulage(); }
  }

  function majConversion() {
    var h = parseDuree(val('fzcalc_conv_hm'));
    setTxt('fzcalc_conv_sortie', h == null ? '-' : fmt(h, 4) + ' h');
    setTxt('fzcalc_conv_sortie_bis', h == null ? '' : versHorloge(h) + '  (' + versHMS(h) + ')');

    var d = val('fzcalc_conv_dec');
    var dn = d === '' ? null : nb(d);
    setTxt('fzcalc_conv_sortie2', dn == null ? '-' : versHMS(dn));
    setTxt('fzcalc_conv_sortie2_bis', dn == null ? '' : versHorloge(dn));
  }

  function majPrix() {
    var rg = {
      prep: nb(val('fzcalc_p_taux_prep')),
      fab: nb(val('fzcalc_p_taux_fab')),
      masque: nb(val('fzcalc_p_taux_masq')),
      st_jour: nb(val('fzcalc_p_taux_st'))
    };
    ecrireReglages(rg);

    var e = {
      qte: nb(val('fzcalc_p_qte')),
      t_prep: nb(val('fzcalc_p_tprep')),
      t_fab: nb(val('fzcalc_p_tfab')),
      fab_est_totale: el('fzcalc_p_fabtot') ? el('fzcalc_p_fabtot').checked : false,
      t_masque: nb(val('fzcalc_p_tmasq')),
      masque_est_total: el('fzcalc_p_masqtot') ? el('fzcalc_p_masqtot').checked : false,
      j_st: nb(val('fzcalc_p_jst')),
      cout_jour_st: rg.st_jour,
      taux_prep: rg.prep,
      taux_fab: rg.fab,
      taux_masque: rg.masque,
      prix_cible: nb(val('fzcalc_p_cible'))
    };
    var r = calcPrix(e);

    setTxt('fzcalc_p_hprep', fmt(r.h_prep, 2) + ' h = ' + fmtEur(r.c_prep));
    setTxt('fzcalc_p_hfab', fmt(r.h_fab, 2) + ' h = ' + fmtEur(r.c_fab));
    setTxt('fzcalc_p_hmasq', fmt(r.h_masque, 2) + ' h = ' + fmtEur(r.c_masque));
    setTxt('fzcalc_p_htot', fmt(r.h_total, 2) + ' h');
    setTxt('fzcalc_p_cst', fmt(e.j_st, 1) + ' j = ' + fmtEur(r.c_st));
    setTxt('fzcalc_p_total', fmtEur(r.total));
    setTxt('fzcalc_p_pu', fmtEur(r.pu));

    if (r.cible) {
      setTxt('fzcalc_p_ecart', fmtEur(r.cible.ecart) + ' (' + fmt(r.cible.ecart_pct, 1) + ' %)');
      setTxt('fzcalc_p_coef', fmt(r.cible.coef, 4));
      setTxt('fzcalc_p_cible_pu', fmtEur(r.cible.pu));
      setTxt('fzcalc_p_tauxeq', fmt(r.cible.taux_equivalent, 2) + ' ' + String.fromCharCode(8364) + '/h');
    } else {
      setTxt('fzcalc_p_ecart', '-');
      setTxt('fzcalc_p_coef', '-');
      setTxt('fzcalc_p_cible_pu', '-');
      setTxt('fzcalc_p_tauxeq', fmt(r.taux_moyen, 2) + ' ' + String.fromCharCode(8364) + '/h (actuel)');
    }
  }

  function majSurmoulage() {
    var e = {
      qte: nb(val('fzcalc_s_qte')),
      nb_moules: nb(val('fzcalc_s_moules')),
      empreintes: nb(val('fzcalc_s_empr')),
      mise_en_fab: nb(val('fzcalc_s_mef')),
      t_unitaire: nb(val('fzcalc_s_tu')),
      unitaire_par_tournee: el('fzcalc_s_tu_tournee') ? el('fzcalc_s_tu_tournee').checked : false,
      marge: nb(val('fzcalc_s_marge')),
      taux: nb(val('fzcalc_s_taux'))
    };
    var r = calcSurmoulage(e);

    setTxt('fzcalc_s_ppt', fmt(r.pieces_par_tournee, 0) + ' pce');
    setTxt('fzcalc_s_tournees', fmt(r.tournees, 0));
    setTxt('fzcalc_s_reste', fmt(r.reste_dernier_moule, 0) + ' pce');
    setTxt('fzcalc_s_hmef', fmt(r.h_mise_en_fab, 2) + ' h');
    setTxt('fzcalc_s_hprod', fmt(r.h_prod, 2) + ' h');
    setTxt('fzcalc_s_htot', fmt(r.h_total, 2) + ' h');

    setTxt('fzcalc_s_fprep', fmt(r.foxyz_prep, 2) + ' h');
    setTxt('fzcalc_s_funit', fmt(r.foxyz_unitaire, 2) + ' h');
    setTxt('fzcalc_s_arrondi', fmt(r.arr_total, 2) + ' h au lieu de ' + fmt(r.h_total, 2)
      + ' h (' + (r.arr_ecart >= 0 ? '+' : '') + fmt(r.arr_ecart, 2) + ' h)');
    setTxt('fzcalc_s_exact', fmt(r.foxyz_prep, 4) + ' h et ' + fmt(r.foxyz_unitaire, 4) + ' h');

    var avert = el('fzcalc_s_avert');
    if (avert) {
      if (r.tournees > 1) {
        avert.textContent = 'Les ' + r.tournees + ' mises en fabrication ne rentrent pas dans un temps fixe : '
          + 'la premiere reste en preparation, les ' + (r.tournees - 1) + ' autres sont diluees dans le temps unitaire. '
          + 'Ces valeurs ne sont donc exactes que pour une quantite de ' + fmt(e.qte, 0) + ' pieces. '
          + 'Pour une autre quantite, recalcule.';
      } else {
        avert.textContent = 'Une seule tournee : les valeurs sont exactes quelle que soit la quantite.';
      }
    }

    setTxt('fzcalc_s_cout', fmtEur(r.cout));
    setTxt('fzcalc_s_prix', fmtEur(r.prix));
    setTxt('fzcalc_s_pu', fmtEur(r.pu));
  }

  // =========================================================================
  // OUVERTURE / FERMETURE
  // =========================================================================
  function ouvrirPanneau() {
    if (!panneau) { construirePanneau(); }
    panneau.style.display = 'flex';
    var premier = panneau.querySelector('#fzcalc_corps input');
    if (premier) { premier.focus(); }
  }

  function fermerPanneau() {
    if (panneau) { panneau.style.display = 'none'; }
  }

  // =========================================================================
  // CONNECTEUR HUB
  // =========================================================================
  function connecterHub(outil) {
    var t0 = Date.now();
    var t = setInterval(function () {
      if (window.__foxyz_hub__) {
        clearInterval(t);
        window.__foxyz_hub__.enregistrer(outil);
      } else if (Date.now() - t0 > 10000) {
        clearInterval(t);
        console.warn('[Foxyz-calculette] Hub introuvable, outil non enregistre.');
      }
    }, 200);
  }

  waitForReady().then(function () {
    connecterHub({ id: 'calculette', label: 'Calculette temps & prix', icone: 'CT', categorie: 'utilitaire', onOpen: ouvrirPanneau });
    console.log('[Foxyz-calculette] v1.3 enregistre dans le hub');
  });

})();
