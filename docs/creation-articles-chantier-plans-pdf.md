# Chantier : créer des articles à partir de plans PDF et y rattacher le plan

Lis d'abord `CLAUDE.md` (règles, mécanique Foxyz, sécurité). Ce fichier décrit la mission.

## Objectif
Créer des articles fournisseur à partir de plans PDF de fabrication de chez nous, puis
rattacher le plan à l'article comme document. Version 1 : **le nom du fichier suffit**
(pas d'OCR, on ne lit JAMAIS le contenu du PDF).

Flux cible : Bastien dépose des PDF dans le panneau, l'outil parse les noms et remplit
référence + désignation, Bastien catégorise comme aujourd'hui, l'outil crée l'article
(codes comptables inclus, mécanisme v1.4 inchangé), puis crée le document et y rattache
le plan.

## À COMPLÉTER PAR BASTIEN (la phase 1 est bloquée tant que c'est vide)

Noms de fichiers réels, tels qu'ils sont sur le disque, AVANT dépôt dans la GED
(2-3 exemples, un par type de plan) :

```
(à coller ici)
```

Correspondance suffixe de nom de fichier vers type de document Foxyz :

```
PLAN_STT -> PLAN DE SOUS TRAITANCE   (vu dans la GED, à confirmer)
(autres suffixes à compléter)
```

Convention de départ, à valider contre les noms réels : `REFERENCE-INDICE_DESIGNATION__TYPE_.PDF`

Si ces deux blocs sont vides : **phase 0 uniquement**, puis demande-les avant la phase 1.

## Faits établis
Source : trace AJAX d'un parcours manuel complet, réalisée sur **PROD** (ne rien
réécrire sur PROD ; l'article 612 et le Doc 203 y existent réellement).

- Exemple : article `E-001-12-B`. L'indice (`B`) est dans la référence de l'article ET
  dans le nom du PDF, mais c'est un **champ séparé** côté document :
  Référence document = `E-001-12`, Indice = `B`. L'article garde `E-001-12-B`.
- Bloc "Nouveau document" : bouton "Ajouter un document" (`$('#ajout_docs').show()`).
  Champs `#reference_nouveau_document`, `#indice_nouveau_document`,
  `#type_nouveau_document` (+ `id_nouveau_document` et `id_operation_8` dans les données
  du formulaire, rôle à déterminer). Ce sont des autocompletes
  (`liste_reference_document.php`, `liste_type_document.php`).
  **Choisir une suggestion de référence VIDE l'indice et PRÉ-REMPLIT le type** : donc
  remplir la référence d'abord, puis l'indice, puis le type.
- Types de document existants : Plan, PLAN DE COULÉE, PLAN DE FABRICATION, PLAN DE SOUS
  TRAITANCE (extensible).
- Création du document : POST `enregistrer_document.php`, réponse `success203`
  (203 = n° du document, dossier "Doc 203"). Foxyz renvoie tout le formulaire à chaque
  fois : privilégier le bouton natif plutôt qu'un POST refait à la main.
- Rattachement : POST `transfert_fichiers_recus.php` avec
  `id_adresse=<chemin serveur>/Archives/Documents/Doc 203`, `espace=prive`,
  `fichier_copier=<nom du fichier dans la GED>`. Réponse `success` + URL du fichier.
  **Aucun upload dans cette étape.** Le chemin serveur est propre à l'instance
  (PROD : `/var/www/gpao-prod/MECANICKEL/...`) : le lire dans la page ou la réponse,
  jamais en dur.
- Le fichier doit déjà être dans la GED (espace personnel, persistant). Bastien le dépose
  à la main une fois. Foxyz le **renomme** : tirets et espaces deviennent des underscores
  (`E_001_12_B_PION_DE_CENTRAGE_PLAN_STT.pdf`). Liste de la GED : POST
  `maj_fichier_recus.php` (lignes `.ligne_fichier_recu[chemin_scan="..."]`).
- Visibilité (pastilles Client / Atelier / Fournisseur / Interne) : POST
  `visibilite_fichier.php` (`visible=visible|invisible`, `types=Fournisseur|Interne|...`,
  `adresse_fichier=/Archives/Documents/Doc 203/<fichier>`). Configuration voulue par
  défaut : **Fournisseur visible, Interne invisible** (à mettre dans `CFG`). Fournisseur
  au vert est ce qui permet de joindre le plan aux demandes de prix fournisseur.
- La trace contient un re-enregistrement de l'article
  (`enregistrer_article_fournisseur`) après le rattachement. À déterminer s'il est
  nécessaire.
- Fonctions natives déjà repérées : `ranger_fichier_dans_archives(...)`,
  `deplacer_fichier_a_uploader($(this),'NOM.PDF')` (double flèche),
  `enregistrer_deplacement_fichier_recus()`.

## Phase 0 : diagnostic (lecture seule, Playwright sur TEMP)
Commence par vérifier que tu es bien sur TEMP et connecté (sinon, demande à Bastien de
se connecter dans la fenêtre).
1. Ouvre un article fournisseur sur TEMP (crées-en un de test si besoin). Cartographie :
   fonction native du bouton "Ajouter un document" et du bouton Enregistrer du bloc, rôle
   de `id_nouveau_document` et `id_operation_8`, arguments de
   `ranger_fichier_dans_archives` (d'où vient le chemin serveur), `onclick` des pastilles,
   format de la réponse de `maj_fichier_recus.php`.
2. Trouve comment alimenter la GED de TEMP pour les tests (UI native, `setInputFiles`
   avec des PDF factices d'une page) et déduis la règle exacte de renommage Foxyz en
   comparant nom d'origine et nom dans la GED.
3. Détermine la séquence MINIMALE qui produit un résultat identique au parcours manuel
   (le re-enregistrement final est-il nécessaire ?).

Livrable : `DIAGNOSTIC_PLANS.md` (appels exacts, séquence minimale, hypothèses confirmées
ou infirmées). **Point d'arrêt : rapporte à Bastien avant de continuer.**

## Phase 1 : v1.6, import + parsing + contrôle (AUCUNE écriture dans Foxyz)
- Zone de dépôt dans le panneau (glisser-déposer + sélecteur, multi-fichiers, PDF
  uniquement). On ne lit que `File.name`. `preventDefault` sur `dragover` / `drop` de la
  zone pour que Firefox n'ouvre pas le PDF.
- Fonction pure `analyserNomPlan(nom)` qui renvoie
  `{ok, reference_article, reference_doc, indice, designation, suffixe, type_doc, cle_ged, erreur}`.
  L'indice est le dernier segment de la référence et doit faire 1 ou 2 lettres, sinon la
  ligne passe en erreur. Suffixe inconnu : erreur. **On ne devine JAMAIS.** Table
  suffixe vers type dans `CFG`.
- Clé de rapprochement GED : nom sans extension, en majuscules, `[^A-Z0-9]+` remplacé par
  `_`, underscores de bord retirés. On compare la clé de l'original à celle de la GED
  (robuste au renommage Foxyz), pas les chaînes brutes.
- Le tableau de contrôle existant gagne des colonnes Plan / Type doc / GED (présent ou
  absent, via `maj_fichier_recus.php`). Une ligne en erreur ou au plan absent bloque la
  confirmation, avec un bouton pour la retirer (même logique que la catégorie
  obligatoire).
- Le flux par collage dans les deux textareas doit continuer à fonctionner sans plans
  (plan optionnel par ligne). Aucune régression.
- Tests Node sur le parseur (noms réels + cas tordus : indice manquant, suffixe inconnu,
  pas de double underscore, extension en minuscules, tirets dans la désignation).

**Point d'arrêt : Bastien valide avant la phase 2.**

## Phase 2 : v1.7, rattachement du plan
Après la création réussie d'un article (la fiche reste affichée), pour chaque ligne avec
plan : ouvrir le bloc document, remplir référence puis indice puis type, enregistrer le
document (récupérer le n° dans la réponse), rattacher le fichier, régler les pastilles,
vérifier dans le DOM que le document et le fichier apparaissent.

- Un échec de rattachement n'est PAS un échec de création : l'article reste créé, le
  journal dit "article créé, PLAN NON RATTACHE", et la ligne figure dans la liste de fin
  pour reprise manuelle.
- Journal OK :
  `OK N°612 ref - designation (comptes 604110/707000) [plan : Doc 203, PLAN DE SOUS TRAITANCE, fournisseur visible]`
- Si l'article est refusé (référence existante) : pas de rattachement.
- À ne pas casser : codes comptables (`fonction_a_lancer`), fin de lot sans
  `fermerMoteur()`, confirmation inline.

## Règles propres au chantier
- Natif d'abord : appeler les fonctions et attributs de Foxyz (`onclick`,
  `fonction_a_lancer`). POST direct seulement si le natif exige un dialogue interactif,
  en reproduisant exactement les paramètres observés.
- Aucun chemin serveur ni valeur d'instance en dur.
- Pas d'upload de fichier par script dans cette version. Pas de dépendance externe.

## Tests (Playwright sur TEMP, puis manuel dans Firefox)
1 article, puis 3, puis 5. Vérifier dans la fiche : document créé, fichier rattaché,
pastilles correctes, comptes comptables présents. Cas d'erreur : plan absent de la GED,
suffixe inconnu, référence déjà existante. Puis checklist de test manuel pour Bastien
(Firefox + Tampermonkey, TEMP).

## Alertes
Arrête-toi et rapporte immédiatement si une hypothèse de ce fichier est contredite par ce
que tu observes, si tu tournes en rond (2 tentatives infructueuses sur le même point), ou
si tu es tenté de contourner un mécanisme natif. Pour le reste, enchaîne sans attendre,
sauf aux points d'arrêt indiqués. En fin de session : propose à Bastien les lignes à
ajouter à `CLAUDE.md` (tu ne le modifies pas toi-même).
