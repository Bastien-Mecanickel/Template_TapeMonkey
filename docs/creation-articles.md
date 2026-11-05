# Outil Foxyz : Création d'articles en masse (MECANICKEL)

Userscript Tampermonkey qui pilote l'ERP Foxyz "par-dessus" depuis le navigateur
(pas d'accès serveur). Ce fichier = connaissances stables du projet.
Chantier plans PDF (`CHANTIER_PLANS_PDF.md`) : terminé, v1.9 validée par Bastien le
27/10/2026 (voir `REPRISE.md` et `DIAGNOSTIC_PLANS.md`).

## Comment travailler avec Bastien
- Bastien est chargé d'affaires et administrateur IT chez MECANICKEL. Il veut
  **comprendre et maintenir le code lui-même** : pas de boîte noire, pas d'usine
  à gaz, commentaires sobres et utiles.
- Français, tutoiement, direct. Donne les compromis franchement.
- Méthode : **diagnostic d'abord** (observer ce que Foxyz fait réellement), code
  ensuite. Ne devine jamais un mécanisme Foxyz : une hypothèse non vérifiée a déjà
  coûté plusieurs allers-retours sur ce projet.
- Tester 1 ligne, puis 3, puis le lot réel. Toujours TEMP avant PROD.
- Fichier complet remplacé plutôt que patchs, `@version` bumpée, changelog en tête.
- Si une hypothèse est contredite par ce que tu observes, ou si tu tournes en rond
  (2 tentatives infructueuses sur le même point) : arrête-toi et rapporte.

## Instances et sécurité
- TEMP (test) : https://temp-mecanickel.gpao-foxyz.fr/ERP/
- PROD : https://mecanickel.gpao-foxyz.fr/ERP/
- **Écriture sur TEMP uniquement.** Jamais d'écriture sur PROD depuis cette session.
- **Identifiants : tu n'en as pas et tu n'en demandes pas.** Bastien se connecte
  lui-même dans la fenêtre Playwright (profil persistant `.playwright-profile/`).
  Page de login affichée ou session expirée : demande-lui de se reconnecter et attends
  son OK. Ne lis jamais `.env*` ni le contenu de `.playwright-profile/`.
- Git : dépôt local, **pas de remote, pas de push**. Un commit par phase.
  Bastien copie lui-même la version validée dans son dépôt Template_TapeMonkey.
- Données de test : références du type `ZZ-TEST-01-A`. En fin de session, liste ce
  qui a été créé sur TEMP (articles, documents) pour que Bastien nettoie.

## Fichiers du dossier
- `foxyz-creation-articles.user.js` : l'outil. Nom conservé (le `@updateURL` /
  `@downloadURL` GitHub en dépend, ne pas y toucher).
- `foxyz-hub.user.js` : le hub (pastille boîte à outils en bas à droite). **Ne pas
  modifier.** Chaque outil s'y branche avec `connecterHub()` (bloc en fin de script,
  à garder tel quel).
- `CHANTIER_PLANS_PDF.md` : mission en cours.

## Règles de code Tampermonkey / Firefox (critiques)
- `@grant none`. Jamais `unsafeWindow` (casse sous Firefox).
- **Aucun `\n` ni `\t` littéral dans les chaînes** : le script casse silencieusement.
  Utiliser `String.fromCharCode(10)` / `String.fromCharCode(9)`. Emojis en `\uXXXX`.
- `var` et `.then` (pas d'async/await).
- **Jamais `alert()`, `confirm()`, `prompt()`** : Firefox les désactive silencieusement
  après quelques appels (`confirm` renvoie alors `false` sans rien afficher, le bouton
  "ne fait plus rien"). Toute confirmation se fait dans l'UI de l'outil.
- Si un script refuse de tourner malgré un `@match` correct : supprimer l'entrée
  Tampermonkey et la recréer.
- Chaque version logue en console : `[Foxyz-articles] script charge (vX.Y)`.

## Mécanique Foxyz
- jQuery 3.7.1 (`window.$`). `ouvrir_popup_total('../Formulaires/XXX.php')` charge un
  formulaire dans `#cadre_total_formulaire` (AJAX). Aussi : `fermer_popup_total()`,
  `actualiser_cadre()`. `file()` / `file_post()` sont synchrones (warnings console normaux),
  mais **`ouvrir_popup_total` est asynchrone** (animation `#loader.show("fast", ...)`) :
  juste après l'appel, l'ancienne fiche est encore affichée. Pour attendre un
  rechargement : marquer le titre de la fiche affichée, puis attendre un titre non marqué
  (`marquerFiche()` / `attendreFiche()` dans l'outil).
- Messages `ouvrir_popup_information` : chacun empile ~6 s d'animation jQuery sur
  `#message_information` ; enchaînés, ils défilent pendant des minutes. Vider la file avec
  `$('#message_information').stop(true, true).hide()`.
- Les champs texte sont `type="search"`, **pas** `type="text"`. Cibler par `#id` exact
  ou par placeholder, jamais par type. Les IDs peuvent être trompeurs.
- Remplir un champ ordinaire : `.val(v)` puis `input`, `change`, `blur`, `focusout`
  (fonction `remplir()` de l'outil).
- Autocompletes Foxyz : portent `onkeyup="filtrer_input(...)"` et parfois un attribut
  `fonction_a_lancer="..."`. Choisir une suggestion appelle `element_selectionner(div)`,
  qui pose la valeur dans le champ désigné par la globale `id_input_selected_cadre`
  puis exécute (`eval`) `fonction_a_lancer`.
- Lire un attribut sur un formulaire **après** son chargement complet : un test lancé
  trop tôt peut donner un faux "(aucun)".

## Article fournisseur (= menu "Article")
- Formulaire `../Formulaires/article_fournisseur.php`. `article.php` est
  l'Industrialisation : ne pas confondre.
- `#nom_article_four` = référence (unique), `#description_article_four` = désignation,
  bouton `#bouton_revue_contrat` (`enregistrer_article_fournisseur()`). **Sur une fiche
  existante, deux éléments portent cet id** (celui du document arrive en premier) :
  cibler `[id="bouton_revue_contrat"][onclick*="enregistrer_article_fournisseur"]` ou
  `[onclick*="enregistrer_document"]`, jamais `#bouton_revue_contrat` seul.
- Catégories obligatoires, 3 niveaux : `#famille_fourniture` (type),
  `#famille_article_four` (famille), `#sous_famille_article_four` (sous-famille).
- Arbre des catégories : bouton `[onclick*="afficher_cascade"]` puis feuilles
  `.cascade li.clicable[onclick*="famille_fourniture"]`, texte `TYPE : FAMILLE : SOUS`
  (séparateur ` : `, parties vides possibles), toujours `trim()`. Sur PROD l'arbre est
  gros : lecture unique, jamais de pré-parcours massif.
- **Codes comptables (v1.4, acquis, ne pas casser)** : ils ne se posent que si on
  exécute l'attribut `fonction_a_lancer` du champ `#famille_article_four`
  (`recherche_compte_comptable('AF.')`, réponse `achat#vente#export`, ex.
  `604110#707000#`). Procédure : poser les 3 niveaux avec `.val()` **sans événement**,
  puis `eval` de l'attribut du champ famille, puis attendre `#id_compte_comptable` /
  `#id_compte_comptable_vente`. Seul le champ **famille** déclenche (jamais la
  sous-famille). `change`, `blur`, `focusout` ne déclenchent rien. L'outil ne calcule
  ni n'écrit jamais un compte lui-même : il déclenche le mécanisme natif, vérifie, et
  signale `*** CODES COMPTABLES VIDES - A VERIFIER ***` si besoin.
- Succès d'une création : `.titre_formulaire_numer` affiche un numéro ("Article N° 51").
  Échec : `#bouton_revue_contrat` redevient visible. "Référence existe déjà" = toast
  Foxyz (pas une alert, pas dans le formulaire).
- Réglages sensibles (à monter si PROD lente) : `delai_cascade` 2500, `timeout_save`
  8000, `timeout_compta` 2500, seuil 800 ms dans `attendreResultat`.
- Fin de lot : **pas de `fermerMoteur()`**, la dernière fiche créée reste affichée
  (Bastien termine la fiche à la main). `fermerMoteur()` seulement après une erreur.
- Confirmation de lancement : bandeau inline Oui/Annuler (jamais `confirm()`).

## Documents et plans PDF (v1.7 à v1.9, détail dans `DIAGNOSTIC_PLANS.md`)
- Vocabulaire : la "GED" se dit **"Fichiers sur le serveur"** (fichiers en attente de
  rattachement, espace privé par utilisateur), à distinguer de la liste des Documents.
  Le rattachement **déplace** le fichier : un fichier serveur ne sert qu'une fois.
- Le bloc document n'existe que sur un article déjà enregistré. Champs
  `#reference_nouveau_document`, `#indice_nouveau_document`, `#type_nouveau_document`
  posés par `.val()` seul ; `#id_nouveau_document` vide = nouveau document. Après le clic,
  `enregistrer_document()` écrit le n° du document dans `#id_nouveau_document`.
- Ne jamais ouvrir la liste des références de document via `actualiser_cadre` : elle clique
  seule une suggestion unique, et une suggestion "DOC. N" rattache ce document à la fiche.
- Documents existants (lecture) : `POST ../Listes/liste_reference_document.php?id_objet=reference_nouveau_document`
  avec `reference_nouveau_document=<ref>`, filtre "contient", une ligne
  `DOC. N : REF Indice X (TYPE)` par document. **Foxyz accepte deux documents de même
  référence et même indice** : c'est l'outil qui bloque le doublon.
- Types de document : la liste dépend de l'instance (TEMP `PLAN SOUS TRAITANCE`, PROD
  `PLAN DE SOUS TRAITANCE`) et un type n'existe que tant qu'un document l'utilise. Toujours
  lire `liste_type_document.php` au moment de l'usage, jamais de nom en dur.
- Rattacher : clic natif sur `img[src*="lien.png"]` de la ligne du document
  (`ranger_fichier_dans_archives`, qui pose lui-même le chemin serveur : ne jamais l'écrire
  en dur, il a déjà changé sur TEMP), puis ligne `.ligne_fichier_recu[chemin_scan]`, icône
  `.icone_ajouter_fichier_recu svg`, puis `#deplacer_un_fichier .bouton_enregistrer`.
  Remettre `rechargeruniquementdiv = ''` avant, sinon la fiche n'est pas rechargée.
- Envoi d'un fichier : `handleFileUpload(files, $('#fichier_upload_deplacer_un_fichier'))`
  (natif, asynchrone). **N'envoie rien hors du panneau ouvert par l'icône lien** : c'est
  `ranger_fichier_dans_archives` qui pose `accept=''` sur `#files`.
- Foxyz renomme les fichiers serveur (séparateurs en `_`, accents retirés, `Ø` en `O`) :
  rapprocher par la clé `cleGed()` (majuscules, seulement `A-Z0-9`), jamais par le nom brut.
  Taille dans `.col_taille_fichier_recu` ("329 octets", "58.8 Ko", Ko = 1024).
- Pastilles : `div[onclick*="rendre_visibilite"]` (`'Fournisseur'`, `'Interne'` = pastille
  "Atelier", `'Client'`), état sur `.petit_rond` (`fond_vert` / `fond_rouge`). Mode `'auto'`
  = bascule : tester la couleur avant de cliquer.

## Bug connu côté Foxyz, volontairement NON corrigé
Les fiches neuves sont pré-remplies avec l'unité `U : Unit&eacute;` (entité HTML non
décodée) dans `#unite_article_four` et `#unite_int_af`. C'est un bug Foxyz (mise à jour
récente), à corriger par l'éditeur. Ne pas le contourner dans l'outil sans demande.

Dans la liste des documents d'une fiche, Foxyz affiche la taille des fichiers **divisée
par 8192** ("7.35 Ko" pour 60 194 octets). Défaut d'affichage seulement : le fichier
téléchargé est intact.

## Tests
- Playwright MCP (Chromium) pour valider la mécanique Foxyz sur TEMP.
- Il n'y a **pas de Tampermonkey** dans Playwright : injecter le source du userscript
  via `browser_evaluate` une fois la page chargée (d'abord le hub, puis l'outil).
  Avec `@grant none`, le comportement est équivalent. Méthode qui marche : créer un
  `input type=file` dans la page (une fois le `body` chargé), `browser_file_upload` des deux
  scripts, lecture `FileReader` puis `eval`.
- Fichiers de test sur le serveur : jamais de PDF vides aux noms des vrais plans (ils ont
  déjà été rattachés par erreur). Utiliser des noms `ZZ-...` et des PDF factices de taille
  réaliste.
- Les pièges propres à Firefox + Tampermonkey ne se reproduisent pas sous Playwright :
  le test final est **manuel, par Bastien, dans Firefox**. À chaque phase, fournis une
  checklist courte de test manuel (quoi déposer, quoi cliquer, quoi vérifier).
  Évite dans le code tout ce qui ne marche que sous Chromium.
