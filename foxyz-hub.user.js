// ==UserScript==
// @name         Foxyz - Hub (boite a outils)
// @namespace    mecanickel
// @version      1.1
// @updateURL    https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-hub.user.js
// @downloadURL  https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-hub.user.js
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://*.gpao-foxyz.fr/ERP/Interfaces/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==


/*
 * HUB FOXYZ - point d'entree unique pour tous les outils.
 *
 * CHANGELOG
 * 1.1 - Regroupement par categorie (saisie / analyse / utilitaire / divers).
 *       Pastilles 2 caracteres, couleur par categorie.
 *       Champ optionnel `categorie` dans enregistrer().
 * 1.0 - Version initiale.
 *
 * Ce script fait UNE seule chose : afficher la pastille "boite a outils"
 * en bas a droite et exposer window.__foxyz_hub__.enregistrer(outil) pour
 * que chaque script-outil vienne s'y accrocher.
 *
 * ---------------------------------------------------------------------
 * CONNECTEUR A COLLER EN FIN DE CHAQUE SCRIPT-OUTIL :
 *
 *   function connecterHub(outil) {
 *     var t0 = Date.now();
 *     var t = setInterval(function () {
 *       if (window.__foxyz_hub__) {
 *         clearInterval(t);
 *         window.__foxyz_hub__.enregistrer(outil);
 *       } else if (Date.now() - t0 > 10000) {
 *         clearInterval(t);
 *         console.warn('[Foxyz] Hub introuvable, outil non enregistre :', outil.id);
 *       }
 *     }, 200);
 *   }
 *
 *   connecterHub({
 *     id: 'mon_outil',
 *     label: 'Mon outil',
 *     icone: 'MO',          // 2 caracteres max (tronque si plus)
 *     categorie: 'saisie',  // 'saisie' | 'analyse' | 'utilitaire' | absent => 'divers'
 *     onOpen: function () { / * afficher l'UI de l'outil * / }
 *   });
 * ---------------------------------------------------------------------
 */

(function () {
  'use strict';

  if (window.__foxyz_hub__) { return; }

  var COULEUR_DEFAUT = '#CB4315';

  var CATEGORIES = [
    { key: 'saisie',      label: 'Saisie',           couleur: '#CB4315' },
    { key: 'analyse',     label: 'Analyse & export',  couleur: '#2E5E7E' },
    { key: 'utilitaire',  label: 'Utilitaires',       couleur: '#6B7280' },
    { key: 'divers',      label: 'Divers',            couleur: '#6B7280' }
  ];

  function categorieNormalisee(cat) {
    if (cat === 'saisie' || cat === 'analyse' || cat === 'utilitaire') { return cat; }
    return 'divers';
  }

  function couleurCategorie(cat) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === cat) { return CATEGORIES[i].couleur; }
    }
    return '#6B7280';
  }

  function normaliserIcone(icone) {
    var s = (icone || String.fromCharCode(8226));
    if (s.length > 2) { s = s.slice(0, 2); }
    return s;
  }

  function renderListe(liste, outils, refs) {
    while (liste.firstChild) { liste.removeChild(liste.firstChild); }

    var groupes = {};
    for (var ci = 0; ci < CATEGORIES.length; ci++) {
      groupes[CATEGORIES[ci].key] = [];
    }

    for (var id in outils) {
      if (outils.hasOwnProperty(id)) {
        var o = outils[id];
        groupes[categorieNormalisee(o.categorie)].push(o);
      }
    }

    for (var gi = 0; gi < CATEGORIES.length; gi++) {
      groupes[CATEGORIES[gi].key].sort(function (a, b) {
        return a.label.localeCompare(b.label);
      });
    }

    var premiereSectionAffichee = true;

    for (var si = 0; si < CATEGORIES.length; si++) {
      var cat = CATEGORIES[si];
      var items = groupes[cat.key];
      if (!items.length) { continue; }

      var titre = document.createElement('div');
      titre.textContent = cat.label.toUpperCase();
      var titreStyle = 'font-size:9px;font-weight:bold;color:#aaa;letter-spacing:0.5px;padding:6px 8px 2px;';
      if (!premiereSectionAffichee) {
        titreStyle += 'border-top:1px solid #eee;margin-top:4px;';
      }
      titre.style.cssText = titreStyle;
      liste.appendChild(titre);
      premiereSectionAffichee = false;

      for (var ii = 0; ii < items.length; ii++) {
        (function (outil) {
          var couleur = couleurCategorie(categorieNormalisee(outil.categorie));

          var item = document.createElement('div');
          item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 8px;cursor:pointer;border-radius:5px;font-size:13px;color:#222;';
          item.onmouseenter = function () { item.style.background = '#f2e6e0'; };
          item.onmouseleave = function () { item.style.background = 'transparent'; };

          var ic = document.createElement('span');
          ic.textContent = normaliserIcone(outil.icone);
          ic.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:' + couleur + ';color:#fff;font-size:11px;font-weight:bold;flex-shrink:0;';

          var lbl = document.createElement('span');
          lbl.textContent = outil.label;

          item.appendChild(ic);
          item.appendChild(lbl);

          item.onclick = function () {
            refs.barre.style.display = 'none';
            refs.pastille.style.display = 'flex';
            outil.onOpen();
          };

          liste.appendChild(item);
        })(items[ii]);
      }
    }
  }

  function creerBarre() {
    var pastille = document.createElement('div');
    pastille.id = 'foxyz_hub_pastille';
    pastille.title = 'Outils Foxyz';
    pastille.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 8h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z"></path>' +
      '<path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
      '<line x1="3" y1="13" x2="21" y2="13"></line>' +
      '<line x1="10" y1="13" x2="10" y2="16"></line>' +
      '<line x1="14" y1="13" x2="14" y2="16"></line>' +
      '</svg>';
    Object.assign(pastille.style, {
      position: 'fixed', bottom: '80px', right: '20px', zIndex: 999997,
      width: '46px', height: '46px', borderRadius: '50%',
      background: COULEUR_DEFAUT, color: '#fff', fontSize: '22px', fontWeight: 'bold',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.35)',
      fontFamily: 'sans-serif', opacity: '0.65', transition: 'opacity .15s'
    });
    pastille.onmouseenter = function () { pastille.style.opacity = '1'; };
    pastille.onmouseleave = function () { pastille.style.opacity = '0.65'; };

    var barre = document.createElement('div');
    barre.id = 'foxyz_hub_barre';
    Object.assign(barre.style, {
      position: 'fixed', bottom: '140px', right: '20px', zIndex: 999997,
      background: '#fff', border: '2px solid ' + COULEUR_DEFAUT,
      borderRadius: '8px', padding: '8px', display: 'none',
      fontFamily: 'sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,.35)',
      minWidth: '180px'
    });

    var entete = document.createElement('div');
    entete.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;';
    entete.innerHTML = '<span style="font-weight:bold;color:' + COULEUR_DEFAUT + ';font-size:12px;flex:1;">Outils Foxyz</span>';
    var reduire = document.createElement('span');
    reduire.textContent = '\u2715';
    reduire.title = 'Fermer';
    reduire.style.cssText = 'cursor:pointer;font-weight:bold;color:#888;padding:0 4px;';
    reduire.onclick = function () { barre.style.display = 'none'; pastille.style.display = 'flex'; };
    entete.appendChild(reduire);
    barre.appendChild(entete);

    var liste = document.createElement('div');
    liste.id = 'foxyz_hub_liste';
    barre.appendChild(liste);

    pastille.onclick = function () { pastille.style.display = 'none'; barre.style.display = 'block'; };

    document.body.appendChild(pastille);
    document.body.appendChild(barre);
    return { pastille: pastille, barre: barre, liste: liste };
  }

  function demarrer() {
    var refs = creerBarre();

    window.__foxyz_hub__ = {
      refs: refs,
      outils: {},
      enregistrer: function (outil) {
        if (this.outils[outil.id]) { return; }
        this.outils[outil.id] = outil;
        renderListe(refs.liste, this.outils, refs);
      }
    };

    console.log('[Foxyz-hub] pret v1.1');
  }

  var t = setInterval(function () {
    if (document.body) { clearInterval(t); demarrer(); }
  }, 200);
})();