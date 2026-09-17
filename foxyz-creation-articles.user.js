// ==UserScript==
// @name         Foxyz - Création articles en masse
// @namespace    mecanickel
// @version      1.5
// @match        https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/*
// @match        https://*.gpao-foxyz.fr/ERP/Interfaces/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * v1.0 : le hub est desormais un script a part (foxyz-hub.user.js).
 * v1.1 : focusout ajoute dans remplir(), fin de lot sans fermerMoteur().
 * v1.2 : pose des 3 niveaux de categorie sans evenement, puis une seule
 *   validation sur le niveau le plus profond rempli.
 * v1.3 : correction - seul le champ FAMILLE declenche la recherche des
 *   comptes comptables, jamais la sous-famille.
 * v1.4 : mecanisme definitif pour les comptes comptables - lecture et
 *   execution de l'attribut natif fonction_a_lancer pose par Foxyz sur
 *   le champ famille, plutot que de simuler des evenements.
 * v1.5 : le bouton "Confirmer et creer" utilisait window.confirm(), une
 *   boite de dialogue native du navigateur. Firefox (et certaines
 *   extensions anti-popup) peuvent la desactiver silencieusement sur une
 *   page apres plusieurs alert/confirm/prompt enchaines - confirm()
 *   retourne alors false sans rien afficher et sans erreur, ce qui
 *   donnait l'impression que le bouton ne faisait plus rien. Remplace
 *   par une confirmation integree dans la fenetre de l'outil (bandeau
 *   Oui/Annuler), qui ne depend plus d'aucun reglage navigateur.
 */

(function () {
  'use strict';

  var NL = String.fromCharCode(10);
  console.log('[Foxyz-articles] script charge (v1.5)');

  var CFG = {
    formulaire: '../Formulaires/article_fournisseur.php',
    champ_reference: '#nom_article_four',
    champ_designation: '#description_article_four',
    bouton_save: '#bouton_revue_contrat',
    titre_article: '.titre_formulaire_numer',
    champ_type: '#famille_fourniture',
    champ_famille: '#famille_article_four',
    champ_sous: '#sous_famille_article_four',
    champ_compte_achat: '#id_compte_comptable',
    champ_compte_vente: '#id_compte_comptable_vente',
    timeout_save: 8000, poll_save: 200, delai_entre_fiches: 800, delai_cascade: 2500,
    timeout_compta: 2500
  };

  var stop = false;
  var arbreCat = null;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitForReady() {
    return new Promise(function (resolve) {
      var t = setInterval(function () {
        if (window.$ && typeof window.ouvrir_popup_total === 'function') { clearInterval(t); resolve(); }
      }, 200);
    });
  }
  function waitForElement(sel, timeout) {
    timeout = timeout || 8000;
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      var t = setInterval(function () {
        var el = window.$(sel);
        if (el.length) { clearInterval(t); resolve(el); }
        else if (Date.now() - t0 > timeout) { clearInterval(t); reject(new Error('Timeout : ' + sel)); }
      }, 150);
    });
  }
  function remplir(sel, valeur) {
    var el = window.$(sel);
    el.val(valeur);
    el.trigger('input');
    el.trigger('change');
    el.trigger('blur');
    el.trigger('focusout');
  }
  // Pose la valeur SANS declencher d'evenement - sert a remplir les 3
  // niveaux de categorie avant de declencher la recherche des comptes
  // comptables une seule fois (voir declencherComptabilite).
  function poserCategorie(sel, valeur) { window.$(sel).val(valeur); }

  // Lit l'attribut natif fonction_a_lancer pose par Foxyz sur le champ
  // famille et l'execute tel quel. C'est exactement ce que Foxyz declenche
  // en interne quand on clique une suggestion de categorie a la main.
  function declencherComptabilite() {
    var instruction = window.$(CFG.champ_famille).attr('fonction_a_lancer');
    if (!instruction) { return false; }
    try { eval(instruction); return true; }
    catch (e) { console.warn('[Foxyz-articles] erreur eval fonction_a_lancer : ' + e.message); return false; }
  }

  function echapper(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s == null ? '' : s).trim(); }
  function numeroArticle() { var t = norm(window.$(CFG.titre_article).text()); var m = t.match(/N[°ºo]\s*([0-9]+)/i); return m ? m[1] : ''; }

  function attendreCodesComptables() {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      var t = setInterval(function () {
        var rempli = norm(window.$(CFG.champ_compte_achat).val()) || norm(window.$(CFG.champ_compte_vente).val());
        if (rempli || (Date.now() - t0 > CFG.timeout_compta)) { clearInterval(t); resolve(); }
      }, 150);
    });
  }

  function lireArbre() {
    if (arbreCat) { return Promise.resolve(arbreCat); }
    window.ouvrir_popup_total(CFG.formulaire);
    return waitForElement(CFG.champ_type)
      .then(function () { return sleep(500); })
      .then(function () {
        var btn = window.$('[onclick*="afficher_cascade"]').first();
        if (!btn.length) { throw new Error('bouton afficher_cascade introuvable'); }
        btn.click(); return sleep(CFG.delai_cascade);
      })
      .then(function () {
        var feuilles = document.querySelectorAll('.cascade li.clicable[onclick*="famille_fourniture"]');
        if (!feuilles.length) { throw new Error('aucune feuille de categorie trouvee'); }
        var arbre = {};
        feuilles.forEach(function (f) {
          var parts = f.textContent.split(' : ');
          var type = norm(parts[0]), fam = norm(parts[1]), sous = norm(parts[2]);
          if (!type) { return; }
          if (!arbre[type]) { arbre[type] = {}; }
          if (fam) { if (!arbre[type][fam]) { arbre[type][fam] = []; } if (sous && arbre[type][fam].indexOf(sous) === -1) { arbre[type][fam].push(sous); } }
        });
        arbreCat = arbre;
        var mfr = document.getElementById('modification_fiche_reglage');
        if (mfr) { mfr.style.display = 'none'; }
        return arbre;
      });
  }
  function fermerMoteur() { if (typeof window.fermer_popup_total === 'function') { try { window.ouvrir_popup_total_bloquer = false; window.fermer_popup_total(); } catch (e) {} } }

  function decouper(texte) { var l = texte.split(NL).map(function (x) { return x.trim(); }); while (l.length && l[l.length - 1] === '') { l.pop(); } return l; }
  function apparier(txtRef, txtDes) {
    var refs = decouper(txtRef), dess = decouper(txtDes), n = Math.max(refs.length, dess.length), out = [];
    for (var i = 0; i < n; i++) {
      var r = refs[i] || '', d = dess[i] || '';
      if (r === '' && d === '') { continue; }
      var pb = null;
      if (r === '') { pb = 'reference manquante'; } else if (d === '') { pb = 'designation manquante'; }
      out.push({ reference: r, designation: d, type: '', famille: '', sous: '', probleme: pb });
    }
    var vus = {};
    out.forEach(function (a) { if (!a.reference) { return; } var k = a.reference.toUpperCase(); if (vus[k]) { a.probleme = a.probleme || 'reference en double dans le lot'; } vus[k] = true; });
    return out;
  }

  function attendreResultat() {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      var t = setInterval(function () {
        var num = numeroArticle();
        var saveVisible = window.$(CFG.bouton_save + ':visible').length > 0;
        if (num) {
          clearInterval(t);
          resolve({
            ok: true,
            numero: num,
            compte_achat: norm(window.$(CFG.champ_compte_achat).val()),
            compte_vente: norm(window.$(CFG.champ_compte_vente).val())
          });
        }
        else if (saveVisible && (Date.now() - t0 > 800)) { clearInterval(t); resolve({ ok: false, raison: 'refus (reference existante ou champ invalide)' }); }
        else if (Date.now() - t0 > CFG.timeout_save) { clearInterval(t); resolve({ ok: false, raison: 'timeout (pas de confirmation)' }); }
      }, CFG.poll_save);
    });
  }
  function creerArticle(art) {
    window.ouvrir_popup_total(CFG.formulaire);
    return waitForElement(CFG.champ_reference)
      .then(function () { return sleep(400); })
      .then(function () {
        remplir(CFG.champ_reference, art.reference);
        remplir(CFG.champ_designation, art.designation);
        if (!art.type) { return; }
        poserCategorie(CFG.champ_type, art.type);
        poserCategorie(CFG.champ_famille, art.famille || '');
        poserCategorie(CFG.champ_sous, art.sous || '');
        declencherComptabilite();
        return attendreCodesComptables();
      })
      .then(function () {
        var btn = window.$(CFG.bouton_save);
        if (!btn.length) { throw new Error('Bouton Enregistrer introuvable'); }
        btn.click(); return attendreResultat();
      });
  }
  function lancer(articles, journal, setProgress, onSuccesTotal) {
    stop = false; var ok = 0, ko = 0, i = 0, erreurs = [];
    function suivant() {
      if (stop || i >= articles.length) {
        journal(''); journal('=== TERMINE : ' + ok + ' cree(s), ' + ko + ' en erreur ===');
        if (erreurs.length) { journal('--- References en erreur (a corriger et relancer) ---'); erreurs.forEach(function (e) { journal('  ' + e.reference + '  (' + e.raison + ')'); }); }
        setProgress('termine');
        // Pas de fermerMoteur() ici : la derniere fiche creee reste
        // affichee pour verifier / terminer les codes comptables a la main.
        if (ko === 0 && ok > 0 && onSuccesTotal) { onSuccesTotal(); }
        return;
      }
      var art = articles[i];
      setProgress((i + 1) + ' / ' + articles.length);
      creerArticle(art)
        .then(function (res) {
          var cat = art.type ? (' [' + [art.type, art.famille, art.sous].filter(Boolean).join(' > ') + ']') : '';
          if (res.ok) {
            ok++;
            var compta = (res.compte_achat || res.compte_vente)
              ? (' (comptes ' + (res.compte_achat || '?') + '/' + (res.compte_vente || '?') + ')')
              : ' *** CODES COMPTABLES VIDES - A VERIFIER ***';
            journal('OK  N' + String.fromCharCode(176) + res.numero + '  ' + art.reference + ' - ' + art.designation + cat + compta);
          }
          else { ko++; erreurs.push({ reference: art.reference, raison: res.raison }); journal('ERR ' + art.reference + ' - ' + res.raison); fermerMoteur(); }
        })
        .catch(function (e) { ko++; erreurs.push({ reference: art.reference, raison: e.message }); journal('ERR ' + art.reference + ' - ' + e.message); fermerMoteur(); })
        .then(function () { i++; return sleep(CFG.delai_entre_fiches); })
        .then(suivant);
    }
    suivant();
  }

  var panel, overlay, modal, logEl, progEl;
  function journal(msg) { logEl.textContent += msg + NL; logEl.scrollTop = logEl.scrollHeight; }
  function setProgress(t) { progEl.textContent = t; }

  function construirePanneau() {
    panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', top: '140px', right: '20px', zIndex: 999998, width: '620px',
      background: '#fff', border: '2px solid #CB4315', borderRadius: '8px', padding: '12px',
      display: 'none', fontFamily: 'sans-serif', fontSize: '13px', color: '#000', boxShadow: '0 4px 16px rgba(0,0,0,.4)'
    });
    var h = '';
    h += '<div style="display:flex;align-items:center;margin-bottom:4px;">';
    h += '  <span style="font-weight:bold;color:#CB4315;flex:1;">Creation d articles en masse</span>';
    h += '  <span id="fx_fermer" title="Fermer" style="cursor:pointer;color:#888;font-weight:bold;padding:0 4px;">\u2715</span>';
    h += '</div>';
    h += '<div style="font-size:11px;color:#666;margin-bottom:8px;">Une ligne par article. Ligne N de gauche = ligne N de droite.</div>';
    h += '<div style="display:flex;gap:8px;">';
    h += '  <div style="flex:1;"><div style="font-size:11px;font-weight:bold;margin-bottom:2px;">REFERENCE</div>';
    h += '    <textarea id="fx_ref" style="width:100%;height:170px;font-family:monospace;font-size:12px;box-sizing:border-box;"></textarea></div>';
    h += '  <div style="flex:1;"><div style="font-size:11px;font-weight:bold;margin-bottom:2px;">DESIGNATION</div>';
    h += '    <textarea id="fx_des" style="width:100%;height:170px;font-family:monospace;font-size:12px;box-sizing:border-box;"></textarea></div>';
    h += '</div>';
    h += '<div style="margin:8px 0;display:flex;gap:6px;align-items:center;">';
    h += '  <button id="fx_next" style="cursor:pointer;background:#CB4315;color:#fff;border:none;padding:6px 14px;border-radius:4px;font-weight:bold;">Suivant : categories</button>';
    h += '  <button id="fx_clear" style="cursor:pointer;">Vider</button>';
    h += '  <button id="fx_stop" style="cursor:pointer;">Stop</button>';
    h += '  <span id="fx_prog" style="margin-left:auto;font-weight:bold;"></span>';
    h += '</div>';
    h += '<pre id="fx_log" style="height:110px;overflow:auto;background:#f5f5f5;padding:6px;margin:0;font-size:11px;white-space:pre-wrap;"></pre>';
    panel.innerHTML = h;

    overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', zIndex: 999999, background: 'rgba(0,0,0,.55)', display: 'none', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' });
    modal = document.createElement('div');
    Object.assign(modal.style, { background: '#fff', borderRadius: '8px', width: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.5)', color: '#000', fontSize: '13px' });
    overlay.appendChild(modal);

    document.body.appendChild(panel);
    document.body.appendChild(overlay);

    logEl = panel.querySelector('#fx_log');
    progEl = panel.querySelector('#fx_prog');
    panel.querySelector('#fx_fermer').onclick = function () { panel.style.display = 'none'; };
    panel.querySelector('#fx_clear').onclick = function () { viderPanneau(); };
    panel.querySelector('#fx_stop').onclick = function () { stop = true; journal('Arret demande...'); };
    panel.querySelector('#fx_next').onclick = function () {
      var articles = apparier(panel.querySelector('#fx_ref').value, panel.querySelector('#fx_des').value);
      if (!articles.length) { journal('Rien a creer : colonnes vides.'); return; }
      ouvrirModale(articles);
    };
  }
  function viderPanneau() { panel.querySelector('#fx_ref').value = ''; panel.querySelector('#fx_des').value = ''; logEl.textContent = ''; setProgress(''); }
  function ouvrirPanneau() { if (!panel) { construirePanneau(); } panel.style.display = 'block'; }

  function ouvrirModale(articles) {
    var m = '';
    m += '<div style="padding:14px 16px;border-bottom:1px solid #ddd;">';
    m += '  <div style="font-weight:bold;color:#CB4315;font-size:15px;">Categorisation et confirmation</div>';
    m += '  <div id="fx_etat" style="margin-top:4px;font-size:12px;color:#888;">Lecture de l arborescence des categories...</div>';
    m += '</div>';
    m += '<div style="overflow:auto;flex:1;padding:0 16px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
    m += '<thead><tr style="position:sticky;top:0;background:#fff;">';
    m += '<th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;width:28px;">#</th>';
    m += '<th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;">Reference</th>';
    m += '<th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;">Designation</th>';
    m += '<th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;">Type</th>';
    m += '<th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;">Famille</th>';
    m += '<th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;">Sous-famille</th>';
    m += '<th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;width:50px;"></th></tr></thead><tbody>';
    articles.forEach(function (a, idx) {
      var bg = a.probleme ? 'background:#fff2f0;' : '';
      m += '<tr data-row="' + idx + '" style="' + bg + '">';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;color:#999;">' + (idx + 1) + '</td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;font-family:monospace;">' + echapper(a.reference || '(vide)') + '</td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;">' + echapper(a.designation || '(vide)') + '</td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><select data-lvl="type" data-row="' + idx + '" style="width:150px;font-size:11px;"></select></td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><select data-lvl="famille" data-row="' + idx + '" style="width:140px;font-size:11px;" disabled></select></td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><select data-lvl="sous" data-row="' + idx + '" style="width:140px;font-size:11px;" disabled></select></td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><button data-apply="' + idx + '" title="Appliquer cette categorie a toutes les lignes" style="cursor:pointer;font-size:10px;">tous</button></td></tr>';
    });
    m += '</tbody></table></div>';
    m += '<div style="padding:12px 16px;border-top:1px solid #ddd;">';
    m += '  <div style="display:flex;gap:8px;align-items:center;">';
    m += '    <span id="fx_msg" style="font-size:12px;color:#666;"></span>';
    m += '    <button id="fx_annuler" style="margin-left:auto;cursor:pointer;padding:7px 14px;">Annuler</button>';
    m += '    <button id="fx_confirmer" style="cursor:pointer;background:#CB4315;color:#fff;border:none;padding:7px 18px;border-radius:4px;font-weight:bold;" disabled>Confirmer et creer</button>';
    m += '  </div>';
    m += '  <div id="fx_confirmation_zone" style="display:none;margin-top:10px;padding:10px;background:#fff7f2;border:1px solid #CB4315;border-radius:6px;text-align:right;">';
    m += '    <span id="fx_confirmation_texte" style="font-size:12px;color:#333;margin-right:10px;"></span>';
    m += '    <button id="fx_confirmation_non" style="cursor:pointer;padding:6px 12px;margin-right:6px;">Annuler</button>';
    m += '    <button id="fx_confirmation_oui" style="cursor:pointer;background:#CB4315;color:#fff;border:none;padding:6px 16px;border-radius:4px;font-weight:bold;">Oui, creer</button>';
    m += '  </div>';
    m += '</div>';
    modal.innerHTML = m;
    overlay.style.display = 'flex';

    var etatEl = modal.querySelector('#fx_etat'), msgEl = modal.querySelector('#fx_msg'), btnConfirm = modal.querySelector('#fx_confirmer');
    function opt(v, p) { var html = '<option value="">' + (p || '--') + '</option>'; v.forEach(function (x) { html += '<option value="' + echapper(x) + '">' + echapper(x) + '</option>'; }); return html; }
    function selType(r) { return modal.querySelector('select[data-lvl="type"][data-row="' + r + '"]'); }
    function selFamille(r) { return modal.querySelector('select[data-lvl="famille"][data-row="' + r + '"]'); }
    function selSous(r) { return modal.querySelector('select[data-lvl="sous"][data-row="' + r + '"]'); }
    function majFamilles(row) {
      var art = articles[row], sf = selFamille(row), ss = selSous(row);
      var familles = (art.type && arbreCat[art.type]) ? Object.keys(arbreCat[art.type]) : [];
      if (familles.length) { sf.innerHTML = opt(familles, '-- Famille --'); sf.disabled = false; } else { sf.innerHTML = '<option value="">(aucune)</option>'; sf.disabled = true; }
      ss.innerHTML = '<option value="">-</option>'; ss.disabled = true;
    }
    function majSous(row) {
      var art = articles[row], ss = selSous(row);
      var sl = (art.type && art.famille && arbreCat[art.type] && arbreCat[art.type][art.famille]) ? arbreCat[art.type][art.famille] : [];
      if (sl.length) { ss.innerHTML = opt(sl, '-- Sous-famille --'); ss.disabled = false; } else { ss.innerHTML = '<option value="">(aucune)</option>'; ss.disabled = true; }
    }
    lireArbre().then(function (arbre) {
      var types = Object.keys(arbre);
      etatEl.textContent = 'Arborescence lue : ' + types.length + ' type(s), ' + articles.length + ' article(s) a categoriser.';
      etatEl.style.color = '#080';
      modal.querySelectorAll('select[data-lvl="type"]').forEach(function (sel) { sel.innerHTML = opt(types, '-- Type --'); });
      btnConfirm.disabled = false;
    }).catch(function (e) { etatEl.textContent = 'Erreur lecture categories : ' + e.message; etatEl.style.color = '#c00'; });

    modal.addEventListener('change', function (ev) {
      var sel = ev.target; if (sel.tagName !== 'SELECT') { return; }
      var row = parseInt(sel.getAttribute('data-row'), 10), lvl = sel.getAttribute('data-lvl'), art = articles[row];
      if (lvl === 'type') { art.type = sel.value; art.famille = ''; art.sous = ''; majFamilles(row); }
      else if (lvl === 'famille') { art.famille = sel.value; art.sous = ''; majSous(row); }
      else if (lvl === 'sous') { art.sous = sel.value; }
    });
    modal.addEventListener('click', function (ev) {
      var b = ev.target; if (!b.hasAttribute || !b.hasAttribute('data-apply')) { return; }
      var src = parseInt(b.getAttribute('data-apply'), 10), art = articles[src];
      if (!art.type) { msgEl.textContent = 'Choisis d abord une categorie sur cette ligne.'; return; }
      articles.forEach(function (other, idx) {
        other.type = art.type; other.famille = art.famille; other.sous = art.sous;
        var st = selType(idx); if (st) { st.value = art.type; }
        majFamilles(idx);
        var sf = selFamille(idx); if (sf) { sf.value = art.famille || ''; }
        majSous(idx);
        var ss = selSous(idx); if (ss) { ss.value = art.sous || ''; }
      });
      msgEl.textContent = 'Categorie appliquee a ' + articles.length + ' ligne(s).';
    });
    modal.querySelector('#fx_annuler').onclick = function () { overlay.style.display = 'none'; fermerMoteur(); journal('Annule.'); };
    modal.querySelector('#fx_confirmer').onclick = function () {
      var sansCat = articles.filter(function (a) { return !a.type; });
      if (sansCat.length) { msgEl.textContent = sansCat.length + ' article(s) sans categorie. La categorie est obligatoire : complete avant de creer.'; msgEl.style.color = '#c00'; return; }
      modal.querySelector('#fx_confirmation_texte').textContent = 'Creer ' + articles.length + ' article(s) sur ' + location.hostname + ' ?';
      modal.querySelector('#fx_confirmation_zone').style.display = 'block';
    };
    modal.querySelector('#fx_confirmation_non').onclick = function () {
      modal.querySelector('#fx_confirmation_zone').style.display = 'none';
    };
    modal.querySelector('#fx_confirmation_oui').onclick = function () {
      modal.querySelector('#fx_confirmation_zone').style.display = 'none';
      overlay.style.display = 'none'; logEl.textContent = '';
      journal('Lancement de ' + articles.length + ' creation(s)...');
      lancer(articles, journal, setProgress, function () { journal('Succes complet : le formulaire a ete vide.'); setTimeout(viderPanneau, 1500); });
    };
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
        console.warn('[Foxyz-articles] Hub introuvable, outil non enregistre.');
      }
    }, 200);
  }

  waitForReady().then(function () {
    connecterHub({ id: 'creation_articles', label: 'Creation articles', icone: 'ART', onOpen: ouvrirPanneau });
    console.log('[Foxyz-articles] enregistre dans le hub');
  });
})();