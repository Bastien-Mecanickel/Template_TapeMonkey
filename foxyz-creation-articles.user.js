// ==UserScript==
// @name         Foxyz - Création articles en masse
// @version      1.9
// @updateURL    https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-creation-articles.user.js
// @downloadURL  https://raw.githubusercontent.com/Bastien-Mecanickel/Template_TapeMonkey/main/foxyz-creation-articles.user.js
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
 *   execution de l'attribut natif fonction_a_lancer pose par Foxyz sur le
 *   champ famille, plutot que de simuler des evenements.
 * v1.5 : le bouton "Confirmer et creer" utilisait window.confirm(), une
 *   boite de dialogue native du navigateur. Firefox (et certaines
 *   extensions anti-popup) peuvent la desactiver silencieusement sur une
 *   page apres plusieurs alert/confirm/prompt enchaines - confirm()
 *   retourne alors false sans rien afficher et sans erreur, ce qui
 *   donnait l'impression que le bouton ne faisait plus rien. Remplace
 *   par une confirmation integree dans la fenetre de l'outil (bandeau
 *   Oui/Annuler), qui ne depend plus d'aucun reglage navigateur.
 * v1.6 : plans PDF (phase 1, controle seulement, rien n'est rattache). Zone
 *   de depot dans le panneau ; seul le NOM du fichier est lu (analyserNomPlan,
 *   teste par tests/parseur_plans.test.js). Le tableau de controle gagne, pour
 *   chaque plan, reference/indice/designation modifiables, type de document
 *   (liste reelle de l'instance) et presence en GED. Une ligne plan en erreur
 *   bloque la confirmation (bouton retirer). Le collage sans plan est inchange.
 * v1.7 : rattachement du plan (phase 2). Apres la creation de l'article, sur
 *   la fiche affichee : creation du document (reference, indice, type),
 *   transfert du fichier serveur dans le document, pastilles reglees selon
 *   CFG.visibilite, puis verification sur la fiche rechargee. Tout passe par
 *   les boutons natifs de Foxyz. Un echec de rattachement laisse l'article
 *   cree ("PLAN NON RATTACHE" au journal et dans la liste de fin).
 *   "GED" devient "Fichier serveur" (vocabulaire Foxyz) et le nom exact du
 *   fichier qui sera rattache est affiche. Bouton Enregistrer de l'article
 *   cible par son onclick (le bouton du document porte le meme id).
 *   Caracteres speciaux du code passes en \uXXXX.
 * v1.8 : controle "document deja existant". Foxyz accepte deux documents
 *   de meme reference et meme indice sans rien dire (observe sur TEMP).
 *   Le tableau bloque donc une ligne dont le document (reference + indice)
 *   existe deja, ou qui vise le meme document qu'une autre ligne du lot.
 *   Verification refaite juste avant de creer le document : s'il existe,
 *   rien n'est cree et la ligne passe en "PLAN NON RATTACHE".
 * v1.9 : plus besoin de deposer les plans sur le serveur a l'avance. Un PDF
 *   glisse dans l'outil et absent du serveur y est envoye au moment de la
 *   creation, par l'envoi natif de Foxyz (handleFileUpload, dans le panneau
 *   ouvert par l'icone de rattachement), puis rattache. L'outil ne lit pas
 *   le PDF : il le transmet tel quel. Deja sur le serveur avec la meme
 *   taille : on rattache celui-la. Meme nom mais autre taille : bloquant
 *   (ancienne version, fichier vide). Statut serveur affiche des le depot
 *   dans le panneau. Fenetre de controle elargie (96 % de l'ecran). Les
 *   messages Foxyz empiles ("visibilite mise a jour"...) sont vides a la
 *   fin de chaque article : ils defilaient plusieurs minutes apres un lot.
 *   Apres un lot 100 % reussi, seule la saisie est videe : le journal (numeros des
 *   articles et des documents) n'est plus efface 1,5 s apres la fin.
 */

(function () {
  'use strict';

  var NL = String.fromCharCode(10);
  console.log('[Foxyz-articles] script charge (v1.9)');

  var CFG = {
    formulaire: '../Formulaires/article_fournisseur.php',
    champ_reference: '#nom_article_four',
    champ_designation: '#description_article_four',
    // Sur une fiche existante, le bouton du bloc document porte le MEME id et arrive en premier :
    // on cible donc chaque bouton par sa fonction native.
    bouton_save: '[id="bouton_revue_contrat"][onclick*="enregistrer_article_fournisseur"]',
    bouton_doc: '[id="bouton_revue_contrat"][onclick*="enregistrer_document"]',
    titre_article: '.titre_formulaire_numer',
    champ_type: '#famille_fourniture',
    champ_famille: '#famille_article_four',
    champ_sous: '#sous_famille_article_four',
    champ_compte_achat: '#id_compte_comptable',
    champ_compte_vente: '#id_compte_comptable_vente',
    timeout_save: 8000, poll_save: 200, delai_entre_fiches: 800, delai_cascade: 2500,
    timeout_compta: 2500,
    timeout_envoi: 60000, // envoi d'un plan sur le serveur (gros PDF, connexion lente)
    // Pastilles du plan rattache (true = visible/vert). 'Interne' = pastille affichee "Atelier".
    visibilite: { Fournisseur: true, Interne: false },
    // Lectures seules, appelables depuis la page principale (sans fiche ouverte) :
    // liste des types de document (une div.reponse par type) et fichiers serveur (une div.ligne_fichier_recu par fichier)
    liste_types_doc: '../Listes/liste_type_document.php?id_objet=type_nouveau_document',
    // documents existants dont la reference CONTIENT le texte envoye (une ligne "DOC. N : REF Indice X (TYPE)" par document)
    liste_ref_doc: '../Listes/liste_reference_document.php?id_objet=reference_nouveau_document',
    liste_ged: 'maj_fichier_recus.php?liens_relatifs_copies=[]'
  };

  // ===== DEBUT PARSEUR PLANS (fonctions pures, testees par tests/parseur_plans.test.js)
  // On ne lit que le NOM du fichier, jamais son contenu. On ne devine jamais :
  // ce qui n'est pas reconnu reste vide et part dans a_completer (Bastien remplit).
  var PLANS = {
    // P.C. / P.E- en tete du nom : simple indice de type (mot-cle cherche dans la liste de l'instance)
    prefixes: { 'C': 'COULEE', 'E': 'ENSEMBLE' },
    // (SUFFIXE) en fin de nom
    suffixes: { 'PLAN ST': 'SOUS TRAITANCE' },
    indice_defaut: 'A'
  };

  // O barre (\u00D8 / \u00F8) = symbole de diametre : Foxyz l'ecrit O dans ses noms de fichiers (observe sur TEMP)
  function sansAccents(s) {
    return String(s).replace(/\u00D8/g, 'O').replace(/\u00F8/g, 'o').normalize('NFD').replace(/[\u0300-\u036F]/g, '');
  }
  // Cle de rapprochement avec les fichiers serveur : robuste au renommage Foxyz (accents, O barre, separateurs)
  function cleGed(nomSansExtension) {
    return sansAccents(nomSansExtension).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function sansExtension(nom) { return String(nom).replace(/\.[A-Za-z0-9]{1,5}$/, ''); }

  function analyserNomPlan(nom) {
    var r = { ok: false, nom: nom, reference_article: '', reference_doc: '', indice: '', indice_defaut: false,
      designation: '', prefixe: '', suffixe: '', mot_cle_type: '', cle_ged: '', a_completer: [], erreur: '' };
    var m = String(nom == null ? '' : nom).trim().match(/^(.*)\.pdf$/i);
    if (!m || !m[1].trim()) { r.erreur = 'PDF attendu'; return r; }
    var reste = m[1].trim();
    r.cle_ged = cleGed(reste);

    var p = reste.match(/^P\.([CE])(?:\.\s*|-)/i);
    if (p) { r.prefixe = 'P.' + p[1].toUpperCase(); r.mot_cle_type = PLANS.prefixes[p[1].toUpperCase()]; reste = reste.slice(p[0].length); }

    var s = reste.match(/\s*\(([^()]*)\)\s*$/);
    if (s) {
      r.suffixe = s[1].trim().toUpperCase();
      if (PLANS.suffixes[r.suffixe]) { r.mot_cle_type = PLANS.suffixes[r.suffixe]; }
      reste = reste.slice(0, s.index);
    }

    // Reference : lettres, puis groupes -chiffres, indice optionnel de 1 ou 2 lettres suivi d'un espace ou de la fin
    var ref = reste.match(/^([A-Z]+(?:-\d+)+)(?:-([A-Z]{1,2}))?(?=[\s\-]|$)/i);
    if (ref) {
      r.reference_doc = ref[1].toUpperCase();
      r.indice = ref[2] ? ref[2].toUpperCase() : PLANS.indice_defaut;
      r.indice_defaut = !ref[2];
      r.reference_article = r.reference_doc + '-' + r.indice;
      reste = reste.slice(ref[0].length);
    }
    // Sans reference reconnue, on ne propose une designation que derriere un prefixe connu (P.C. / P.E-)
    if (ref || r.prefixe) { r.designation = reste.replace(/^[\s\-]+/, '').replace(/\s+/g, ' ').trim().toUpperCase(); }

    if (!r.reference_article) { r.a_completer.push('reference'); r.a_completer.push('indice'); }
    if (!r.designation) { r.a_completer.push('designation'); }
    r.ok = true;
    return r;
  }
  // Mot-cle -> type de la liste de l'instance (TEMP et PROD n'ont pas les memes noms).
  // Un seul type correspond : on le propose. Zero ou plusieurs : '' (Bastien choisit).
  function resoudreTypeDoc(motCle, listeTypes) {
    if (!motCle) { return ''; }
    var k = sansAccents(motCle).toUpperCase();
    var trouves = listeTypes.filter(function (t) { return sansAccents(t).toUpperCase().indexOf(k) !== -1; });
    return trouves.length === 1 ? trouves[0] : '';
  }
  // ===== FIN PARSEUR PLANS

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
  // Attend que test() renvoie une valeur vraie ; sinon erreur avec le message donne
  function attendre(test, timeout, message) {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      var t = setInterval(function () {
        var v = test();
        if (v) { clearInterval(t); resolve(v); }
        else if (Date.now() - t0 > timeout) { clearInterval(t); reject(new Error(message)); }
      }, 150);
    });
  }
  // Vrai clic souris : declenche l'onclick natif de Foxyz, y compris sur une icone svg ou img
  function cliquer(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }
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
  function numeroArticle() { var t = norm(window.$(CFG.titre_article).text()); var m = t.match(/N[\u00B0\u00BAo]\s*([0-9]+)/i); return m ? m[1] : ''; }

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
  // Types de document existants sur CETTE instance (un type n'existe que s'il sert a au moins un document)
  function lireTypesDoc() {
    var rep = window.$.ajax({ url: CFG.liste_types_doc, method: 'POST', data: { date_saisi_info: 'x' }, async: false });
    if (rep.status !== 200) { throw new Error('liste des types de document : HTTP ' + rep.status); }
    return window.$('<div>').html(rep.responseText).find('.reponse').map(function () { return norm(window.$(this).text()); }).get()
      .filter(function (t) { return t !== ''; });
  }
  // PDF de l'espace prive des "Fichiers sur le serveur" : [{nom, cle}]. file() est la fonction native qui poste vers ../Lien_bdd/.
  function lireGed() {
    if (typeof window.file !== 'function') { throw new Error('fonction native file() introuvable'); }
    var html = String(window.file(CFG.liste_ged));
    var out = [];
    window.$('<div>').html(html).find('.ligne_fichier_recu[espace="prive"]').each(function () {
      var nom = window.$(this).attr('chemin_scan') || '';
      if (/\.pdf$/i.test(nom)) { out.push({ nom: nom, cle: cleGed(sansExtension(nom)), taille: norm(window.$(this).find('.col_taille_fichier_recu').text()) }); }
    });
    return out;
  }
  // Ou trouver le fichier du plan :
  //   present   : deja sur le serveur (meme nom, taille compatible avec le PDF depose) -> on le rattache
  //   a_envoyer : absent du serveur -> l'outil enverra le PDF depose au moment de la creation
  //   conflit   : meme nom mais taille differente (ancienne version, fichier vide...) -> on ne choisit pas
  //   doublon   : plusieurs fichiers de meme nom sur le serveur -> on ne choisit pas
  //   absent    : ni sur le serveur ni depose (ne devrait pas arriver)
  function statutGed(plan, ged) {
    var t = ged.filter(function (g) { return g.cle === plan.cle_ged; });
    plan.fichier_ged = ''; plan.taille_ged = '';
    if (t.length > 1) { plan.ged = 'doublon'; return; }
    if (t.length === 0) { plan.ged = plan.fichier_local ? 'a_envoyer' : 'absent'; return; }
    plan.fichier_ged = t[0].nom; plan.taille_ged = t[0].taille;
    plan.ged = (plan.fichier_local && !tailleCompatible(t[0].taille, plan.fichier_local.size)) ? 'conflit' : 'present';
  }
  // Taille affichee par Foxyz ("329 octets", "58.8 Ko", "1.2 Mo") -> octets ; null si illisible
  function tailleOctets(texte) {
    var m = norm(texte).replace(',', '.').match(/^([0-9.]+)\s*(octets?|Ko|Mo|Go)$/i);
    if (!m) { return null; }
    return parseFloat(m[1]) * { o: 1, k: 1024, m: 1048576, g: 1073741824 }[m[2].charAt(0).toLowerCase()];
  }
  // Foxyz arrondit sa taille : on tolere 10 % d'ecart. Taille illisible : on ne bloque pas sur une supposition.
  function tailleCompatible(texteServeur, octets) {
    var s = tailleOctets(texteServeur);
    return s === null || Math.abs(s - octets) <= 0.1 * Math.max(s, octets);
  }
  function tailleLisible(octets) {
    if (octets < 1024) { return octets + ' octets'; }
    if (octets < 1048576) { return (octets / 1024).toFixed(1) + ' Ko'; }
    return (octets / 1048576).toFixed(1) + ' Mo';
  }
  // Texte affiche pour le fichier d'un plan (panneau et tableau) ; ok = rien de bloquant
  function libelleFichier(plan) {
    var local = plan.fichier_local ? tailleLisible(plan.fichier_local.size) : '?';
    if (plan.ged === 'present') { return { ok: true, texte: 'sur le serveur : ' + plan.fichier_ged + ' (' + plan.taille_ged + ')' }; }
    if (plan.ged === 'a_envoyer') { return { ok: true, texte: 'sera envoye sur le serveur a la creation (' + local + ')' }; }
    if (plan.ged === 'conflit') { return { ok: false, texte: 'CONFLIT : ' + plan.fichier_ged + ' deja sur le serveur avec une autre taille (' + plan.taille_ged + ', ton PDF : ' + local + ')' }; }
    if (plan.ged === 'doublon') { return { ok: false, texte: 'DOUBLON : plusieurs fichiers de ce nom sur le serveur' }; }
    if (plan.ged === 'absent') { return { ok: false, texte: 'ABSENT du serveur' }; }
    return { ok: false, texte: 'fichiers serveur non lus' };
  }
  // Numeros des documents existants de MEME reference et MEME indice, ex. ['15', '21'].
  // Liste native appelee directement, en lecture : surtout pas via actualiser_cadre, qui clique
  // tout seul une suggestion unique (et une suggestion "DOC. N" rattache ce document a la fiche).
  function docsExistants(refDoc, indice) {
    var rep = window.$.ajax({ url: CFG.liste_ref_doc, method: 'POST', data: { reference_nouveau_document: refDoc }, async: false });
    if (rep.status !== 200) { throw new Error('liste des documents : HTTP ' + rep.status); }
    var out = [];
    window.$('<div>').html(rep.responseText).find('.reponse .document').each(function () {
      var m = norm(window.$(this).text()).match(/^([0-9]+) : (.*) Indice (\S+) \(/);
      if (m && norm(m[2]).toUpperCase() === refDoc.toUpperCase() && m[3].toUpperCase() === indice.toUpperCase()) { out.push(m[1]); }
    });
    return out;
  }
  // Pose plan.docs_existants (ou plan.erreur_docs si la liste n'a pas pu etre lue)
  function verifierDocExistant(plan) {
    plan.docs_existants = []; plan.erreur_docs = '';
    if (!norm(plan.ref_doc) || !norm(plan.indice)) { return; }
    try { plan.docs_existants = docsExistants(norm(plan.ref_doc), norm(plan.indice)); }
    catch (e) { plan.erreur_docs = e.message; }
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

  // ===== RATTACHEMENT DU PLAN (v1.7) : sequence de DIAGNOSTIC_PLANS.md section 5, boutons natifs uniquement
  // ouvrir_popup_total est asynchrone (animation du loader). On marque le titre de la fiche
  // affichee, puis on attend un titre NON marque portant le bon numero : c'est la fiche rechargee.
  function marquerFiche() { window.$(CFG.titre_article).attr('data-fx-ancienne', '1'); }
  function attendreFiche(numero, message) {
    return attendre(function () {
      var t = window.$(CFG.titre_article);
      return t.length && !t.attr('data-fx-ancienne') && numeroArticle() === String(numero) && window.$(CFG.bouton_doc).length > 0;
    }, CFG.timeout_save, message);
  }
  function rechargerFiche(numero, message) {
    marquerFiche();
    window.ouvrir_popup_total(CFG.formulaire + '?id_article_four=' + numero);
    return attendreFiche(numero, message);
  }
  // Ligne d'un document dans la fiche : "REF Indice X : TYPE (Doc N)"
  function ligneDoc(num) {
    var l = window.$('[id^="tr_liste_document_s_"]').filter(function () {
      var m = window.$(this).text().match(/\(Doc\s*(\d+)\)/);
      return m && m[1] === String(num);
    });
    return l.length ? l.first() : null;
  }
  function pastille(ligne, typeVisibilite) {
    return ligne.find('[onclick*="rendre_visibilite"]').filter(function () {
      return (this.getAttribute('onclick') || '').indexOf("'" + typeVisibilite + "'") !== -1;
    }).first();
  }
  function estVisible(p) { return p.find('.petit_rond').hasClass('fond_vert'); }

  // Lignes du panneau "Fichiers sur le serveur" (ouvert par Foxyz) dont le nom donne cette cle
  function lignesServeur(cle) {
    return window.$('#fichier_scan_deplacer_un_fichier .ligne_fichier_recu').filter(function () { return cleGed(sansExtension(this.getAttribute('chemin_scan') || '')) === cle; });
  }
  // Envoie le PDF depose dans le panneau que Foxyz vient d'ouvrir, exactement comme un glisser-deposer
  // dans ce panneau : handleFileUpload est la fonction native (elle n'envoie rien si le panneau n'a pas
  // ete ouvert par ranger_fichier_dans_archives). L'outil ne lit pas le PDF, il le transmet tel quel.
  // Renvoie la ligne du fichier une fois arrive sur le serveur (nom renomme par Foxyz).
  function envoyerPlan(p) {
    if (lignesServeur(p.cle_ged).length) { return Promise.reject(new Error('un fichier de meme nom est apparu sur le serveur, rien envoye')); }
    if (typeof window.handleFileUpload !== 'function') { return Promise.reject(new Error('fonction native handleFileUpload introuvable')); }
    window.handleFileUpload([p.fichier_local], window.$('#fichier_upload_deplacer_un_fichier'));
    return attendre(function () { var l = lignesServeur(p.cle_ged); return l.length === 1 ? l : null; }, CFG.timeout_envoi, 'envoi du plan sur le serveur non confirme')
      .then(function (l) { p.fichier_ged = l.attr('chemin_scan'); return l; });
  }
  // Foxyz empile ses messages "Confirmation..." (~6 s d'animation chacun, 4 a 5 par article avec
  // plan) : apres un lot, ils defilaient pendant des minutes. Le journal de l'outil donne deja le
  // resultat : on vide la file a la fin de chaque article.
  function viderMessagesFoxyz() { window.$('#message_information').stop(true, true).hide(); }

  // Fiche de l'article N affichee (juste apres sa creation). Renvoie {doc, visibilite}.
  // Toute erreur dit ou on en est (document cree ? fichier rattache ?) pour la reprise a la main.
  function rattacherPlan(art, numero) {
    var p = art.plan, doc = '', etape = '';
    return attendreFiche(numero, 'fiche de l article non affichee')
      .then(function () {
        // Dernier controle avant d'ecrire : Foxyz creerait un doublon sans rien dire
        var deja = docsExistants(p.ref_doc, p.indice);
        if (deja.length) { throw new Error('document deja existant (Doc ' + deja.join(', Doc ') + '), rien cree'); }
        window.$('#ajout_docs').show();
        if (norm(window.$('#id_nouveau_document').val())) { throw new Error('bloc document deja rempli'); }
        // Reference puis indice puis type, par .val() seul : ne jamais ouvrir la liste des
        // references, elle peut rattacher toute seule un document existant.
        window.$('#reference_nouveau_document').val(p.ref_doc);
        window.$('#indice_nouveau_document').val(p.indice);
        window.$('#type_nouveau_document').val(p.type_doc);
        var btn = window.$(CFG.bouton_doc);
        if (!btn.length) { throw new Error('bouton Enregistrer du document introuvable'); }
        marquerFiche();
        // enregistrer_document() : POST synchrone, ecrit le numero du document dans #id_nouveau_document, puis recharge la fiche
        cliquer(btn[0]);
        doc = norm(window.$('#id_nouveau_document').val());
        if (!/^[0-9]+$/.test(doc)) { doc = ''; throw new Error('document non cree (pas de numero en retour)'); }
        etape = 'Doc ' + doc + ' cree sans fichier, ';
        return attendreFiche(numero, 'fiche non rechargee apres creation du document');
      })
      .then(function () {
        var ligne = ligneDoc(doc);
        if (!ligne) { throw new Error('Doc ' + doc + ' absent de la fiche'); }
        var lien = ligne.find('img[src*="lien.png"]');
        if (!lien.length) { throw new Error('icone de rattachement introuvable'); }
        // Sinon le natif ne recharge pas la fiche apres le transfert (piege 2 du diagnostic)
        window.rechargeruniquementdiv = '';
        // ranger_fichier_dans_archives : Foxyz pose lui-meme le chemin serveur du document et liste les fichiers serveur
        cliquer(lien[0]);
        if (p.ged === 'a_envoyer') { return envoyerPlan(p).then(function (l) { etape = 'Doc ' + doc + ' cree, plan envoye sur le serveur (' + p.fichier_ged + ') mais non rattache, '; return l; }); }
        var l = window.$('#fichier_scan_deplacer_un_fichier .ligne_fichier_recu').filter(function () { return this.getAttribute('chemin_scan') === p.fichier_ged; });
        if (l.length !== 1) { throw new Error('fichier ' + p.fichier_ged + ' introuvable sur le serveur'); }
        return l;
      })
      .then(function (l) {
        cliquer(l.find('.icone_ajouter_fichier_recu svg')[0]);
        if (window.$('#fichier_final_deplacer_un_fichier .nom_fichier_a_uploader').length !== 1) { throw new Error('fichier non selectionne pour le transfert'); }
        marquerFiche();
        // enregistrer_deplacement_fichier_recus : transfert synchrone, puis rechargement de la fiche si succes
        cliquer(window.$('#deplacer_un_fichier .bouton_enregistrer')[0]);
        return attendreFiche(numero, 'transfert du fichier non confirme');
      })
      .then(function () {
        var ligne = ligneDoc(doc);
        var present = ligne && ligne.find('input.dirhid').filter(function () { return this.value === p.fichier_ged; }).length;
        if (!present) { throw new Error('fichier absent du document apres transfert'); }
        etape = 'Doc ' + doc + ' cree avec son fichier, ';
        // Pastilles en mode 'auto' = bascule : on ne clique que si l'etat n'est pas celui voulu
        Object.keys(CFG.visibilite).forEach(function (tv) {
          var pas = pastille(ligneDoc(doc), tv);
          if (!pas.length) { throw new Error('pastille ' + tv + ' introuvable'); }
          if (estVisible(pas) !== CFG.visibilite[tv]) { cliquer(pas[0]); }
        });
        return rechargerFiche(numero, 'fiche non rechargee apres les pastilles');
      })
      .then(function () {
        // Verification finale sur la fiche rechargee (c'est elle qui reste affichee)
        var ligne = ligneDoc(doc), etat = [];
        if (!ligne) { throw new Error('Doc ' + doc + ' absent de la fiche rechargee'); }
        Object.keys(CFG.visibilite).forEach(function (tv) {
          var vis = estVisible(pastille(ligne, tv));
          if (vis !== CFG.visibilite[tv]) { throw new Error('pastille ' + tv + ' non reglee'); }
          etat.push(tv.toLowerCase() + (vis ? ' visible' : ' invisible'));
        });
        return { doc: doc, visibilite: etat.join(', ') };
      })
      .catch(function (e) { throw new Error(etape + e.message); });
  }

  function lancer(articles, journal, setProgress, onSuccesTotal) {
    stop = false; var ok = 0, ko = 0, i = 0, erreurs = [], plansKo = [];
    function suivant() {
      if (stop || i >= articles.length) {
        journal(''); journal('=== TERMINE : ' + ok + ' cree(s), ' + ko + ' en erreur' + (plansKo.length ? ', ' + plansKo.length + ' plan(s) NON rattache(s)' : '') + ' ===');
        if (erreurs.length) { journal('--- References en erreur (a corriger et relancer) ---'); erreurs.forEach(function (e) { journal('  ' + e.reference + '  (' + e.raison + ')'); }); }
        if (plansKo.length) { journal('--- Articles crees, PLAN A RATTACHER A LA MAIN ---'); plansKo.forEach(function (e) { journal('  N' + String.fromCharCode(176) + e.numero + '  ' + e.reference + '  ' + e.fichier + '  (' + e.raison + ')'); }); }
        setProgress('termine');
        // Pas de fermerMoteur() ici : la derniere fiche creee reste
        // affichee pour verifier / terminer les codes comptables a la main.
        if (ko === 0 && plansKo.length === 0 && ok > 0 && onSuccesTotal) { onSuccesTotal(); }
        return;
      }
      var art = articles[i];
      setProgress((i + 1) + ' / ' + articles.length);
      creerArticle(art)
        .then(function (res) {
          var cat = art.type ? (' [' + [art.type, art.famille, art.sous].filter(Boolean).join(' > ') + ']') : '';
          if (!res.ok) { ko++; erreurs.push({ reference: art.reference, raison: res.raison }); journal('ERR ' + art.reference + ' - ' + res.raison); fermerMoteur(); return; }
          ok++;
          var compta = (res.compte_achat || res.compte_vente)
            ? (' (comptes ' + (res.compte_achat || '?') + '/' + (res.compte_vente || '?') + ')')
            : ' *** CODES COMPTABLES VIDES - A VERIFIER ***';
          var ligne = 'OK  N' + String.fromCharCode(176) + res.numero + '  ' + art.reference + ' - ' + art.designation + cat + compta;
          if (!art.plan) { journal(ligne); return; }
          // Un echec ici n'annule pas la creation : l'article reste cree, le plan part dans la liste de fin
          return rattacherPlan(art, res.numero).then(function (r) {
            journal(ligne + ' [plan : Doc ' + r.doc + ', ' + art.plan.type_doc + ', ' + r.visibilite + ']');
          }, function (e) {
            plansKo.push({ numero: res.numero, reference: art.reference, fichier: art.plan.fichier_ged || art.plan.nom, raison: e.message });
            journal(ligne + ' - article cree, PLAN NON RATTACHE (' + e.message + ')');
          });
        })
        .catch(function (e) { ko++; erreurs.push({ reference: art.reference, raison: e.message }); journal('ERR ' + art.reference + ' - ' + e.message); fermerMoteur(); })
        .then(function () { viderMessagesFoxyz(); i++; return sleep(CFG.delai_entre_fiches); })
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
    h += '<div id="fx_drop" style="margin-top:8px;border:2px dashed #CB4315;border-radius:6px;padding:8px;text-align:center;font-size:12px;color:#666;cursor:pointer;">Plans PDF (facultatif) : glisse-les ici ou clique pour choisir';
    h += '  <input id="fx_file" type="file" multiple accept=".pdf,application/pdf" style="display:none;"></div>';
    h += '<div id="fx_plans" style="font-size:11px;margin-top:4px;max-height:70px;overflow:auto;"></div>';
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
    Object.assign(modal.style, { background: '#fff', borderRadius: '8px', width: '96vw', maxWidth: '1500px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.5)', color: '#000', fontSize: '13px' });
    overlay.appendChild(modal);

    document.body.appendChild(panel);
    document.body.appendChild(overlay);

    logEl = panel.querySelector('#fx_log');
    progEl = panel.querySelector('#fx_prog');
    panel.querySelector('#fx_fermer').onclick = function () { panel.style.display = 'none'; };
    panel.querySelector('#fx_clear').onclick = function () { viderPanneau(); };
    panel.querySelector('#fx_stop').onclick = function () { stop = true; journal('Arret demande...'); };
    // Zone de depot : on ne lit que File.name. preventDefault sur tout le panneau, sinon
    // Firefox ouvre le PDF (ou le colle dans un textarea) quand on rate la zone.
    var drop = panel.querySelector('#fx_drop'), fileIn = panel.querySelector('#fx_file');
    function empecher(ev) { ev.preventDefault(); }
    panel.ondragover = empecher; panel.ondrop = empecher;
    drop.onclick = function (ev) { if (ev.target !== fileIn) { fileIn.click(); } };
    drop.ondragover = function (ev) { ev.preventDefault(); drop.style.background = '#fff2ec'; };
    drop.ondragleave = function () { drop.style.background = ''; };
    drop.ondrop = function (ev) { ev.preventDefault(); drop.style.background = ''; ajouterPlans(ev.dataTransfer.files); };
    fileIn.onchange = function () { ajouterPlans(fileIn.files); fileIn.value = ''; };
    panel.querySelector('#fx_plans').onclick = function (ev) {
      var i = ev.target.getAttribute && ev.target.getAttribute('data-retire-plan');
      if (i !== null && i !== undefined) { plansDeposes.splice(parseInt(i, 10), 1); afficherPlans(); }
    };
    panel.querySelector('#fx_next').onclick = function () {
      var articles = apparier(panel.querySelector('#fx_ref').value, panel.querySelector('#fx_des').value);
      plansDeposes.forEach(function (p) {
        articles.push({ reference: p.reference_article, designation: p.designation, type: '', famille: '', sous: '', probleme: null,
          plan: { nom: p.nom, cle_ged: p.cle_ged, ref_doc: p.reference_doc, indice: p.indice, indice_defaut: p.indice_defaut,
            suffixe: p.suffixe, mot_cle_type: p.mot_cle_type, type_doc: '', ged: '', fichier_ged: '', fichier_local: p.fichier_local } });
      });
      if (!articles.length) { journal('Rien a creer : colonnes vides et aucun plan.'); return; }
      ouvrirModale(articles);
    };
  }

  // Plans deposes dans le panneau : resultat de analyserNomPlan + le fichier lui-meme (fichier_local),
  // garde tel quel pour l'envoyer sur le serveur s'il n'y est pas. L'outil ne lit que son nom et sa taille.
  var plansDeposes = [];
  function ajouterPlans(fichiers) {
    Array.prototype.forEach.call(fichiers, function (f) {
      var a = analyserNomPlan(f.name);
      if (!a.ok) { journal('Ignore : ' + f.name + ' (' + a.erreur + ')'); return; }
      if (plansDeposes.some(function (p) { return p.nom === a.nom; })) { journal('Deja depose : ' + f.name); return; }
      a.fichier_local = f;
      plansDeposes.push(a);
    });
    // Statut serveur affiche des le depot, pour ne pas le decouvrir a la fin de la saisie
    try { var ged = lireGed(); plansDeposes.forEach(function (p) { statutGed(p, ged); }); }
    catch (e) { journal('Lecture des fichiers serveur impossible : ' + e.message); }
    afficherPlans();
  }
  function afficherPlans() {
    var h = '';
    plansDeposes.forEach(function (p, i) {
      var f = libelleFichier(p);
      h += '<div>' + echapper(p.nom) + ' <span data-retire-plan="' + i + '" title="Retirer" style="cursor:pointer;color:#c00;font-weight:bold;">\u2715</span>';
      h += ' <span style="color:' + (f.ok ? '#080' : '#c00') + ';' + (f.ok ? '' : 'font-weight:bold;') + '">' + echapper(f.texte) + '</span></div>';
    });
    panel.querySelector('#fx_plans').innerHTML = h;
  }
  // Vide la saisie (colonnes + plans). Le bouton "Vider" efface aussi le journal ; apres un lot reussi,
  // le journal reste affiche (il porte les numeros d'articles et de documents).
  function viderSaisie() { panel.querySelector('#fx_ref').value = ''; panel.querySelector('#fx_des').value = ''; plansDeposes = []; afficherPlans(); }
  function viderPanneau() { viderSaisie(); logEl.textContent = ''; setProgress(''); }
  function ouvrirPanneau() { if (!panel) { construirePanneau(); } panel.style.display = 'block'; }

  function ouvrirModale(articles) {
    // Modale neuve a chaque ouverture : sinon les ecouteurs s'empilent d'une ouverture a l'autre
    var neuve = modal.cloneNode(false); overlay.replaceChild(neuve, modal); modal = neuve;
    var typesDoc = [];
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
      if (a.plan) {
        m += '<td style="padding:4px;border-bottom:1px solid #eee;"><input data-champ="reference" data-row="' + idx + '" value="' + echapper(a.reference) + '" style="width:120px;font-family:monospace;font-size:12px;"></td>';
        m += '<td style="padding:4px;border-bottom:1px solid #eee;"><input data-champ="designation" data-row="' + idx + '" value="' + echapper(a.designation) + '" style="width:210px;font-size:12px;"></td>';
      } else {
        m += '<td style="padding:4px;border-bottom:1px solid #eee;font-family:monospace;">' + echapper(a.reference || '(vide)') + '</td>';
        m += '<td style="padding:4px;border-bottom:1px solid #eee;">' + echapper(a.designation || '(vide)') + '</td>';
      }
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><select data-lvl="type" data-row="' + idx + '" style="width:150px;font-size:11px;"></select></td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><select data-lvl="famille" data-row="' + idx + '" style="width:140px;font-size:11px;" disabled></select></td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><select data-lvl="sous" data-row="' + idx + '" style="width:140px;font-size:11px;" disabled></select></td>';
      m += '<td style="padding:4px;border-bottom:1px solid #eee;"><button data-apply="' + idx + '" title="Appliquer cette categorie a toutes les lignes" style="cursor:pointer;font-size:10px;">tous</button> <button data-retirer="' + idx + '" title="Retirer cette ligne du lot" style="cursor:pointer;font-size:10px;color:#c00;">retirer</button></td></tr>';
      if (a.plan) {
        m += '<tr data-plan-row="' + idx + '" style="background:#f4f8ff;"><td></td><td colspan="6" style="padding:4px 4px 8px;border-bottom:1px solid #eee;font-size:11px;">';
        m += 'Plan : <span style="font-family:monospace;">' + echapper(a.plan.nom) + '</span> &nbsp; ';
        m += 'Ref doc <input data-champ="ref_doc" data-row="' + idx + '" value="' + echapper(a.plan.ref_doc) + '" style="width:100px;font-family:monospace;font-size:11px;"> ';
        m += 'Indice <input data-champ="indice" data-row="' + idx + '" value="' + echapper(a.plan.indice) + '" style="width:30px;font-size:11px;"> ';
        m += 'Type doc <select data-champ="type_doc" data-row="' + idx + '" style="font-size:11px;max-width:170px;"></select>';
        m += '<div style="margin-top:3px;">Fichier : <span data-ged="' + idx + '" style="font-family:monospace;"></span></div>';
        m += '<div data-pb="' + idx + '" style="color:#c00;margin-top:2px;"></div></td></tr>';
      }
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
    // Problemes bloquants d'une ligne avec plan (les lignes collees sans plan ne changent pas)
    function problemesPlan(art, actifs) {
      var p = art.plan, pb = [], k = norm(art.reference).toUpperCase();
      if (!norm(art.reference)) { pb.push('reference article vide'); }
      if (!norm(art.designation)) { pb.push('designation vide'); }
      if (!norm(p.ref_doc)) { pb.push('reference document vide'); }
      if (!/^[A-Za-z]{1,2}$/.test(norm(p.indice))) { pb.push('indice : 1 ou 2 lettres'); }
      if (!p.type_doc) { pb.push('type de document a choisir'); }
      if (p.ged === 'conflit') { pb.push('un fichier de meme nom mais de taille differente est deja sur le serveur : supprime-le du serveur ou retire la ligne'); }
      else if (p.ged === 'doublon') { pb.push('plusieurs fichiers serveur de meme nom : supprimes-en sur le serveur ou retire la ligne'); }
      else if (p.ged === 'absent') { pb.push('plan absent du serveur'); }
      else if (p.ged !== 'present' && p.ged !== 'a_envoyer') { pb.push('fichiers serveur non lus'); }
      if (k && actifs.some(function (o) { return o !== art && norm(o.reference).toUpperCase() === k; })) { pb.push('reference en double dans le lot'); }
      // Le transfert DEPLACE le fichier : un meme fichier ne peut servir qu'a une ligne
      if (actifs.some(function (o) { return o !== art && o.plan && o.plan.cle_ged === p.cle_ged; })) { pb.push('meme fichier qu une autre ligne'); }
      // Document deja dans Foxyz (meme reference + meme indice) : change l'indice ou retire la ligne
      if (p.erreur_docs) { pb.push('documents existants non verifies (' + p.erreur_docs + ')'); }
      else if (p.docs_existants && p.docs_existants.length) { pb.push('document ' + p.ref_doc + ' indice ' + p.indice + ' existe deja (Doc ' + p.docs_existants.join(', Doc ') + ')'); }
      var cleDoc = norm(p.ref_doc).toUpperCase() + '|' + norm(p.indice).toUpperCase();
      if (norm(p.ref_doc) && actifs.some(function (o) { return o !== art && o.plan && norm(o.plan.ref_doc).toUpperCase() + '|' + norm(o.plan.indice).toUpperCase() === cleDoc; })) { pb.push('meme document qu une autre ligne'); }
      return pb;
    }
    // Remet a jour surlignage, messages et fichier serveur ; renvoie le nombre de lignes plan en erreur
    function controler() {
      var actifs = articles.filter(function (a) { return !a.retire; }), nbPb = 0;
      articles.forEach(function (a, idx) {
        var tr = modal.querySelector('tr[data-row="' + idx + '"]'), sub = modal.querySelector('tr[data-plan-row="' + idx + '"]');
        if (a.retire) { tr.style.display = 'none'; if (sub) { sub.style.display = 'none'; } return; }
        if (!a.plan) { return; }
        var pb = problemesPlan(a, actifs), g = modal.querySelector('[data-ged="' + idx + '"]');
        if (pb.length) { nbPb++; }
        tr.style.background = pb.length ? '#fff2f0' : '';
        modal.querySelector('[data-pb="' + idx + '"]').textContent = pb.join(' ; ');
        var f = libelleFichier(a.plan);
        g.textContent = f.texte; g.style.color = f.ok ? '#080' : '#c00'; g.style.fontWeight = 'bold';
      });
      return nbPb;
    }
    // Ref doc / indice modifies : on repropose la reference article tant que Bastien ne l'a pas saisie lui-meme
    function champModifie(el) {
      var row = parseInt(el.getAttribute('data-row'), 10), art = articles[row], c = el.getAttribute('data-champ'), v = norm(el.value);
      if (c === 'reference') { art.reference = v; art.ref_manuelle = true; }
      else if (c === 'designation') { art.designation = v; }
      else if (c === 'type_doc') { art.plan.type_doc = el.value; }
      else if (c === 'ref_doc' || c === 'indice') {
        art.plan[c] = v.toUpperCase(); el.value = art.plan[c];
        if (!art.ref_manuelle && art.plan.ref_doc && art.plan.indice) {
          art.reference = art.plan.ref_doc + '-' + art.plan.indice;
          modal.querySelector('input[data-champ="reference"][data-row="' + row + '"]').value = art.reference;
        }
        verifierDocExistant(art.plan);
      }
      controler();
    }
    lireArbre().then(function (arbre) {
      var types = Object.keys(arbre);
      etatEl.textContent = 'Arborescence lue : ' + types.length + ' type(s), ' + articles.length + ' article(s) a categoriser.';
      etatEl.style.color = '#080';
      modal.querySelectorAll('select[data-lvl="type"]').forEach(function (sel) { sel.innerHTML = opt(types, '-- Type --'); });
      if (articles.some(function (a) { return a.plan; })) {
        try {
          typesDoc = lireTypesDoc();
          var ged = lireGed();
          articles.forEach(function (a) { if (a.plan) { statutGed(a.plan, ged); verifierDocExistant(a.plan); a.plan.type_doc = resoudreTypeDoc(a.plan.mot_cle_type, typesDoc); } });
          modal.querySelectorAll('select[data-champ="type_doc"]').forEach(function (sel) {
            sel.innerHTML = opt(typesDoc, '-- Type doc --'); sel.value = articles[parseInt(sel.getAttribute('data-row'), 10)].plan.type_doc;
          });
          etatEl.textContent += ' Types de document : ' + typesDoc.length + ', PDF sur le serveur : ' + ged.length + '.';
        } catch (e) { etatEl.textContent += ' ERREUR lecture types / fichiers serveur : ' + e.message; etatEl.style.color = '#c00'; }
      }
      controler();
      btnConfirm.disabled = false;
    }).catch(function (e) { etatEl.textContent = 'Erreur lecture categories : ' + e.message; etatEl.style.color = '#c00'; });

    modal.addEventListener('change', function (ev) {
      if (ev.target.getAttribute && ev.target.getAttribute('data-champ')) { champModifie(ev.target); return; }
      var sel = ev.target; if (sel.tagName !== 'SELECT') { return; }
      var row = parseInt(sel.getAttribute('data-row'), 10), lvl = sel.getAttribute('data-lvl'), art = articles[row];
      if (lvl === 'type') { art.type = sel.value; art.famille = ''; art.sous = ''; majFamilles(row); }
      else if (lvl === 'famille') { art.famille = sel.value; art.sous = ''; majSous(row); }
      else if (lvl === 'sous') { art.sous = sel.value; }
    });
    modal.addEventListener('click', function (ev) {
      var b = ev.target;
      if (b.hasAttribute && b.hasAttribute('data-retirer')) {
        articles[parseInt(b.getAttribute('data-retirer'), 10)].retire = true; controler();
        msgEl.style.color = '#666'; msgEl.textContent = 'Ligne retiree du lot.'; return;
      }
      if (!b.hasAttribute || !b.hasAttribute('data-apply')) { return; }
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
      var actifs = articles.filter(function (a) { return !a.retire; });
      msgEl.style.color = '#c00';
      if (!actifs.length) { msgEl.textContent = 'Plus aucune ligne dans le lot.'; return; }
      var sansCat = actifs.filter(function (a) { return !a.type; });
      if (sansCat.length) { msgEl.textContent = sansCat.length + ' article(s) sans categorie. La categorie est obligatoire : complete avant de creer.'; return; }
      var nbPb = controler(), nbPlans = actifs.filter(function (a) { return a.plan; }).length, nbEnvois = actifs.filter(function (a) { return a.plan && a.plan.ged === 'a_envoyer'; }).length;
      if (nbPb) { msgEl.textContent = nbPb + ' ligne(s) plan a corriger ou a retirer (en rouge dans le tableau).'; return; }
      msgEl.textContent = '';
      modal.querySelector('#fx_confirmation_texte').textContent = 'Creer ' + actifs.length + ' article(s)' + (nbPlans ? ' dont ' + nbPlans + ' avec plan rattache' + (nbEnvois ? ' (' + nbEnvois + ' a envoyer sur le serveur)' : '') : '') + ' sur ' + location.hostname + ' ?';
      modal.querySelector('#fx_confirmation_zone').style.display = 'block';
    };
    modal.querySelector('#fx_confirmation_non').onclick = function () {
      modal.querySelector('#fx_confirmation_zone').style.display = 'none';
    };
    modal.querySelector('#fx_confirmation_oui').onclick = function () {
      modal.querySelector('#fx_confirmation_zone').style.display = 'none';
      overlay.style.display = 'none'; logEl.textContent = '';
      var aCreer = articles.filter(function (a) { return !a.retire; });
      journal('Lancement de ' + aCreer.length + ' creation(s)...');
      lancer(aCreer, journal, setProgress, function () { journal('Succes complet : la saisie a ete videe (le journal reste affiche).'); setTimeout(viderSaisie, 1500); });
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
