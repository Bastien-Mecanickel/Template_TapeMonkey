// ==UserScript==
// @name         Foxyz -> Dossier : Push commande
// @namespace    mecanickel
// @match        https://mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @run-at       document-idle
// @grant        none
// @version      1.5
// ==/UserScript==

/*
 * Tuyau Foxyz -> Excel (panier cumulatif).
 * "Envoyer au dossier" -> extrait la commande et l'ajoute au panier.
 * "Exporter"           -> telecharge panier_dossiers.json.
 * "Vider"              -> vide le panier.
 *
 * v1.0 : le hub est desormais un script a part (foxyz-hub.user.js).
 * Ce script ne contient plus qu'un petit connecteur qui s'y accroche.
 * Le widget est invisible tant qu'on ne l'a pas ouvert depuis le hub, et
 * disparait completement quand on le ferme (plus de pastille de repli).
 * Le panier (localStorage) n'est jamais efface par la fermeture du widget.
 *
 * v1.1 : decoupage des references articles revu.
 *   - format ART. N :    -> reference AVANT la parenthese, designation DEDANS
 *   - format REP. N-NN :  -> designation AVANT la parenthese, reference DEDANS
 *   - garde-fou : une parenthese n'est prise pour une reference que si elle a
 *     l'allure d'une vraie ref (lettre MAJ + tiret + 3 chiffres, etc.).
 *
 * v1.2 : decoupe ART/REP par POSITION de parenthese (indexOf) au lieu d'une
 *   regex : tolere les parentheses IMBRIQUEES dans la designation
 *   (ex. "ART. N : G-144 Indice A (JEU ... (SVG BOOSTER 40ML))").
 *
 * v1.3 : le DELAI ATELIER n'est plus la date souhaitee par le client, mais le
 *   "delai revise" saisi sur l'onglet Revue des exigences
 *   (champ date_livraison_prevue_<LC>, LC = of_foxyz de la ligne).
 *   Repli sur la date client si aucun delai revise n'est saisi.
 *
 * v1.4 : les lignes ANNULEES ne sont plus exportees. Dans Foxyz, la carte
 *   d'une ligne annulee prend la classe CSS "bord_rouge" sur son conteneur
 *   .ligne_devis ; on saute ces lignes a la lecture.
 *
 * v1.5 : une reference contenant "N/A" (non applicable) est traitee comme
 *   absente -> cote Excel la ligne ressort avec "PR N°____", quelle que soit
 *   la longueur du numero.
 */

(function () {
  'use strict';

  console.log('[Foxyz-push-commande] script charge (v1.5)');

  // =========================================================================
  // 1) MAPPING DES CHAMPS (la partie que tu maintiens)
  // =========================================================================
  const CHAMPS = {
    n_commande:      'id_commande_client',
    client:          'id_entreprise',
    contact:         'id_client',
    charge_affaires: 'id_commercial_commande',
    date_ouverture:  'date_ouverture_client',
  };

  const CHAMPS_LIGNE = {
    article:     'reference_article_',
    quantite:    'quantite_article_',
    commentaire: 'of_article_',
    delai:       'date_cloture_prev_',   // date souhaitee par le client (sert de repli)
    lc:          'of_foxyz_',            // id interne de la ligne (LC) = suffixe du delai revise
  };

  // Conteneur d'une ligne de commande, et classe ajoutee par Foxyz quand la
  // ligne est ANNULEE (la carte passe en "bord_rouge"). Les lignes annulees
  // sont exclues de l'export : elles n'ont rien a faire a l'atelier.
  const SEL_LIGNE      = '.ligne_devis';
  const CLASSE_ANNULEE = 'bord_rouge';

  const MAX_LIGNES   = 60;
  const REGEX_DEVIS  = /Suite au devis\s+(\d+)/gi;
  const ONGLET_DATA  = 'Commande client';
  const ONGLET_DEVIS = 'Revue des exigences';

  // Delai atelier = "delai revise" saisi sur l'onglet Revue des exigences.
  // Le champ y est date_livraison_prevue_<LC>, ou <LC> = of_foxyz_N de la ligne.
  const CHAMP_DELAI_REVISE = 'date_livraison_prevue_';

  const CLE_PANIER   = 'fzd_panier_v1';
  const CLE_VISIBLE  = 'fzd_visible'; // '1' = widget ouvert, sinon cache
  const NOM_FICHIER  = 'panier_dossiers.json';

  // =========================================================================
  // 2) OUTILS DE LECTURE
  // =========================================================================
  const $ = window.$;
  const lire = id => { const e = $('#' + id); return e.length ? (e.val() || '').trim() : ''; };
  const libelle = v => { if (!v) return ''; const i = v.indexOf(' : '); return i === -1 ? v.trim() : v.slice(i + 3).trim(); };

  // Prefixes reconnus en tete de reference_article_N.
  //   ART. N :    -> reference AVANT la parenthese, designation DEDANS
  //   REP. N-NN : -> designation AVANT la parenthese, reference DEDANS  (inverse !)
  const PREFIXE_ART = /^ART\.\s*\d+\s*:\s*/i;
  const PREFIXE_REP = /^REP\.\s*[\d-]+\s*:\s*/i;

  // Garde-fou : une reference article "valable" contient au minimum
  // une lettre MAJUSCULE + '-' + 3 chiffres, et parfois + '-' + 2 ou 3 chiffres.
  // Sert a NE PAS prendre pour une reference une parenthese qui n'en est pas une
  // (ex. "REP. 12 : PLAQUE PU 80 shr A ( noir )" -> "noir" n'est pas une ref).
  const REGEX_REF = /[A-Z]-\d{3}(?:-\d{2,3})?/;

  // "N/A" (= non applicable) n'est PAS une vraie reference : on la traite comme
  // absente -> cote Excel, la ligne ressort alors avec "PR N°____".
  function contientNA(s) { return /\bN\s*\/\s*A\b/i.test(s || ''); }

  // Une reference est "valable" si elle a l'allure d'une ref (lettre MAJ + '-' +
  // 3 chiffres, + parfois '-' + 2/3 chiffres) ET ne contient pas "N/A".
  function estRefValable(s) {
    s = (s || '').trim();
    return !contientNA(s) && REGEX_REF.test(s);
  }

  function decouperArticle(v) {
    const brut = (v || '').trim();

    // Format ART. : "ART. N : REF (DESIGNATION)"
    // La reference est AVANT la 1ere parenthese ; la designation est TOUT ce
    // qui est entre la 1ere '(' et la derniere ')'. On coupe par POSITION (et
    // non par regex) : la designation peut donc contenir ses propres
    // parentheses -> ex. "G-144 Indice A (JEU ... (SVG BOOSTER 40ML))".
    if (PREFIXE_ART.test(brut)) {
      const reste = brut.replace(PREFIXE_ART, '').trim();
      const i = reste.indexOf('(');
      const j = reste.lastIndexOf(')');
      if (i !== -1 && j > i) {
        const avant  = reste.slice(0, i).trim();
        const dedans = reste.slice(i + 1, j).trim();
        const ref = estRefValable(avant) ? avant : '';   // garde-fou sur la ref
        return { ref: ref, designation: dedans };
      }
      return { ref: '', designation: reste };   // pas de parenthese -> tout en designation
    }

    // Format REP. : "REP. N-NN : DESIGNATION (REF)"   (inverse de ART.)
    // La reference est dans la DERNIERE parenthese (une ref n'a pas de
    // parenthese interne). La designation, avant, peut en contenir.
    if (PREFIXE_REP.test(brut)) {
      const reste = brut.replace(PREFIXE_REP, '').trim();
      const i = reste.lastIndexOf('(');
      const j = reste.lastIndexOf(')');
      if (i !== -1 && j > i) {
        const dedans = reste.slice(i + 1, j).trim();
        // acceptee comme ref SEULEMENT si elle a l'allure d'une ref ;
        // sinon la parenthese fait partie de la designation.
        if (estRefValable(dedans)) {
          return { ref: dedans, designation: reste.slice(0, i).trim() };
        }
      }
      return { ref: '', designation: reste };
    }

    // Aucun prefixe reconnu : pas de reference, tout est designation
    return { ref: '', designation: brut };
  }

  const designation = v => decouperArticle(v).designation;
  const refArticle  = v => decouperArticle(v).ref;
  const formatDate = v => { const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || ''); };
  const lireDevisTexte = () => { const t = document.body.innerText || ''; return [...new Set([...t.matchAll(REGEX_DEVIS)].map(m => m[1]))]; };
  const trouverOnglet = txt => [...document.querySelectorAll('.sous_menu')].find(e => (e.textContent || '').trim() === txt);
  const attendre = (fn, timeout = 4000, pas = 150) => new Promise(res => {
    const t0 = Date.now();
    const id = setInterval(() => { const r = fn(); if ((Array.isArray(r) ? r.length : r) || Date.now() - t0 > timeout) { clearInterval(id); res(r); } }, pas);
  });

  // =========================================================================
  // 3) EXTRACTION -> objet au format d'export
  // =========================================================================
  function extraireBase() {
    if (!$ || !$('#' + CHAMPS.n_commande).length) return null;
    const data = {
      n_commande:      lire(CHAMPS.n_commande),
      date_ouverture:  formatDate(lire(CHAMPS.date_ouverture)),
      client:          libelle(lire(CHAMPS.client)),
      contact:         libelle(lire(CHAMPS.contact)),
      charge_affaires: libelle(lire(CHAMPS.charge_affaires)),
      devis:           '',
      lignes: [],
    };
    for (let n = 1; n <= MAX_LIGNES; n++) {
      const champArt = document.getElementById(CHAMPS_LIGNE.article + n);
      if (!champArt) continue;
      const artRaw = lire(CHAMPS_LIGNE.article + n);
      if (!artRaw) continue;

      // Ligne annulee : son conteneur .ligne_devis porte la classe bord_rouge.
      // On la saute (elle ne doit pas partir a l'atelier).
      const cont = champArt.closest(SEL_LIGNE);
      if (cont && cont.classList.contains(CLASSE_ANNULEE)) continue;

      data.lignes.push({
        designation: designation(artRaw),
        ref_article: refArticle(artRaw),
        quantite:    lire(CHAMPS_LIGNE.quantite + n),
        commentaire: lire(CHAMPS_LIGNE.commentaire + n),
        delai:       formatDate(lire(CHAMPS_LIGNE.delai + n)),  // date client (repli si pas de delai revise)
        _lc:         lire(CHAMPS_LIGNE.lc + n),                 // id de ligne, retire avant export
      });
    }
    return data;
  }

  // Va (une seule fois) sur l'onglet "Revue des exigences" pour y lire :
  //   - le(s) numero(s) de devis ("Suite au devis N")
  //   - le DELAI REVISE de chaque ligne : date_livraison_prevue_<LC>, ou
  //     <LC> = le of_foxyz de la ligne (stocke dans l._lc).
  // Ce delai revise remplace la date client comme "delai atelier".
  // Si une ligne n'a pas de delai revise, on GARDE la date client (repli),
  // pour ne jamais transmettre un delai vide a l'atelier.
  // Revient sur l'onglet "Commande client" a la fin.
  async function enrichirDepuisRevue(data) {
    let devis = lireDevisTexte();               // parfois deja visible sans changer d'onglet

    const oDevis = trouverOnglet(ONGLET_DEVIS);
    const oData  = trouverOnglet(ONGLET_DATA);

    if (oDevis) {
      try {
        oDevis.click();
        // on attend que l'onglet Revue soit charge (un champ delai revise apparait)
        await attendre(() => document.querySelector('[id^="' + CHAMP_DELAI_REVISE + '"]') || lireDevisTexte().length, 4000);

        if (!devis.length) devis = lireDevisTexte();

        // delai revise par ligne (via le LC = of_foxyz stocke dans _lc)
        for (const l of data.lignes) {
          if (!l._lc) continue;
          const el = document.getElementById(CHAMP_DELAI_REVISE + l._lc);
          const revise = el ? (el.value || '').trim() : '';
          if (revise) l.delai = formatDate(revise);   // sinon on garde la date client
        }
      } catch (e) {
        console.warn('[Foxyz->Dossier] lecture Revue des exigences echouee', e);
      } finally {
        if (oData) oData.click();
      }
    }

    data.devis = devis.join(', ');
  }

  // =========================================================================
  // 4) PANIER (persistant via localStorage - jamais efface par la fermeture)
  // =========================================================================
  function getPanier() {
    try { return JSON.parse(localStorage.getItem(CLE_PANIER)) || []; }
    catch (e) { return []; }
  }
  function setPanier(arr) {
    localStorage.setItem(CLE_PANIER, JSON.stringify(arr));
    majBarre();
  }
  function ajouterAuPanier(data) {
    const arr = getPanier();
    const i = arr.findIndex(c => c.n_commande === data.n_commande);
    const nouveau = i === -1;
    if (nouveau) arr.push(data); else arr[i] = data;
    setPanier(arr);
    return { nouveau, total: arr.length };
  }
  function viderPanier() {
    if (!confirm('Vider le panier ? Les commandes non exportees seront perdues.')) return;
    setPanier([]);
  }
  function exporterPanier() {
    const arr = getPanier();
    if (!arr.length) { alert('Le panier est vide.'); return; }
    const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = NOM_FICHIER;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setPanier([]);
    toast('\u2713 ' + arr.length + ' commande(s) exportee(s) - panier vide');
  }

  // =========================================================================
  // 5) INTERFACE - cachee par defaut, ouverte/fermee uniquement via le hub
  //    ou le bouton de fermeture. Pas d'etat intermediaire (pas de pastille
  //    de repli) : soit le widget est la, soit il n'y a RIEN sur la page.
  // =========================================================================
  function toast(msg, couleur) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;bottom:130px;right:20px;z-index:100000;padding:12px 16px;border-radius:8px;' +
      'background:' + (couleur || '#2e7d32') + ';color:#fff;font-family:Arial,sans-serif;font-size:14px;' +
      'font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.3);max-width:340px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function estVisible() { return localStorage.getItem(CLE_VISIBLE) === '1'; }

  function appliquerEtat() {
    const w = document.getElementById('fzd-widget');
    if (w) w.style.display = estVisible() ? 'flex' : 'none';
    if (!estVisible()) fermerMenu();
  }

  function afficherWidget() {
    localStorage.setItem(CLE_VISIBLE, '1');
    appliquerEtat();
  }

  function masquerWidget() {
    localStorage.setItem(CLE_VISIBLE, '0');
    appliquerEtat();
  }

  function fermerMenu() {
    const m = document.getElementById('fzd-menu');
    if (m) m.style.display = 'none';
  }

  function basculerMenu() {
    const m = document.getElementById('fzd-menu');
    if (m) m.style.display = (m.style.display === 'block') ? 'none' : 'block';
  }

  function majBarre() {
    const n = getPanier().length;
    const el = document.getElementById('fzd-count');
    if (el) el.textContent = n;
  }

  function poserInterface() {
    if (document.getElementById('fzd-widget')) return;

    const w = document.createElement('div');
    w.id = 'fzd-widget';
    w.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:99999;display:none;align-items:stretch;' +
      'font-family:Arial,sans-serif;font-size:14px;border-radius:8px;overflow:visible;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25)';
    w.innerHTML = `
      <button id="fzd-btn" style="cursor:pointer;border:none;background:#CB4315;color:#fff;
              padding:12px 16px;font-weight:700;font-size:14px;border-radius:8px 0 0 8px">
        \uD83D\uDCC4 Envoyer au dossier
      </button>
      <button id="fzd-basket" title="Panier (exporter / vider)"
              style="cursor:pointer;border:none;border-left:1px solid rgba(255,255,255,.35);
              background:#CB4315;color:#fff;padding:12px 12px;font-weight:700;font-size:14px">
        \uD83E\uDDFA <span id="fzd-count">0</span>
      </button>
      <span id="fzd-hide" title="Fermer"
            style="cursor:pointer;background:#CB4315;color:rgba(255,255,255,.7);padding:12px 10px;
            font-size:15px;line-height:1;border-radius:0 8px 8px 0">&times;</span>

      <div id="fzd-menu" style="display:none;position:absolute;bottom:52px;right:60px;background:#fff;
           border:2px solid #CB4315;border-radius:8px;padding:6px;min-width:150px;
           box-shadow:0 4px 14px rgba(0,0,0,.2)">
        <button id="fzd-export" style="display:block;width:100%;cursor:pointer;border:none;
                background:#CB4315;color:#fff;border-radius:6px;padding:8px;font-weight:700;
                font-size:13px;margin-bottom:5px">Exporter</button>
        <button id="fzd-clear" style="display:block;width:100%;cursor:pointer;border:1px solid #CB4315;
                background:#fff;color:#CB4315;border-radius:6px;padding:7px;font-size:13px">Vider</button>
      </div>`;
    document.body.appendChild(w);

    document.getElementById('fzd-btn').onclick    = pousser;
    document.getElementById('fzd-basket').onclick = basculerMenu;
    document.getElementById('fzd-hide').onclick   = masquerWidget;
    document.getElementById('fzd-export').onclick = () => { fermerMenu(); exporterPanier(); };
    document.getElementById('fzd-clear').onclick  = () => { fermerMenu(); viderPanier(); };

    document.addEventListener('click', e => {
      if (!e.target.closest('#fzd-widget')) fermerMenu();
    });

    majBarre();
    appliquerEtat();
  }

  function afficher(data, confirmation) {
    console.log('[Foxyz->Dossier] Extrait :', data);
    document.getElementById('fzd-panel')?.remove();
    const row = (c, v) =>
      `<tr><td style="padding:4px 10px;color:#666;white-space:nowrap;vertical-align:top">${c}</td>
           <td style="padding:4px 10px;font-weight:600">${(v === '' || v == null) ? '<em style="color:#c00">(vide)</em>' : v}</td></tr>`;
    const devisAff = data.devis === null ? '<em style="color:#888">chargement...</em>'
                    : (data.devis || '<em style="color:#c00">(introuvable)</em>');
    const lignesHtml = data.lignes.map((l, i) => `
      <div style="border:1px solid #eee;border-radius:6px;margin:6px 0;padding:6px">
        <div style="font-size:12px;color:#999;margin-bottom:2px">Ligne ${i + 1}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${row('Designation', l.designation)}${row('Ref. article', l.ref_article)}
          ${row('Quantite', l.quantite)}${row('Commentaire', l.commentaire)}${row('Delai atelier', l.delai)}
        </table></div>`).join('');
    const panel = document.createElement('div');
    panel.id = 'fzd-panel';
    panel.style.cssText =
      'position:fixed;bottom:130px;right:20px;width:440px;max-height:72vh;overflow:auto;background:#fff;' +
      'border:2px solid #CB4315;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:99998;' +
      'font-family:Arial,sans-serif;font-size:13px';
    panel.innerHTML = `
      <div style="background:#CB4315;color:#fff;padding:10px 14px;font-weight:700;border-radius:8px 8px 0 0;
                  display:flex;justify-content:space-between;align-items:center">
        <span>Apercu - Commande N ${data.n_commande}</span>
        <span id="fzd-close" style="cursor:pointer;font-size:18px">&times;</span></div>
      <div style="padding:12px 14px">
        ${confirmation ? `<div style="background:#e8f5e9;color:#2e7d32;border-radius:6px;padding:8px;margin-bottom:10px;font-weight:700">${confirmation}</div>` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${row('N Affaire (= n commande)', data.n_commande)}${row('Date creation dossier', data.date_ouverture)}
          ${row('Client', data.client)}${row('Nom Client (contact)', data.contact)}
          ${row("Charge d'affaires", data.charge_affaires)}${row('N Devis', devisAff)}
        </table>
        <div style="margin:10px 0 4px;font-weight:700;color:#CB4315">Lignes (${data.lignes.length})</div>
        ${lignesHtml || '<em style="color:#c00">Aucune ligne</em>'}
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('fzd-close').onclick = () => panel.remove();
  }

  // =========================================================================
  // 6) ACTION PRINCIPALE
  // =========================================================================
  async function assurerOngletData() {
    if ($('#' + CHAMPS.n_commande).length) return true;
    const onglet = trouverOnglet(ONGLET_DATA);
    if (!onglet) return false;
    onglet.click();
    await attendre(() => $('#' + CHAMPS.n_commande).length, 5000);
    return $('#' + CHAMPS.n_commande).length > 0;
  }

  async function pousser() {
    if (!(await assurerOngletData())) {
      alert('Ouvre d abord une fiche COMMANDE.');
      return;
    }
    const data = extraireBase();
    if (!data) { alert('Ouvre d abord une fiche COMMANDE.'); return; }
    data.devis = null;
    afficher(data);                        // apercu immediat (dates client, devis en chargement)
    await enrichirDepuisRevue(data);       // bascule Revue : devis + delais revises, puis retour
    data.lignes.forEach(l => delete l._lc); // champ interne : on ne l'exporte pas
    const res = ajouterAuPanier(data);
    const msg = res.nouveau
      ? `\u2713 Commande ${data.n_commande} ajoutee au panier (${res.total} en attente)`
      : `\u21bb Commande ${data.n_commande} mise a jour (${res.total} en attente)`;
    afficher(data, msg);
    toast(msg);
  }

  // =========================================================================
  // 7) CONNECTEUR HUB (le seul code hub-related restant dans ce script)
  // =========================================================================
  function connecterHub(outil) {
    var t0 = Date.now();
    var t = setInterval(function () {
      if (window.__foxyz_hub__) {
        clearInterval(t);
        window.__foxyz_hub__.enregistrer(outil);
      } else if (Date.now() - t0 > 10000) {
        clearInterval(t);
        console.warn('[Foxyz-push-commande] Hub introuvable, outil non enregistre.');
      }
    }, 200);
  }

  // =========================================================================
  // 8) DEMARRAGE
  // =========================================================================
  const start = setInterval(() => {
    if (window.$ && document.body) {
      clearInterval(start);
      poserInterface(); // cree le widget, mais reste cache (display:none)

      connecterHub({
        id: 'push_commande',
        label: 'Push commande',
        icone: 'CMD',
        onOpen: function () {
          afficherWidget();
          basculerMenu();
        }
      });
    }
  }, 300);

})();