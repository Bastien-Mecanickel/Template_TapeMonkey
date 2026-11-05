# Diagnostic phase 0 : rattachement de plans PDF (TEMP, 12/10/2026)

Observé sur TEMP avec Playwright, enregistreur AJAX posé sur `XMLHttpRequest`.
Données de test créées : voir la fin du fichier.

## 1. Hypothèses du chantier : confirmées / infirmées

| Hypothèse (CHANTIER_PLANS_PDF.md) | Verdict |
|---|---|
| Bloc "Nouveau document" : `$('#ajout_docs').show()`, champs `#reference_nouveau_document`, `#indice_nouveau_document`, `#type_nouveau_document` | Confirmé. Ces champs sont `type="text"` (pas `search`). Le bloc n'existe **que sur un article déjà enregistré**. |
| Choisir une suggestion de référence vide l'indice et pré-remplit le type | Confirmé, mais seulement pour les entrées "Changement d'indice". Voir piège 3. |
| Création : POST `enregistrer_document.php`, réponse `successN` | Confirmé (`success12`). |
| Rattachement : POST `transfert_fichiers_recus.php` (`id_adresse`, `espace=prive`, `fichier_copier`), réponse `success` + URL, sans upload | Confirmé. |
| Le fichier dans la GED est "persistant" | **Infirmé** : le transfert **déplace** le fichier, qui disparaît de la GED. Un plan ne sert qu'une fois ; une reprise demande de le redéposer. |
| Renommage Foxyz : tirets et espaces deviennent `_` | **Partiel** : voir section 3. La clé de rapprochement prévue (`[^A-Z0-9]+` → `_`) **ne marche pas** avec les accents et `°`. |
| Pastilles Client / Atelier / Fournisseur / Interne (4) | **Infirmé** : 3 pastilles, **Fournisseur**, **Atelier**, **Client**. La pastille "Atelier" envoie `types='Interne'`. |
| Types de document : Plan, PLAN DE COULÉE, PLAN DE FABRICATION, PLAN DE SOUS TRAITANCE | **Vrai sur PROD seulement.** Sur TEMP : `Plan`, `PLAN SOUS TRAITANCE`, `Plans`. La table suffixe → type doit être vérifiée à l'exécution contre la liste réelle de l'instance. |
| Re-enregistrement de l'article après rattachement | **Inutile** : comparaison avant/après sur 54 champs + ligne document + pastilles, aucune différence. Effet aval (demande de prix fournisseur) non vérifié. |

## 2. Appels exacts observés

### Ouvrir une fiche existante
`ouvrir_popup_total('../Formulaires/article_fournisseur.php?id_article_four=N')`.
Après création, `enregistrer_article_fournisseur()` rouvre déjà la fiche ainsi.

### Créer le document
- Fonction native (générée par fiche, avec l'id de l'article en dur) :
  ```
  function enregistrer_document() {
    afficher_fiche_specifique(1,'cadre_total_couche','enregistrer_document.php','id_nouveau_document');
    ouvrir_popup_total('../Formulaires/article_fournisseur.php?id_article_fournisseur=N');
  }
  ```
  Le paramètre `id_article_fournisseur` (différent de `id_article_four`) rouvre bien la bonne fiche.
- Bouton : `span#bouton_revue_contrat` avec `onclick="$(this).hide();enregistrer_document();"`.
- POST `../Lien_bdd/enregistrer_document.php` : toute la fiche article sérialisée, plus
  `reference_nouveau_document=ZZ-TEST-01&id_operation_8=&id_nouveau_document=&indice_nouveau_document=A&type_nouveau_document=PLAN+SOUS+TRAITANCE`.
  Réponse : `success12`.
- `id_nouveau_document` : **vide = créer un nouveau document**. Rempli = rattacher le
  document existant de cet id (c'est ce que font les entrées "DOC. N" de la liste).
- `id_operation_8` : champ caché, toujours vide, qu'aucune fonction JS ne lit. Reste
  probable du formulaire d'opération. On le laisse tel quel.
- Après rechargement, le document apparaît dans `#tr_liste_document_s_K` (K = rang,
  pas le n° du document) :
  `ZZ-TEST-01 Indice A : PLAN SOUS TRAITANCE (Doc 12)`.

### Rattacher le fichier
- Dans la ligne du document : `img[src*="lien.png"]` avec
  `onclick="ranger_fichier_dans_archives('Quels sont les fichiers à transférer pour  le document 12 ?','/home/gpaofof/www/GPAO-PROD/TEMP-MECANICKEL/Archives/Documents/Doc 12');"`.
  **C'est là qu'on lit le chemin serveur** (2e argument). Sur PROD, la trace donnait
  `/var/www/gpao-prod/MECANICKEL/...` : jamais en dur.
- `ranger_fichier_dans_archives` ne fait qu'afficher le panneau `#deplacer_un_fichier`,
  poser le chemin dans `#adresse_ou_copier_fichiers_a_deplace` et lister la GED
  (`mise_a_jour_fichiers_recus()`).
- Sélection : dans la ligne `.ligne_fichier_recu[chemin_scan="<nom GED>"]`, clic sur
  `.icone_ajouter_fichier_recu svg` (`deplacer_fichier_a_uploader($(this))`), ce qui
  déplace la ligne dans `#fichier_final_deplacer_un_fichier`.
- Validation : `#deplacer_un_fichier .bouton_enregistrer`
  (`enregistrer_deplacement_fichier_recus()`). POST `transfert_fichiers_recus.php`
  `id_adresse=<chemin Doc N>&espace=prive&fichier_copier=<nom GED>`. Réponse :
  `successhttps://temp-mecanickel.gpao-foxyz.fr/TEMP-MECANICKEL/Archives/Documents/Doc 12/<nom GED>`.
- En cas d'échec, la fonction native fait `window.open(...)` sur l'URL de transfert et
  affiche "Erreur de transfert".

### Pastilles de visibilité
- Une fois le fichier rattaché, la ligne document contient, pour chaque pastille :
  `div[onclick*="rendre_visibilite"]` avec
  `rendre_visibilite('/Archives/Documents/Doc 12/<fichier>','auto','Fournisseur',$(this))`
  (idem `'Interne'` pour Atelier, `'Client'`). L'état se lit sur `.petit_rond` :
  `fond_vert` = visible, `fond_rouge` = invisible.
- Défaut observé sur un fichier neuf : Fournisseur **rouge**, Atelier/Interne **vert**,
  Client **rouge**.
- Mode `'auto'` = bascule. Le clic natif n'est donc idempotent que si on teste la
  couleur avant de cliquer.
- POST `visibilite_fichier.php` `visible=visible&types=Fournisseur&adresse_fichier=/Archives/Documents/Doc 12/<fichier>`,
  réponse `success`, puis `rechargerdiv.php` (rafraîchissement des PJ). L'état tient
  après rechargement de la fiche.

### Lister la GED
- `file(adresse_maj_fichier_recus())`, soit POST `maj_fichier_recus.php`
  `liens_relatifs_copies=[]`. Réponse HTML : une `div.ligne_fichier_recu` par fichier,
  avec les attributs `espace="prive|commun"` et `chemin_scan="<nom GED>"`. Une GED vide
  renvoie une chaîne vide.
- Fichiers privés stockés dans `Fichiers recus/SCAN PRIVE/SCAN3/` (3 = probablement
  l'id utilisateur) : chaque utilisateur voit son espace privé.

### Alimenter la GED (tests)
- Upload natif : `#files` (input file du panneau) → `handleFileSelect` → POST
  multipart `upload_drag_drop.php`. Réponse `Uploaded File : <nom GED>`.
- Sous Playwright : `page.setInputFiles('#files', [...])` une fois le panneau ouvert.
  PDF factices d'une page dans `captures/pdf_test/` (ignoré par git).

## 3. Règle de renommage de la GED (observée sur TEMP)

| Nom d'origine | Nom dans la GED |
|---|---|
| `ZZ-TEST-01-A_PION DE CENTRAGE__PLAN_STT_.PDF` | `ZZ_TEST_01_A_PION_DE_CENTRAGE__PLAN_STT_.PDF` |
| `ZZ-TEST-02-B_ÉCROU spécial (M8) n°2__PLAN_FAB_.pdf` | `ZZ_TEST_02_B_ECROU_special__M8__n2__PLAN_FAB_.pdf` |
| `ZZ-TEST-03-AB_Plaque.support  double--tiret__PLAN_.PDF` | `ZZ_TEST_03_AB_Plaque_support__double_tiret__PLAN_.PDF` |

- `-`, espace, `.` (hors extension), `(`, `)` → `_`. `--` → un seul `_`, mais deux
  espaces → `__`. Les `__` et `_` existants sont gardés.
- Accents retirés (`É`→`E`, `é`→`e`). `°` **supprimé** (`n°2` → `n2`).
- Casse conservée, y compris celle de l'extension.
- **Écart avec PROD** : l'exemple PROD `E_001_12_B_PION_DE_CENTRAGE_PLAN_STT.pdf` n'a
  ni `__`, ni `_` final, et son extension est en minuscules. Soit le nom d'origine
  était différent, soit PROD renomme autrement. À trancher avec les vrais noms.

Vrais noms de Bastien (testés avec des fichiers factices de même nom) :

| Nom d'origine | Nom dans la GED |
|---|---|
| `E-600-07-A INSERTS (PLAN ST).PDF` | `E_600_07_A_INSERTS__PLAN_ST_.PDF` |
| `E-600-08-A INSERT BISEAU (PLAN ST).PDF` | `E_600_08_A_INSERT_BISEAU__PLAN_ST_.PDF` |
| `E-680-01-A FIXATION (PLAN ST).PDF` | `E_680_01_A_FIXATION__PLAN_ST_.PDF` |
| `E3.12.04301_B.pdf` | `E3_12_04301_B.pdf` |
| `P.C. PINCE Ø13.3.PDF` | `P_C__PINCE_O13_3.PDF` |
| `P.E-F-946-NEZ D'ETIQUETAGE OVALE 31X13.PDF` | `P_E_F_946_NEZ_D_ETIQUETAGE_OVALE_31X13.PDF` |
| `CDC Réalisation godets type WECKERLE SHOCK SHINE-Ligne M31.docx` | `CDC_Realisation_godets_type_WECKERLE_SHOCK_SHINE_Ligne_M31.docx` |
| `Spécifications dimensionnelles Godets WECKERLE SHOCK SHINE - Ligne M31.pdf` | `Specifications_dimensionnelles_Godets_WECKERLE_SHOCK_SHINE___Ligne_M31.pdf` |

`Ø` devient `O` (translittéré, pas supprimé). La GED accepte le `.docx`.

**Clé de rapprochement proposée** (remplace celle du chantier) : `Ø`/`ø` → `O`, retirer
les accents (`normalize('NFD')` puis suppression des diacritiques), mettre en majuscules, puis
**supprimer** tout ce qui n'est pas `A-Z0-9` (au lieu de le remplacer par `_`).
Les 3 cas ci-dessus et l'exemple PROD donnent alors la même clé côté original et
côté GED, par exemple `ZZTEST02BECROUSPECIALM8N2PLANFAB`. Deux fichiers de même clé
dans la GED : erreur, on ne choisit pas.

## 4. Pièges pour la phase 2

1. **Id dupliqué `#bouton_revue_contrat`** : sur une fiche existante, le bouton du
   document arrive **en premier** dans le DOM. `$('#bouton_revue_contrat')` vise donc le
   bouton du document. Sans conséquence pour la v1.5, qui ne clique que sur une fiche
   neuve (sans bloc document). En phase 2, toujours cibler par
   `[id="bouton_revue_contrat"][onclick*="enregistrer_article_fournisseur"]` ou
   `[onclick*="enregistrer_document"]`.
2. **Globale `rechargeruniquementdiv` résiduelle** : si un clic précédent sur les PJ l'a
   remplie (`tab_pj1`, `tab_pj2`…), `enregistrer_deplacement_fichier_recus` ne recharge
   **pas** la fiche après le transfert. Il faut la remettre à `''` avant, ou recharger
   soi-même la fiche avant de vérifier.
3. **Liste des références de document** : `actualiser_cadre` **clique tout seul** sur la
   suggestion s'il n'y en a qu'une, et les entrées "DOC. N : …" appellent
   `enregistrer_document()` **immédiatement** (rattachement d'un document existant).
   L'outil ne doit donc jamais ouvrir cette liste : référence posée par `.val()`.
4. **N° du document** : `afficher_fiche_specifique` écrit `N` dans `#id_nouveau_document`,
   mais la fiche est rechargée juste après. On le relit dans la ligne
   `#tr_liste_document_s_*` qui contient `REF Indice X : TYPE`, sur le texte `(Doc N)`.
5. Les appels AJAX sont synchrones : chaque clic natif est terminé quand il rend la main.
6. Si la même référence de document existe déjà (même indice), le comportement est **non
   testé**. À tester en phase 2 sur TEMP.

## 5. Séquence minimale (identique au parcours manuel, sans re-enregistrement)

Pré-requis : article créé par le mécanisme v1.5 (inchangé), la fiche
`?id_article_four=N` est affichée.

1. `$('#ajout_docs').show()`. Vérifier que `#id_nouveau_document` est vide.
2. `.val()` sur `#reference_nouveau_document` (référence **sans** indice), puis
   `#indice_nouveau_document`, puis `#type_nouveau_document`. Le champ type n'a pas de
   `fonction_a_lancer` : `.val()` équivaut au choix dans la liste. On peut quand même
   vérifier que le type existe via `liste_type_document.php`.
3. Clic `[id="bouton_revue_contrat"][onclick*="enregistrer_document"]` →
   `enregistrer_document.php` → `successN`, fiche rechargée.
4. Trouver la ligne `#tr_liste_document_s_*` du document (`REF Indice X : TYPE`), lire
   `(Doc N)` et le chemin serveur dans l'`onclick` de `img[src*="lien.png"]`.
5. `rechargeruniquementdiv = ''`, clic sur l'icône lien, attente du panneau, clic
   sur la ligne GED retrouvée par clé (`.icone_ajouter_fichier_recu svg`), puis clic
   sur `#deplacer_un_fichier .bouton_enregistrer` → `transfert_fichiers_recus.php`
   → `success…`.
6. Recharger la fiche. Dans la ligne du document : si Fournisseur est rouge, cliquer ;
   si Atelier (Interne) est vert, cliquer. Chaque clic → `visibilite_fichier.php` → `success`.
7. Recharger et vérifier : fichier présent dans la ligne, Fournisseur vert, Atelier rouge.

Le POST direct n'est nécessaire à aucune étape : tout passe par les boutons et
fonctions natifs.

## 6. Observation hors sujet
Le POST de la fiche sur TEMP envoie `unite_article_four=U : Unité` correctement
décodé. Le bug `U : Unit&eacute;` noté dans CLAUDE.md n'apparaît pas ici (non creusé,
non modifié).

## 7. Créé sur TEMP pendant la phase 0 (à nettoyer)
- Article fournisseur **N° 60**, `ZZ-TEST-01-A` ("ZZ TEST PLANS PDF - A SUPPRIMER"),
  catégorie MATIERE PREMIERE / INOX / PLAQUE.
- Document **Doc 12** `ZZ-TEST-01` indice A (PLAN SOUS TRAITANCE), rattaché à l'article
  60, avec le fichier `ZZ_TEST_01_A_PION_DE_CENTRAGE__PLAN_STT_.PDF` (Fournisseur vert,
  Atelier rouge).
- GED, espace privé de Bastien : `ZZ_TEST_02_B_ECROU_special__M8__n2__PLAN_FAB_.pdf`,
  `ZZ_TEST_03_AB_Plaque_support__double_tiret__PLAN_.PDF` (gardés pour les tests
  suivants), et les 8 fichiers **factices** portant les noms réels de Bastien
  (`E_600_07_A_…`, `E_600_08_A_…`, `E_680_01_A_…`, `E3_12_04301_B.pdf`,
  `P_C__PINCE_O13_3.PDF`, `P_E_F_946_…`, `CDC_Realisation_…docx`,
  `Specifications_dimensionnelles_…pdf`). Contenu bidon : à supprimer avant que
  Bastien dépose les vrais.
- Phase 1, 16/10/2026 : **Doc 13** `ZZ-TEST-TYPE` indice A, type `PLAN D'ENSEMBLE`,
  rattaché à l'article 60, sans fichier. Créé uniquement pour fabriquer le type (section 8).

## 8. Créer un nouveau type de document (méthode validée sur TEMP le 16/10/2026)
Ne pas confondre avec la liste : **il n'existe aucun écran ni appel dédié**. Un type naît
en l'écrivant dans le champ type d'un document et en enregistrant ce document. Utile pour
une future fonction "créer le type s'il manque".

Séquence (article déjà créé, fiche affichée, ici N° 60) :
1. `ouvrir_popup_total('../Formulaires/article_fournisseur.php?id_article_four=60')`.
   Sur une fiche NEUVE le bloc document est absent : il faut une fiche existante.
2. `$('#ajout_docs').show()`.
3. `.val()` sans événement sur `#reference_nouveau_document`, `#indice_nouveau_document`,
   `#type_nouveau_document` (valeur = le nouveau nom, ici `PLAN D'ENSEMBLE`).
4. Clic sur `[id="bouton_revue_contrat"][onclick*="enregistrer_document"]` (natif).
5. Trace AJAX : `POST ../Lien_bdd/enregistrer_document.php` répond `success13` (13 = n° du
   document), puis la fiche est rechargée (`article_fournisseur.php`, `id_article_fournisseur=60`).
6. La ligne `#tr_liste_document_s_*` affiche `ZZ-TEST-TYPE Indice A : PLAN D'ENSEMBLE (Doc 13)`.

Vérification de la liste des types : `$('#type_nouveau_document').trigger('click')` appelle
`actualiser_cadre($(this),'liste_type_document.php')` ; les choix sont lus dans les éléments
`[onclick*="element_selectionner"]`. TEMP : `Plan`, `PLAN D'ENSEMBLE`, `PLAN SOUS TRAITANCE`,
`Plans`. Le type est donc créé du seul fait de l'enregistrement : le doc de test reste, à
supprimer côté Foxyz (le type, lui, est voulu). Sur PROD : Bastien le crée lui-même, même
méthode (jamais d'écriture PROD depuis cette session).

Règles Foxyz confirmées par Bastien (16/10/2026) :
- Une valeur de catégorie (type de document, comme les autres listes Foxyz) **n'existe que
  tant qu'au moins un document l'utilise** ; sinon elle disparaît de la liste. Le Doc 13
  doit donc rester pour garder `PLAN D'ENSEMBLE` sur TEMP.
- Les articles ne se suppriment pas, on les désactive : sur TEMP, on laisse les tests.
- Conséquence pour l'outil : ne jamais supposer qu'un type est présent. Lire la liste de
  l'instance au moment de l'usage ; type absent = à choisir par Bastien, jamais créé
  automatiquement.
- PROD : le type plan d'ensemble existe déjà (casse exacte à lire dans la liste PROD).

Correctif (Bastien, 16/10/2026) : les **documents sont indépendants des articles** (une
liste à eux, appelés ailleurs dans Foxyz). Le Doc 13 doit simplement continuer à exister ;
on peut le dissocier de l'article 60 sans qu'il disparaisse. Il n'est donc pas à nettoyer.
Type sur PROD : `PLAN DE SOUS TRAITANCE` (TEMP : `PLAN SOUS TRAITANCE`) ; la table suffixe
vers type ne se fige pas, elle se résout contre la liste de l'instance.

## 9. Phase 2 (v1.7) : constats sur TEMP le 27/10/2026
- **`ouvrir_popup_total` est asynchrone** (il passe par `$("#loader").show("fast", ...)`).
  Juste après l'appel, l'ancienne fiche est encore là. L'outil marque le titre de la fiche
  affichée (`data-fx-ancienne`) puis attend un titre non marqué portant le bon numéro.
- **Chemin serveur de TEMP changé** depuis le 12/10 : `/var/www/gpao-temp/TEMP-MECANICKEL/...`
  (était `/home/gpaofof/www/GPAO-PROD/...`). Confirme qu'il ne faut jamais l'écrire en dur :
  la v1.7 ne le lit même pas, c'est `ranger_fichier_dans_archives` (clic natif) qui le pose.
- **N° du document** : `afficher_fiche_specifique` poste en synchrone et écrit `N` dans
  `#id_nouveau_document` avant de recharger la fiche. On le lit juste après le clic.
- Bouton Enregistrer de l'article : `DIV#bouton_revue_contrat` avec
  `onclick="$(this).hide();enregistrer_article_fournisseur();"` ; celui du document :
  `SPAN#bouton_revue_contrat` avec `...enregistrer_document();`. Ciblage par `onclick*=`.
- Fichier rattaché : `input.dirhid[value="<nom>"]` dans la ligne du document.
- Upload natif pour les tests : `#files` ne réagit que si le panneau a été ouvert par
  `ranger_fichier_dans_archives` (clic sur l'icône lien d'un document), pas par un simple `.show()`.
- **Piège 6 tranché : Foxyz accepte deux documents de même référence et même indice.**
  Test : `ZZ-1108-A` avec document forcé sur `ZZ-1102` indice A (déjà Doc 15) : Doc 21 créé,
  aucun message. L'outil crée donc toujours un NOUVEAU document ; un doublon n'est pas détecté.

### Tests v1.7 (Playwright, TEMP)
| Test | Résultat |
|---|---|
| 1 article avec plan | N° 62, Doc 14, fichier rattaché, Fournisseur vert / Atelier rouge, comptes 604110/707000 |
| 3 articles, transfert neutralisé sur le 2e (panne simulée) | N° 63 et 65 complets ; N° 64 créé, Doc 16 sans fichier, "PLAN NON RATTACHE" + liste de fin ; le lot continue |
| 5 lignes : 1 collée sans plan, 3 plans, 1 référence existante ; + 2 lignes contrôle (plan absent, suffixe inconnu) | contrôle bloque les 2 lignes, retirées ; N° 66 (sans plan) ; N° 67-69 Docs 18-20 complets ; ZZ-1101-A refusé, aucun rattachement, fichier laissé sur le serveur |
| Référence + indice de document déjà existants | accepté par Foxyz : N° 70, Doc 21 (doublon de Doc 15) |
Vérification à froid de chaque fiche (réouverture) : document, fichier, pastilles, comptes.

### Créé sur TEMP le 27/10/2026 (à nettoyer / désactiver)
- Articles N° 62 à 70 : `ZZ-1101-A` à `ZZ-1108-A` (sauf refus), `ZZ-COLLE-01` (N° 66, sans plan).
- Documents Doc 14 à 21 (`ZZ-1101` ... `ZZ-1107` indice A, et Doc 21 `ZZ-1102` A en doublon).
  Doc 16 (`ZZ-1103`) est **sans fichier** (panne simulée).
- Fichiers serveur restants (espace privé) : `ZZ_1103_A_...` (panne simulée) et `ZZ_1109_A_...`
  (jamais utilisé). Les autres `ZZ_11xx` sont dans leurs documents.

## 10. v1.8 : contrôle "document déjà existant" (TEMP, 27/10/2026)
- Source : `POST ../Listes/liste_reference_document.php?id_objet=reference_nouveau_document`
  avec `reference_nouveau_document=<ref>`, appelé directement en lecture (jamais via
  `actualiser_cadre`, qui clique seul une suggestion unique). Filtre **"contient"**
  (`ZZ-110` ramène `ZZ-1101`...`ZZ-1107`), liste non tronquée sur TEMP (21 documents).
  Une ligne par document : `DOC. <span class=document>N : REF Indice X (TYPE)</span>` ;
  les lignes "Changement d'indice" n'ont pas de numéro et sont ignorées.
- L'outil compare référence (exacte, sans casse) ET indice. Bloquant dans le tableau ;
  revérifié juste avant `enregistrer_document` (si existant : rien créé, PLAN NON RATTACHE).

| Test | Résultat |
|---|---|
| Plan `ZZ-1103-A` (Doc 16 existe) | bloqué : "document ZZ-1103 indice A existe deja (Doc 16)" |
| 2 lignes sur le même document | bloqué : "meme document qu une autre ligne" (+ référence en double) |
| Indice changé en B, ou référence corrigée | ligne redevient OK |
| Filet de sécurité (liste masquée au contrôle, document existant à la création) | N° 71 `ZZ-1103-C` créé, "PLAN NON RATTACHE (document deja existant (Doc 16), rien cree)" ; aucun doublon |
| Cas normal `ZZ-1109-A` | N° 72, Doc 22 complet (Fournisseur vert, Atelier rouge) |

Créé sur TEMP : articles **N° 71** `ZZ-1103-C` (sans document) et **N° 72** `ZZ-1109-A`
(Doc 22). Fichier serveur restant : `ZZ_1103_A_PIECE_TEST_1103__PLAN_ST_.PDF`.

## 11. v1.9 : envoi des plans par l'outil (TEMP, 27/10/2026)
Retours du test Firefox de Bastien sur la v1.8 : tout fonctionne, mais (1) PDF vides,
(2) message "visibilite mise a jour" qui revient sans arret, (3) fenêtre trop petite,
(4) souhait de ne plus devoir déposer les plans sur le serveur à l'avance (solution A choisie).
- **PDF vides** : les fichiers rattachés étaient mes factices de la phase 0 (329 octets,
  `captures/noms_reels/`), pas un défaut de l'outil. Les fiches N° 73 à 76 de Bastien les portent.
- **Messages en boucle** : `ouvrir_popup_information` empile une animation jQuery
  (1,5 s + 3 s + 1,5 s) par message dans la file `fx` de `#message_information` ; 4 à 5
  messages par article avec plan = plusieurs minutes après un lot. Correctif :
  `$('#message_information').stop(true, true).hide()` à la fin de chaque article.
- **Envoi natif** : `handleFileUpload(files, $('#fichier_upload_deplacer_un_fichier'))` →
  `sendFileToServer` → `POST ../Lien_bdd/upload_drag_drop.php` (FormData `file`), asynchrone,
  puis `rafraichir_liste_fichiers_recus()`. **N'envoie rien si le nom ne contient pas
  `$('#files').attr('accept')`** : c'est `ranger_fichier_dans_archives` qui pose `accept=''`.
  L'outil envoie donc dans le panneau ouvert par l'icône lien du document, comme un
  glisser-déposer manuel. Fichier arrivé en espace privé, renommé comme d'habitude, ~0,5 s.
- **Taille** dans la liste des fichiers serveur : `.col_taille_fichier_recu`, "329 octets",
  "58.8 Ko" (Ko = 1024 octets). Dans la liste des documents d'une fiche, Foxyz affiche la taille
  **divisée par 8192** ("7.35 Ko" pour 60 194 octets) : défaut d'affichage Foxyz, fichier
  intact (vérifié par téléchargement : 60 194 octets, `%PDF` ... `%%EOF`).

| Test | Résultat |
|---|---|
| Dépôt : PDF de 193 o alors que le serveur a 58.8 Ko sous ce nom | CONFLIT affiché dès le dépôt, bloquant |
| Dépôt : PDF absent du serveur | "sera envoye sur le serveur a la creation", non bloquant |
| Dépôt : vrai plan E-680-01-A déjà sur le serveur (même taille) | "sur le serveur : ... (58.8 Ko)" (pas de création) |
| 3 articles : 1 déjà sur le serveur, 2 à envoyer | N° 77-79, Docs 27-29 complets, fichiers intacts |
| 1 article à envoyer, journal après succès | N° 80, Doc 30 ; journal conservé, saisie vidée, aucun message Foxyz résiduel |

Créé sur TEMP : articles **N° 77 à 80** (`ZZ-1202-A`, `ZZ-1201-A`, `ZZ-1203-A`, `ZZ-1204-A`),
documents **Doc 27 à 30**. Le fichier de test `ZZ_1201_A_...` envoyé pendant l'essai de l'envoi
natif est rattaché au Doc 28. Reste sur le serveur : `E_680_01_A_FIXATION__PLAN_ST_.PDF`
(vrai plan de Bastien, non touché).
