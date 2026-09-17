// ==UserScript==
// @name         Foxyz - Hub (boite a outils)
// @namespace    mecanickel
// @version      1.0
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://*.gpao-foxyz.fr/ERP/Interfaces/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * HUB FOXYZ - point d'entree unique pour tous les outils.
 *
 * Ce script fait UNE seule chose : afficher la pastille "boite a outils"
 * en bas a droite et exposer window.__foxyz_hub__.enregistrer(outil) pour
 * que chaque script-outil vienne s'y accrocher.
 *
 * C'est desormais le SEUL endroit ou vit le code du hub. Les scripts-outils
 * ne contiennent plus qu'un petit connecteur (voir plus bas) : plus besoin
 * de modifier 20 copies identiques le jour ou on veut changer une couleur
 * ou une position.
 *
 * Par defaut, rien d'autre que cette pastille ne s'affiche sur la page.
 * Chaque outil reste cache tant qu'on ne l'a pas ouvert depuis ce menu, et
 * c'est a l'outil (pas au hub) de gerer sa propre fermeture complete.
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
 *     icone: 'ABC',        // 3 lettres max, affichees dans le rond
 *     onOpen: function () { / * afficher l'UI de l'outil * / }
 *   });
 * ---------------------------------------------------------------------
 */

(function () {
  'use strict';

  if (window.__foxyz_hub__) { return; } // deja pret (double injection improbable)

  var COULEUR = '#CB4315';

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
      '</svg>'; // boite a outils (SVG, plus net qu un emoji)
    Object.assign(pastille.style, {
      position: 'fixed', bottom: '80px', right: '20px', zIndex: 999997,
      width: '46px', height: '46px', borderRadius: '50%',
      background: COULEUR, color: '#fff', fontSize: '22px', fontWeight: 'bold',
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
      background: '#fff', border: '2px solid ' + COULEUR,
      borderRadius: '8px', padding: '8px', display: 'none',
      fontFamily: 'sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,.35)',
      minWidth: '180px'
    });

    var entete = document.createElement('div');
    entete.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;';
    entete.innerHTML = '<span style="font-weight:bold;color:' + COULEUR + ';font-size:12px;flex:1;">Outils Foxyz</span>';
    var reduire = document.createElement('span');
    reduire.textContent = '\u2715'; // croix
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
        if (this.outils[outil.id]) { return; } // deja enregistre
        this.outils[outil.id] = outil;

        var item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 8px;cursor:pointer;border-radius:5px;font-size:13px;color:#222;';
        item.onmouseenter = function () { item.style.background = '#f2e6e0'; };
        item.onmouseleave = function () { item.style.background = 'transparent'; };

        var ic = document.createElement('span');
        ic.textContent = outil.icone || String.fromCharCode(8226);
        ic.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:' + COULEUR + ';color:#fff;font-size:11px;font-weight:bold;flex-shrink:0;';

        var lbl = document.createElement('span');
        lbl.textContent = outil.label;

        item.appendChild(ic);
        item.appendChild(lbl);

        item.onclick = function () {
          // On replie le menu du hub avant d'ouvrir l'outil, pour ne pas
          // se retrouver avec le menu ET l'outil ouverts en meme temps.
          refs.barre.style.display = 'none';
          refs.pastille.style.display = 'flex';
          outil.onOpen();
        };

        refs.liste.appendChild(item);
      }
    };

    console.log('[Foxyz-hub] pret');
  }

  var t = setInterval(function () {
    if (document.body) { clearInterval(t); demarrer(); }
  }, 200);
})();