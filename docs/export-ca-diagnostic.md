# DIAGNOSTIC — Export CA par commercial

> Diagnostic réalisé par Claude Code le 01/10/2026, **uniquement sur TEMP**
> (`temp-mecanickel.gpao-foxyz.fr`). Aucune navigation ni requête vers la PROD.
> Pièces jointes dans `diag/` (captures, listes de colonnes, export CSV).

---

> 🔄 **Mise à jour du 02/10/2026 — lire le §9 en priorité.**
> Le script `foxyz-export-ca.user.js` v1.6 est **validé sur données réelles**.
> Trois affirmations des §1 à §7 se sont révélées fausses lors des tests sur PROD
> et ont chacune causé un bug. Le **§9 corrige** et prime sur les sections antérieures.

## ⭐ Réponse à la question centrale

**Le commercial existe bien comme colonne : le champ n° 1736 `commande.id_commercial_commande`. Mais il est
désactivé par défaut (« Est-ce que le champ est actif ? = Non »), donc il n'apparaît pas dans le sélecteur.
Une fois activé (fait sur TEMP), on peut l'afficher dans le tableau Commandes et aussi directement dans
« Lignes des factures ». Il contient l'id seul : `3`, `4`…**

→ Le **scénario A** fonctionne, et il se simplifie : **un seul tableau** (« Lignes des factures ») suffit.
Plus besoin de rapprocher deux exports.

⚠️ **Pour la PROD**, Bastien devra **activer lui-même le champ 1736** (voir §1.3). Ce réglage de paramétrage
n'efface rien et se défait en un clic, mais je n'y ai pas accès.

---

## 0. Ce que j'ai modifié sur TEMP (rien supprimé)

| Action | Où | Comment revenir en arrière |
|---|---|---|
| Champ 1736 `commande.id_commercial_commande` : actif **Non → Oui** | Fiche « Champ de formulaire 1736 » | Remettre « Non » sur la même fiche |
| Ajout des colonnes 1736 + 841 au tableau Commandes (9) | Mon affichage (Bastien BARBIER) | « Personnaliser » → retirer les colonnes |
| Ajout de 9 colonnes au tableau Lignes des factures (91) | Mon affichage | idem |
| Ajout de 10 colonnes au tableau Lignes des factures d'acompte (111) | Mon affichage | idem |

La configuration des colonnes est **propre à chaque utilisateur** : l'enregistrement passe par
`enregistrer_tableau_foxyz_employe()` → `Lien_bdd/enregistrer_colonne_foxyz.php`.

---

## 1. Commercial

### 1.1 Côté formulaire commande
- Formulaire : `Formulaires/commande_rapide.php?id_commande=N`
- Champ « Qui est le commercial ? » = `<input type="search" id="id_commercial_commande">`, valeur `3 : Bastien BARBIER`
- Liste de choix : `liste_generale.php?ide=…employe.id_employe : prenom_employe nom_employe`
- En base : `commande.id_commercial_commande` → `employe.id_employe`

### 1.2 Côté tableau Commandes (`id_tableau_foxyz=9`)
- Sélecteur standard : **340 colonnes disponibles + 12 retenues**, **aucune** ne correspond au commercial
  (liste complète : `diag/colonnes_commandes_9.txt` et en annexe A).
- Colonnes trompeuses à **ne pas utiliser** :
  - `63/64/65 N° / Nom / Prénom salarié` : jointure `employe` dont on ne sait pas sur quelle clé elle se fait.
  - `841 Salarie creation commande`, `865 Employé création commande client` : c'est le **créateur** de la
    commande, pas le commercial. Sur TEMP ils coïncident toujours avec le commercial, mais rien ne le garantit.
- Dictionnaire des champs (tableau « Colonne », `id_tableau_foxyz=106`, 3 798 champs) : on y trouve
  `1736 commande.id_commercial_commande`. Sa fiche (`Interfaces/index.php?id_foxyz_champ=1736`) indique :
  - type `nombre KEY affectation`, `nom_table_champ = commande.id_commercial_commande`
  - proposé pour les tableaux « Commande client » (9) et « Ordre de fabrication » (38)
  - **actif = Non** ← c'est pourquoi il n'apparaît pas dans le sélecteur.
- Après activation : la colonne apparaît dans le sélecteur sous le libellé **`commande.id_commercial_commande`**
  (pas de libellé « joli »). Valeurs relevées sur TEMP : `3` (Bastien BARBIER), `4` (Anthony BAILLY).
  Elles correspondent bien au formulaire (commande 14 : `3 : Bastien BARBIER` → colonne `3`).
  Capture : `diag/03_commandes_avec_colonne_commercial.png`.

### 1.3 Procédure d'activation sur PROD (à faire par Bastien)
1. Ouvrir dans le navigateur, connecté sur PROD : `…/ERP/Interfaces/index.php?id_foxyz_champ=1736&`
   (ou : tableau → Personnaliser → n'importe quelle colonne → clic sur le `#` → changer le n° dans l'URL).
2. Vérifier que le titre est bien `commande.id_commercial_commande`.
3. « Est-ce que le champ est actif ? » → **Oui** → **Enregistrer**. Ne rien toucher d'autre.
   (La question affichée sur la fiche est « Quel est le code type de la taxe ? » : c'est une erreur de
   paramétrage de l'éditeur, sans conséquence, il ne faut pas la corriger.)
4. Lignes des factures → Personnaliser → bouton **« Mettre à jour les colonnes »** → glisser
   `commande.id_commercial_commande` dans les colonnes retenues → Enregistrer.

### 1.4 Correspondance id → nom
Il faut la coder en dur dans le script **ou** la lire dans le tableau Ressource humaine (`id_tableau_foxyz=21`).
Sur TEMP :

| id | Salarié |
|---|---|
| 1 | David BAETENS |
| 2 | FOXYZ FOXYZ (compte éditeur) |
| 3 | Bastien BARBIER |
| 4 | Anthony BAILLY |
| 5 | Julie Sawezuk |

⚠️ Sur TEMP, des factures sont rattachées à des commandes dont le commercial est **1, 2 ou 5** (factures 2, 6,
17, 22, 26). Le script doit donc prévoir une catégorie « **autre commercial / à vérifier** », en plus du cas
« sans commercial » (valeur `0`).

---

## 2. Tableau « Lignes des factures »

### 2.1 Identification
- **`id_tableau_foxyz=91`** (menu Facture ; titre « Lignes des factures »).
- Autres tableaux utiles : Liste des factures = 11, Avoirs = 12, Factures d'acompte = 112,
  Lignes des factures d'acompte = 111, Ressource humaine = 21, Colonne (dictionnaire) = 106.

### 2.2 Colonnes
- Sélecteur standard : **190 disponibles + 9 retenues** (`diag/colonnes_lignes_factures_91.txt`, annexe B).
- Le bouton **« Mettre à jour les colonnes »** (`Listes/foxyz_champ.php`, `ttvoir=true`) en propose
  **426**, dont certaines invisibles dans la liste standard (`diag/colonnes_91_ttvoir.txt`). Les colonnes
  marquées « NON VISIBLE » (champ inactif) ne sont pas enregistrées tant que le champ n'est pas activé.
- Colonnes par défaut sur TEMP : N° BL, N° Commande, N° OF, Echéance paiement facture, N° Facture,
  Entreprise / Raison sociale, Qté. livrée, Tarif total HT ligne livraison, Symbole devise.

**Colonnes utiles au projet** (toutes testées sur TEMP) :

| N° champ | Libellé exact | Rôle | Exemple |
|---|---|---|---|
| 273 | N° Facture | clé de dédoublonnage | `27` |
| — | N° Commande | pont vers la commande | `35` (`0` pour un acompte) |
| 274 | **Date création facture** | **date de référence** (voir 2.3) | `20/07/2026` |
| 1091 | Total HT Facture | montant HT, répété sur chaque ligne | `816,00` / `-816,00` |
| 1754 | **Type de facture** | `Finale` / `Acompte` (voir §4) | `Finale` |
| 1736 | **commande.id_commercial_commande** | **commercial** | `3` |
| — | Entreprise / Raison sociale | client | `L'OREAL GEMEY PARIS…` |
| 1609 | Reference facture | libellé libre (contient parfois « Avoir… ») | `Avoir BON POUR ACCORD` |
| 276 | Date clôture facture | statut (vide = en cours) | `11/06/2026` / `-` |
| 292 | Tarif total HT ligne livraison | détail (lignes issues d'un BL) | `720,00` |
| 344 | Tarif total HT ligne facture | détail (lignes saisies à la main, ex. avoirs) | `-720,00` |

### 2.3 Date de facture
- Le formulaire facture (`Formulaires/facture_rapide.php?id_facture=N`) ne contient que **deux dates** :
  « Quelle est la date de création de la facture ? » (`#date_creation_facture`) et
  « Quelle est l'écheance ? » (`#date_echeance`).
- **`274 Date création facture` correspond à `#date_creation_facture`** : c'est la date saisie sur la
  facture, distincte de l'échéance. → **C'est la date de référence.**
- Il existe aussi `1139 facture.date_validation_facture` (inactif, exemple `2026-07-20`, égal à la date
  de création). Non nécessaire.

### 2.4 Commercial dans ce tableau
**Oui**, via `1736 commande.id_commercial_commande`, une fois le champ activé et la colonne ajoutée par
« Mettre à jour les colonnes ». Vérifié : la valeur suit bien le N° Commande de la ligne.
Capture : `diag/04_lignes_factures_avec_commercial.png`.

### 2.5 Onglets (filtres d'état)
Ce sont des filtres cumulatifs, transmis dans le champ caché `input_s0` sous la forme `;id;id;`.

| Onglet | id | Effet sur TEMP |
|---|---|---|
| Facture en cours | 22 | **actif par défaut** → 24 lignes / 19 factures (date de clôture vide) |
| Facture clôturée | 23 | 13 lignes / 9 factures |
| Les deux à la fois | `;22;;23;` | **0 ligne** : les états se combinent en **ET**, pas en OU |
| **Aucun** (`input_s0` vide) | — | **37 lignes / 28 factures = TOUTES** |

→ **Pour tous les statuts : désactiver tous les onglets** (`input_s0=` vide). Dans l'interface, il faut
cliquer sur « Facture en cours » pour la désélectionner. Attention : si on ne transmet pas du tout
`input_s0`, le serveur revient au filtre par défaut `;22;`.

### 2.6 Filtres de date
- Chaque colonne date a deux champs (`input_sd_N` début, `input_sf_N` fin) reliés à un datepicker jQuery
  au format `dd/mm/yy`. À la sélection, le JS construit le filtre réel dans `input_sN` :
  **`>JJ/MM/AAAA et <JJ/MM/AAAA`**.
- **Bornes strictement exclues** (vérifié : `>01/04/2026 et <30/04/2026` exclut les factures du 01/04 et
  du 30/04).
- → Pour un mois M : **`>dernier jour de M-1 et <1er jour de M+1`**, par ex. juin 2026 =
  `>31/05/2026 et <01/07/2026` (14 lignes sur TEMP, factures 16 à 25 ✔).
- Le format ISO (`2026-04-01`) est **ignoré** : le filtre ne s'applique pas et toutes les lignes reviennent.
- ⚠️ `N` = **position de la colonne dans l'affichage de l'utilisateur** (ici `input_s11` parce que
  « Date création facture » est en 11ᵉ position). Ça change si on réorganise les colonnes. Le script doit
  retrouver la position à partir de l'en-tête (`th` contenant `id_foxyz_champ="274"`) au lieu de la coder
  en dur. Il peut aussi tout récupérer et filtrer le mois lui-même (volume faible).

### 2.7 Pagination
**Aucune pagination.** Le serveur renvoie toutes les lignes en une fois (test : tableau 106 =
3 798 lignes dans une seule réponse). Pas de limite à augmenter. ~133 lignes par mois ne posent aucun problème.

### 2.8 Export natif
- Menu « Visualiser » (`selectionner_menu_tableau`) → **« Exportation : Exportez les données de votre
  tableau au format csv »** → `exporter_tableau()`.
- **Export 100 % navigateur** : plugin jQuery `table2csv` appliqué sur `.tableau_data`, **aucune requête
  serveur**. Il exporte exactement **ce qui est affiché** (colonnes et filtres en cours).
- Fichier : `ERP_Lignes_des_factures_AAAA_M_J_H_M_S_.csv` (exemple : `diag/export_natif_lignes_factures.csv`)
  - encodage **UTF-8 avec BOM**
  - séparateur **`;`**, chaque valeur entre **guillemets doubles**
  - nombres au **format français** : `4 826,80` (espace normale pour les milliers, virgule pour les décimales)
  - dates `JJ/MM/AAAA`, date-heure `JJ/MM/AAAA HH:MM:SS`
  - valeurs vides affichées `-` ; N° vides `0`
  - **défaut** : l'en-tête se termine par une colonne parasite (retours à la ligne + espaces) et chaque
    ligne finit par `;""`. Il faut ignorer la dernière colonne.
  - les lignes « indicateur » (sommes/moyennes) ne sont pas exportées.

---

## 3. Comment les données arrivent : endpoint

- Les tableaux arrivent en **AJAX**, sous forme de **HTML rendu par le serveur** (pas de JSON).
- Appel natif : `file('../Tableaux/_tableau_general.php?id_tableau_foxyz=91&')` →
  **POST synchrone** jQuery vers `/ERP/Tableaux/_tableau_general.php`,
  `Content-Type: application/x-www-form-urlencoded`, `X-Requested-With: XMLHttpRequest`.
- Corps : `date_saisi_info=AAAA-M-J+HH:MM:SS&id_tableau_foxyz=91` + au filtrage tous les `input` du
  tableau (`input_s0`, `input_s1`…`input_sN`, `input_sd_N`, `input_sf_N`, `input_sa`).
- ⚠️ **Dans Foxyz, toutes les lectures passent par POST**, y compris l'affichage d'un simple tableau.
  La règle « aucune requête POST » de CLAUDE.md doit donc être lue comme « aucune requête d'écriture ».
- ✅ **Le même endpoint répond aussi en GET** avec les mêmes paramètres dans l'URL (testé sur TEMP) :
  ```
  GET /ERP/Tableaux/_tableau_general.php?id_tableau_foxyz=91&input_s0=&input_s11=%3E31%2F05%2F2026%20et%20%3C01%2F07%2F2026
  → 200, « Lignes des factures (14) »
  ```
  → Le script pourra **rester en GET pur**, lire le HTML avec `DOMParser` sans l'injecter dans la page,
  et repérer les colonnes par leur en-tête.
- Aucune trace d'écriture côté serveur : après plusieurs appels avec `input_s0` vide, l'affichage par
  défaut revient toujours à `;22;`. Le filtre n'est donc pas mémorisé.
- Structure du HTML : `div.tableau_data` → `thead th` (chaque `th` contient
  `input[placeholder="<libellé>"]` et des icônes portant `id_foxyz_champ="<n°>"`) → `tbody tr td`.
  La 1ʳᵉ ligne de `tbody` est une ligne d'indicateurs (sommes/moyennes) à ignorer.
- Le résultat **dépend de la configuration de colonnes de l'utilisateur connecté**. Le script fonctionnera
  pour quiconque a configuré les bonnes colonnes. C'est à documenter pour le gérant, ou à vérifier au
  lancement : le script contrôle la présence des colonnes requises et sinon affiche un message clair.

---

## 4. Avoirs et acomptes

### 4.1 Type de document
- **`1754 Type de facture`** : valeurs **`Finale`** et **`Acompte`** dans « Lignes des factures »
  (le formulaire propose aussi `Chorus Finale`).
- **Pas de type « Avoir »** : un avoir est une facture `Finale` dont le Total HT est **négatif**.
  La règle actuelle (montant négatif) reste donc la bonne. Le formulaire s'intitule d'ailleurs
  « Facture / Avoir N° … ».
- `Reference facture` contient souvent « Avoir… » (factures 3, 11, 28), mais c'est un texte libre :
  **pas fiable**.
- `1753 facture.id_facture_rattachee` (inactif) pourrait relier un avoir à la facture d'origine.
  Non testé : il faudrait l'activer comme le 1736.
- Le tableau « Liste des avoirs » (12) est **vide** sur TEMP : il concerne visiblement les avoirs liés aux
  non-conformités, pas les avoirs commerciaux.

### 4.2 N° Commande sur les avoirs
**Oui, sur TEMP les 3 avoirs ont un N° Commande et donc un commercial** :

| Facture | Commande | Commercial | Total HT | Référence |
|---|---|---|---|---|
| 3 | 4 | 3 | -8 280,00 | Avoir Dde mail du 20/02/26 |
| 11 | 20 | 3 | -1 440,00 | Avoir BON POUR ACCORD |
| 28 | 35 | 3 | -816,00 | Avoir |

Les lignes d'un avoir sont des lignes de facture saisies (N° BL = 0, montant dans
`Tarif total HT ligne facture`), mais le N° Commande est bien renseigné. À confirmer sur PROD
(cf. facture 96 évoquée dans CLAUDE.md).

### 4.3 Factures d'acompte
Constat important pour le risque de **double comptage** :

- Dans « Lignes des factures » (91), un acompte apparaît sur **une ligne vide** : N° Commande `0`,
  client `-`, **Total HT `0,00`**, commercial `0`, Type `Acompte` (factures 5, 8, 13, 18, 23).
  → **Si on se contente du tableau 91, les acomptes valent 0 et ne faussent rien**, à condition de les
  exclure par `Type de facture = Acompte` pour qu'ils ne tombent pas dans les « sans commercial ».
- Leurs vrais montants sont dans les tableaux **112 / 111** (`1481 Total HT facture acompte`,
  `1466 N° Demande/facture acompte`, `1467 Date creation facture acompte`, N° Commande et
  `1736` disponibles dans le 111) :

  | Acompte | Commande | Client | Total HT acompte | Facture finale sur la même commande |
  |---|---|---|---|---|
  | 5 | 16 | DIOR | 20,00 | 6 (100,00) |
  | 8 | 20 | C.PARFUM | 144,00 | 10 / 12 (1 440,00) |
  | 13 | 22 | C.PARFUM | 144,00 | 14 (1 440,00) |
  | 18 | 7 | GUERLAIN | 597,60 | 19 (5 976,00) |
  | 23 | 12 | QUANTEL | 540,80 | 24 (5 408,00) |

- **La facture finale porte le montant HT total de la commande, acompte non déduit.** L'acompte n'est
  retiré que du « Reste à encaisser » (facture 24 : 5 408 HT × 1,2 = 6 489,60 TTC − acompte TTC 648,96 =
  **5 840,64**, exactement le reste à encaisser affiché dans le tableau 11).
- Le lien acompte → facture finale existe en base : `1484 facture_acompte.id_facture` (inactif,
  exemple `24`).
- **Conclusion** : **compter l'acompte ET la facture finale = double comptage certain.** Le CA complet est
  sur la facture finale. Décision métier à prendre par Bastien :
  - (a) ignorer les acomptes dans le CA, et les lister à part pour information ;
  - (b) compter l'acompte le mois où il est émis, puis déduire de la facture finale les acomptes qui lui
    sont rattachés (il faut alors activer 1484 et lire le tableau 112). Plus complexe.

---

## 5. Cardinalité facture → commande

Sur TEMP (28 factures, 37 lignes) : **chaque facture ne porte qu'une seule commande.** Plusieurs lignes
oui (2 BL pour les factures 9, 10, 20 ; 2 lignes de facture pour 11 et 12), mais toujours le même
N° Commande.
**TEMP ne contient pas assez de données pour conclure** : aucun cas de facture regroupant plusieurs
commandes n'a été créé. Bastien doit vérifier sur PROD. Si ce cas existe, le tableau 91 donne le commercial
**ligne par ligne**, ce qui permettrait une répartition par `Tarif total HT ligne…`. Mais aujourd'hui
`Total HT Facture` est global : la règle reste à trancher.

Par ailleurs, la liste des factures (11) a une colonne `id_commande` qui vaut **toujours 0** : inutilisable.

---

## 6. Points de vigilance pour le script

1. **Dédoublonner par N° Facture** et prendre `Total HT Facture` une seule fois (confirmé : la valeur est
   répétée sur chaque ligne, ex. facture 16 = 2 lignes à 3 319,52).
2. Lignes de détail : le montant est soit dans `Tarif total HT ligne livraison` (ligne issue d'un BL), soit
   dans `Tarif total HT ligne facture` (ligne saisie, cas des avoirs). Il faut les deux pour le détail.
3. Nombres français (`-1 440,00`) → retirer les espaces, remplacer la virgule par un point.
4. Le filtre `input_s0` doit être envoyé **vide** (le paramètre doit être présent).
5. Repérer les colonnes par l'en-tête, jamais par leur position.
6. Commercial `0` = sans commercial (acompte, ou commande sans commercial). Ids hors {3, 4} = autre
   commercial → anomalie à signaler.

---

## 7. Ce que je n'ai PAS pu déterminer

| Question | Pourquoi | Qui / comment |
|---|---|---|
| Une facture peut-elle porter plusieurs commandes ? | Aucun cas sur TEMP | Bastien, sur PROD (filtrer le 91 et chercher un N° Facture associé à 2 N° Commande) |
| Les avoirs PROD portent-ils un N° Commande ? (ex. facture 96) | Données TEMP seulement | Bastien : afficher la facture 96 dans le 91 |
| Le champ 1736 est-il aussi inactif sur PROD ? | Pas d'accès PROD | Bastien : capture de la fiche `index.php?id_foxyz_champ=1736` |
| Ids des salariés sur PROD (3 = Bastien, 4 = Anthony ?) | Pas d'accès PROD | Bastien : tableau Ressource humaine (21), capture |
| Traitement des acomptes | Décision métier | Bastien : option (a) ou (b) du §4.3 |
| `1753 facture.id_facture_rattachee` relie-t-il un avoir à sa facture ? | Champ inactif, non activé | Optionnel : l'activer sur TEMP comme le 1736 |

---

---

## §8 — Indépendance vis-à-vis de la configuration des colonnes

> Tests du 01/10/2026 sur TEMP, **exclusivement en GET**. Aucun POST, aucune écriture.

### 8.1 Réponse

**NON pour `_tableau_general.php`** : aucun paramètre ne permet de choisir les
colonnes renvoyées. Le serveur renvoie toujours celles de l'utilisateur connecté.

25 paramètres testés (`liste_finale_foxyz_champ`, `colonnes`, `champs`, `ttvoir`,
`id_employe`…) : tous ignorés. Le code du navigateur n'envoie, en plus des filtres,
que les paramètres de tri (`etat_champs_foxyz`), de regroupement
(`etat_group_foxyz`) et de somme (`etat_somme_foxyz`).

### 8.2 Voie alternative explorée : `Listes/liste_generale.php`

Ce service, qui alimente les champs d'autocomplétion des formulaires, lit
n'importe quelle table de la base en GET pur :

```
GET /ERP/Listes/liste_generale.php?id_objet=x&x=&ide=<base>.<table>.<clé> : <colonnes>
```

- Indépendant de toute configuration de colonnes.
- Pas de plafond (3 798 lignes renvoyées en un appel).
- Données brutes : dates `AAAA-MM-JJ`, montants à point décimal.
- Le nom de la base est **obligatoire** dans chaque appel (`gpaofofmecanikel` sur TEMP).

**Voie écartée.** Le lien facture → commande y demande 7 à 9 appels enchaînés
(facture → BL → lignes de BL → lignes de commande, plus un second chemin pour les
lignes saisies à la main des avoirs), c'est-à-dire réimplémenter les jointures de
l'ERP. Coût de maintenance trop élevé, dépendance à un service interne non
documenté, nom de base codé en dur.

### 8.3 Vérification de non-régression

Après tous les tests GET, rechargement du tableau 91 dans l'interface :
mêmes 18 colonnes dans le même ordre, aucun tri, aucun regroupement, filtre `;22;`
intact. Journal réseau : **aucun appel `enregistrer_colonne_foxyz.php`** depuis le
début des tests. Capture : `diag/05_tableau91_apres_tests_GET.png`.

### 8.4 Solution retenue

Lecture du tableau 91 (et du 111) avec vérification des colonnes au lancement.
Si une colonne requise manque, le script **s'arrête** avec un message nommant
précisément laquelle. Jamais de chiffre faux produit silencieusement.

### 8.5 Corrections apportées au §4.3

- `facture_acompte.id_facture` **n'est pas** un lien vers la facture finale :
  il vaut le propre numéro de l'acompte (5→5, 8→8, 13→13…). Le rapprochement
  acompte ↔ facture finale se fait **par la commande**.
- `facture.id_facture_rattachee` vaut `0` partout sur TEMP, avoirs compris :
  un avoir n'est pas relié en base à sa facture d'origine.

---

## §9 — Corrections imposées par les tests sur PROD (02/10/2026)

> Trois affirmations des §1 à §8 étaient fausses. Chacune a coûté un bug.
> Ce qui suit prime sur les sections antérieures.

---

### 9.1 ⛔ La ligne d'indicateurs est dans le `<thead>`, pas dans le `<tbody>`

**Affirmé au §3** : « La 1ʳᵉ ligne de `tbody` est une ligne d'indicateurs
(sommes/moyennes) à ignorer. »

**Faux.** Un relevé des en-têtes sur PROD montre les sommes (`: 34 891,00`,
`: 4 224,00`…) dans des `<th>` **sans** `id_foxyz_champ`, après les colonnes
réelles. Le `<tbody>` ne contient que des lignes de données.

**Conséquence du bug** (script v1.0 à v1.2) : un `slice(1)` supprimait la
première vraie ligne de chaque tableau.
- Tableau 91 (449 lignes) : perte invisible, sauf quand la ligne sacrifiée
  était la **seule** d'une facture → la facture 184 (1 801,80 €) manquait au CA.
- Tableau 111 (1 ligne) : **tout** disparaissait → « Acomptes : 0 ».

**Règle retenue** : ne jamais sauter de ligne. Écarter les lignes parasites par
leur contenu — un numéro de document est toujours un entier simple
(`/^\d+$/`), une ligne de totaux (`: 4 224,00`) ne passe pas ce test.

---

### 9.2 Le champ 1754 « Type de facture » n'existe pas sur PROD

**Affirmé au §2.2** : colonne disponible, valeurs `Finale` / `Acompte`.

**Faux sur PROD** : absente du sélecteur. Ajoutée manuellement ensuite, elle ne
distingue pas les avoirs — elle n'apporte donc rien.

**Règle retenue** : la nature se déduit de la source et du signe.

| Source | Signe | Nature |
|---|---|---|
| Tableau 91 | positif | Facture |
| Tableau 91 | négatif | Avoir |
| Tableau 111 | positif | Acompte |
| Tableau 111 | négatif | Avoir sur acompte |

Le script ne lit plus 1754. La colonne peut être retirée des tableaux.

---

### 9.3 Les acomptes dans le tableau 91 : coquilles vides

Une facture d'acompte apparaît **deux fois** dans Foxyz :

| Où | Contenu |
|---|---|
| Tableau 91 | coquille : commande `0`, client `-`, total `0,00`, commercial `0` |
| Tableau 111 | données réelles : n°, commande, montant, date, commercial |

Exemple PROD : acompte **n°117**, commande 198, ALLIANCE 3M, **2 112,00 €**,
09/09/2026, commercial 4. Sa facture finale est la **142**, 4 224,00 €, 18/09/2026.

**Règle retenue** : dans le tableau 91, écarter toute ligne ayant à la fois un
montant nul **et** aucune commande. La double condition protège une éventuelle
facture légitime à 0,00 €, qui porterait quand même sa commande.

---

### 9.4 Structure réelle du tableau 111

Relevé sur PROD. Les champs 187 et 2 y portent bien les mêmes identifiants que
dans le tableau 91.

| Champ | Libellé | Rôle |
|---|---|---|
| 1466 | N° Demande/facture acompte | clé de dédoublonnage |
| 1467 | Date creation facture acompte | date de référence |
| 1481 | Total HT facture acompte | montant |
| 187 | N° Commande | pont vers la facture finale |
| 1736 | commande.id_commercial_commande | commercial |
| 2 | Entreprise / Raison sociale | client |

⚠️ Ne pas confondre **1466** avec « N° **ligne** demande/facture acompte », qui
identifie la ligne et non l'acompte.

---

### 9.5 Le filtre d'état masque les factures payées

Le filtre par défaut `;22;` (« Facture en cours ») exclut les factures réglées.
La facture 142 en faisait partie et n'apparaissait pas dans la vue de Bastien.

**Règle retenue** : transmettre `input_s0=` vide **et présent**. Omettre le
paramètre fait revenir le serveur à `;22;`.

Corollaire pour tout contrôle manuel : décocher l'onglet « Facture en cours »,
sinon le total de référence est faux.

---

### 9.6 Le regroupement fausse toute vérification manuelle

Un regroupement actif (ici par N° Commande) fait additionner par Foxyz **toutes**
les colonnes numériques du groupe, y compris le **numéro de facture**, l'**id du
commercial** et les **dates** — d'où des factures n° 1251 et des échéances en 2083.

**Le script EST affecté** : transmettre `etat_group_foxyz=`, `etat_somme_foxyz=`
et `etat_champs_foxyz=` vides dans l'URL **ne neutralise rien** — Foxyz ignore ces
paramètres en GET et applique le regroupement enregistré par l'utilisateur.
Vérifié en conditions réelles le 02/10/2026.

**Parade retenue (script v1.6)** : détection par les dates. Le regroupement
additionne les dates, donc deux factures de 2026 donnent 2083, trois donnent 2140.
Toute date au-delà de l'année suivante, ou antérieure à 2000, déclenche un arrêt
immédiat avec un message explicite. **Aucun fichier n'est généré.**

Limite connue : un regroupement ne fusionnant aucune ligne n'est pas détecté —
mais il n'additionne rien non plus, les chiffres restent donc justes.

**À retenir** : avant tout recoupement manuel, retirer le regroupement.

---

### 9.7 Validation sur données réelles — septembre 2026

Recalcul manuel indépendant depuis un export brut du tableau 91 (449 lignes),
sans utiliser le script : **concordance au centime**.

| | CA net HT | Documents |
|---|---|---|
| Bastien BARBIER | 88 038,20 € | 30 |
| Anthony BAILLY | 141 442,43 € | 49 |
| Hors périmètre (ETS J.MENUT) | 666,40 € | 3 |
| Anomalies | — | 0 |

Le total d'Anthony est resté identique après activation de la déduction d'acompte
(acompte 2 112,00 compté, facture finale ramenée de 4 224,00 à 2 112,00) : c'est
la preuve que le mécanisme ne crée ni ne détruit de CA.

**Non encore éprouvé** : un acompte et sa facture finale sur deux mois distincts.
Le cas n'existe pas dans les données PROD à ce jour.

---

### 9.8 ETS J.MENUT — hors périmètre commercial

Revente de copeaux, pas de chargé d'affaires. Rattaché à l'id 5 dans Foxyz.

Écarté du CA **et** des anomalies, listé dans un bloc de traçabilité du récap.
La liste `CLIENTS_EXCLUS` est en tête du script ; comparaison sur le début du
nom, insensible à la casse et aux accents.

---

## Annexes

Listes brutes dans `diag/` :

- `colonnes_commandes_9.txt` : sélecteur du tableau Commandes (340 disponibles + 12 retenues, avant activation de 1736)
- `colonnes_lignes_factures_91.txt` : sélecteur du tableau Lignes des factures (190 + 9)
- `colonnes_91_ttvoir.txt` : liste étendue « Mettre à jour les colonnes » (426) du tableau 91 (accents abîmés à l'extraction)
- `colonnes_acompte_112_111.txt` : colonnes « acompte / date / montant » des tableaux 112 et 111
- `champs_facture_dictionnaire.txt` : champs techniques `facture*` / `livraison*` du dictionnaire (106)
- `export_natif_lignes_factures.csv` : exemple d'export natif
- `cmd_tableau9.html` : réponse brute du serveur pour le tableau Commandes
- Captures `01_…` à `04_…`


### Annexe A — Tableau Commandes (9), sélecteur standard
<details><summary>Afficher les 352 colonnes</summary>

```
### liste_possible_foxyz_champ (340)
1611 : Abonnement article Type d'abonnement d'un article fournisseur
1610 : Abonnement industrialisation (Sans abonnement) Type d'abonnement de l'industrialisation
1125 : Accuse de reception active (0) 0 : L'accusé de réception dans l'envoi des mails n'est pas automatiquement coché. 1 : L'accusé de réception dans l'envoi des mails est automatiquement coché.
1462 : Acompte paiement fournisseur Condifition des paiements des acomptes fournisseurs
1463 : Acompte reglement client Condition des règlements des acomptes clients
1458 : Acompte reglement ligne commande Mode de règlement de l'acompte de la ligne de commande client.
1456 : Acompte reglement ligne devis Mode de règlement de l'acompte de la ligne de devis.
17 : Activité de l'entreprise Type d'activité du professionnel. C'est ici qu'il y a d'indiquer "Particulier" si c'est un particulier.
3 : Adresse de facturation de l'entreprise Adresse de facturation (numéro, rue) du professionnel ou du particulier
695 : Adresse de la banque Adresse postale de la banque
44 : Adresse du contact Adresse postable du contact
81 : Adresse du salarié Adresse, Code postal, Ville de l'employé
1657 : Adresse établissement (190 rue des falourdes) Adresse de l'établissement
242 : Adresse livraison spécifique entreprise Adresse de l'adresse secondaire
7 : Adresse principale de livraison de l'entreprise Adresse principale de livraison (numéro, rue) du professionnel ou du particulier
2094 : Altitude adresse livraison (0) Altitude de l'adresse principale de livraison de l'entreprise
2097 : Altitude adresse secondaire Altitude de l'adresse de livraison secondaire
881 : Altitude de l'adresse de facturation de l'entreprise (0) Altitude de l'adresse de facturation de l'entreprise
1627 : Autorisation banque Liste des identifiants des employés qui peuvent utiliser cette banque dans les notes de frais. Idenfiant séparé par un tiret
694 : Banque (Caisse d'épargne) Désignation du compte en banque
1626 : Banque active Oui : la banque est utilisable dans le logiciel. Non : la banque n'est pas utilisable dans le logiciel.
1310 : BIC entreprise Numéro du BIC du compte bancaire de l'entreprise
22 : BL par défaut (bon_de_livraison.php)
647 : Budget projet Budget prévisionnel pour ce projet
648 : But du projet Interet du projet
863 : calculette_commande Formule mathématique pour calculer la quantité de la ligne de commande
970 : Catégorie de la ligne du devis Catégorie de la ligne du devis
24 : Certificat de conformité par défaut (Fiche-de-rapport-de-controle.php)
1999 : Cle rib entreprise Numéro de la clé du rib de l'entreprise
1996 : Code banque rib entreprise Numéro du code banque du rib de l'entreprise
1567 : Code devise (EUR) Code de la devise (voir comptabilité)
1997 : Code guichet rib entreprise Numéro du code guichet du rib de l'entreprise
14 : Code NAF/APE de l'entreprise Code APE ou NAF du professionnel
4 : Code postal de facturation de l'entreprise Code postal de l'adresse de facturation du professionnel ou du particulier
9 : Code postal de livraison de l'entreprise Code postal de l'adresse principale de livraison du professionnel ou du particulier
45 : Code postal du contact Code postal de l'adresse du contact
1658 : Code postal établissement (45240 ) Code postal de l'établissement
1733 : Code type de la taxe (S) Code de la taxe (voir factur X)
1201 : Coefficient de securite devis Coefficient de sécurité appliqué à la ligne de devis.
1300 : Colonne solde (0)
1625 : Commentaire banque Commentaire du compte en banque
173 : Commentaire de la ligne du devis Commentaire de la ligne du devis
164 : Commentaire devis Commentaire général à tout le devis
293 : Commentaire du certificat de conformité Commentaire de la ligne de livraison
3954 : Commentaire interne industrialisation Commentaire interne de l'industrialisation qui sera marqué par défaut dans l'ordre de fabrication à sa création
1110 : Commentaire par défaut Gest. achat article fournisseur Commentaire de l'article fournisseur destiné pour les consultations et les commandes fournisseurs
1991 : Commentaire par défaut Gest. Co. article fournisseur Commentaire de l'article fournisseur destiné pour les devis et les commandes clients
238 : Commentaire repère Commentaire du repère
88 : Commentaire salarié Commentaire pour un employé
1337 : Compte comptable revente Numéro de compte comptable des ventes en france pour cet article fournisseur
1651 : Compte defaut journal vente Compte comptable par défaut (si ce n'est pas une industrialisation ou un article fournisseur) pour les ventes
18 : Condition de règlement de l'entreprise Condition par défaut de règlement des factures clients
869 : Configurateur industrialisation Position dans le configurateur des industrialisations
119 : Consigne industrialisation Détail commercial de l'industrialisation. Commentaire appelé par défaut dans les lignes des devis et des commandes clients.
258 : Consigne ordre de fabricaiton Commentaire de fabrication pour cet ordre de fabrication.
43 : Contact toujours en activité (Oui) Oui : le contact est sélectionnable dans l'ERP. Non : il n'est plus sélectionnable.
259 : Cout fabrication ordre de fabrication (0) Cout réel de fabrication (Cout main d'œuvre + achat)
236 : Cout fourniture repère (0)
260 : Cout main d'oeuvre ordre de fabrication (0) Cout de main d'œuvre pour cet ordre de fabrication
645 : Cout projet Cout financier de tout le projet
696 : CP. banque Code postal de l'adresse de la banque
243 : CP. livraison spécifique entreprise Code postal de l'adresse secondaire
366 : Criticité article fournisseur Niveau de criticité de l'article fournisseur. Note finale calculée grace à l'analyse de risque.
135 : Cycle de vente industrialisation (15) Nombre de jours ouvrés pour calculer le délai commercial de l'industrialisation.
134 : Cycle Premier article de l'industrialisation (15) Nombre de jours ouvrés pour calculer le délai de l'étude de l'industrialisation. Ce nombre n'est utile uniquement pour les lignes en premier article.
364 : Date clôture article fournisseur Date de retrait de l'article fournisseur. Non sélectionnable dans l'ERP.
1667 : Date cloture etablissement (2026-09-11 08:50:36) Date et heure de clôture de l'établissement
211 : Date clôture ligne de commande (2026-09-11 08:50:36) Date de clôture de la ligne de commande
257 : Date clôture ordre de fabrication (2026-09-11 08:50:36) Date et heure de clôture de l'ordre de fabrication
358 : Date création article fournisseur Date et heure de création de l'article fournisseur
1665 : Date creation etablissement (2026-09-11 08:42:02) Date et heure de création de l'établissement
131 : Date création industrialisation (2026-09-11 08:34:19) Date et heure de création de l'industrialisation
205 : Date création ligne de commande (2026-09-11 08:42:02) Date de création de la ligne de commande
256 : Date création ordre de fabrication (2026-09-11 08:42:02) Date et heure de création de l'ordre de fabrication
152 : Date création taxe (2026-09-11 08:42:02) Date et heure de création de la taxe
76 : Date d'embauche (2026-03-13) Date de début de l'employé (date d'embauche par exemple)
160 : Date de cloture du devis
641 : Date de clôture du projet (2026-09-11 08:50:36) Date et heure de cloture du projet
638 : Date de début du projet Date de début du projet
77 : Date de fin du salarié (0000-00-00) Date de fin de l'employé (date de fin de contrat par exemple)
207 : Date de la dernière livraison de la ligne de la commande (2026-09-11) Date de la dernière livraison pour cette ligne de commande
1086 : Date de saisie de l'entreprise (2026-04-01 16:42:22) Date et heure de création de l'entreprise
1085 : Date de saisie du contact (2026-04-01 16:42:22) Date et heure de création du contact
212 : Date de validation de la revue des exigences ligne de commande (0000-00-00 00:00:00) Date et heure de validation de la revue des exigences
159 : Date de validité du devis Date de validité du devis. Jusqu'à quand ce devis peut être converti en commande.
1460 : Date encaissement acompte ligne commande Date prévue d'encaissement de l'acompte de la ligne de commande client.
247 : Date enregistrement adresse spécifique Date et heure d'enregistrement de l'adresse secondaire
190 : Date enregistrement de la commande (2026-09-11) Date de création de la commande dans le logiciel
79 : Date et lieu de naissance salarié Date et lieu de naissance de l'employé
978 : Date mail commande Date et heure du premier envoi par mail de la commande client
977 : Date mail devis Date et heure du premier envoi par mail du devis
640 : Date modification du projet (2026-04-29 14:58:06) Date et heure de modication du projet
1666 : Date modification etablissement (2026-04-29 14:58:06) Date et heure de la dernière modification de l'établissement
2087 : Date modification OF (2026-09-11 08:51:05) Date et heure de la dernière modification de l'ordre de fabrication
189 : Date ouverture par le client de la commande (2026-09-11) Date de la création de la commande par le client
642 : Date prévisionnelle de début du projet Date prévisionnelle de début du projet
643 : Date prévisionnelle de fin du projet Date et heure prévisionnelle de fin du projet
158 : Date saisie devis Date et heure de la création du devis
639 : Date saisie du projet (2026-09-11 08:34:19) Date et heure de création du projet
210 : Délai du client pour la ligne de commande (2026-09-18) Délai que le client souhaite
1764 : Delai OF (0000-00-00 00:00:00) Date et heure du délai de l'ordre de fabrication si celui-ci est différent du délai négocié de la commande client
178 : Délai spécifique ligne devis Date d'un délai de livraison négocié lors de l'édition du devis.
2098 : Départ différé (0000-00-00 00:00:00) Etat de l'ordre de fabrication. Le logiciel indique cette valeur en fonction de l'avancement et des encours fournisseurs.
635 : Description du projet Commentaire du projet
356 : Désignation de l'article fournisseur Désignation de l'article fournisseur
184 : Devise (Euros) Désignation de la devise
186 : Devise active (Oui) Oui, la devise est active. Non la devise n'est pas sélectionnable dans le logiciel.
1992 : Disponible en Gest. Co. article fournisseur Oui : l'article est sélectionnable pour les ventes (devis et commande). Non : l'article n'est pas sélecitonnable pour les ventes.
89 : Echelon salarié Echelon du contrat de travail de l'employé
246 : Employé création adresse secondaire (3) Identifiant de l'employé qui a enregistré l'adresse secondaire
865 : Employé création commande client (3) Identifiant de l'employé qui a créé la commande client
180 : Employé dernière modification ligne de devis (3) Identifiant de l'employé qui a modifié la ligne du devis
1106 : Employé envoi AR commande client (0) Identifiant de l'employé qui a envoyé par mail d'accusé de réception de cette commande
1262 : Encaissement prévu le (2026-10-02) Date prévisionnelle d'encaissement de la ligne de commande client.
29 : Entreprise active (Oui) Oui, l'entreprise est active dans votre logiciel. C’est-à-dire qu'elle est sélectionnable dans les formulaires. Non c'est qu'elle est inactive.
21 : Entreprise client (OUI) Oui c'est un client, Non ce n'est pas un client
241 : Entreprise de l'adresse secondaire (14) Lien adresse de livraison secondaire et entreprise
28 : Entreprise facturable (NON) Oui, l'entreprise est facturable. Non elle n'est pas facturable.
20 : Entreprise fournisseur (OUI) Oui c'est un fournisseur, Non ce n'est pas un fournisseur
33 : Entreprise soumise à la TVA (OUI) Oui, vous pouvez choisir le taux de TVA dans le formulaire. Non, il n'est possible de sélecitonner que des taux de TVA à 0%.
1655 : Etablissement (MECANICKEL) Désigation de l'établissement
644 : Etat du projet Etat du projet. Donnée renseignée par Foxyz
177 : Etat ligne devis Etat de la ligne du devis. C'est une donnée saisie par les utilisateurs.
1065 : export_ga_defaut (Non)
23 : Facture par défaut (facture.php)
355 : Famille article fournisseur Famille de l'article fournisseur (second niveau d'une catégorisation à 3 niveaux).
867 : Famille industrialisation Famille de l'industrialisation (second niveau d'une catégorisation à 3 niveaux).
16 : Fax de l'entreprise Numéro de faxe du professionnel ou du particulier
73 : Fonction du salarié (Chargé d'affaires) Fonction de l'employé dans la société
234 : Format matière repère (Pave)
3862 : Frais fixes certificat de conformité (0) Tarif fixe du certificat de conformité
3861 : Frais fixes ligne de commande (0) Frais fixes de la ligne de commande client.
3860 : Frais fixes ligne de devis Frais fixes de la ligne de devis.
30 : Groupement pour facturation de l'entreprise Cela permet d'identifier les regroupement des BL par facture.
862 : grouper_lc Oui : l'ordre de fabrication aura plusieurs lignes de commandes associées. Non ou vide : un ordre de fabrication pour une ligne de commande client
1356 : HS CODE HS code (code douanier) pour l'industrialisation
1359 : HS CODE article HS code (code douanier) pour l'article fournisseur
1311 : IBAN entreprise Numéro de l'IBAN du compte bancaire de l'entreprise
376 : Image article fournisseur Nom du fichier image de l'article fournisseur
1608 : Image entreprise Nom du fichier image pour cette entreprise
138 : Image industrialisation Nom du fichier de l'image de l'industrialisation
1589 : Image ligne commande Image associée à la ligne de commande client.
1073 : Image salarié Nom de l'image du salarié
48 : Incoterm du contact Condition incoterm du contact
179 : Indice de confiance de la ligne du devis Notation sur 100 pour indiquer notre confiance dans la transformation de cette ligne de devis en ligne de commande.
123 : Indice industrialisation (a) Version ou indice de l'industrialisation
866 : Industrialisation active (Oui) Non : l'industrialisation n'est plus active. Oui : l'industrialisation est active. Cela veut dire quelle est sélectionnable dans les devis et les commandes clients
227 : Industrialisation du repère (28) Lien repète et industrialisation
91 : Interface principal salarié Interface activité lors de l'utilisation d'un badge pour l'employé
2092 : Latitude adresse livraison (46.603354) Latitude de l'adresse principale de livraison de l'entreprise
2095 : Latitude adresse secondaire Latitude de l'adresse secondaire
870 : Latitude de l'adresse de facturation de l'entreprise (46.603354) Latitude de l'adresse de facturation de l'entreprise
288 : Ligne de commande du rapport de contrôle (58) Lien ligne de livraison et ligne de la commande client
1664 : Logo etablissement (Etablissements/Etablissement 1/logo_etablissement_20260429145806.jpg) Nom du fichier image pour cet établissement
2093 : Longitude adresse livraison (1.8883335) Longitude de l'adresse principale de livraison de l'entreprise
2096 : Longitude adresse secondaire Longitude de l'adresse secondaire
871 : Longitude de l'adresse de facturation de l'entreprise (1.8883335) Longitude de l'adresse de facturation de l'entreprise
700 : Mail banque Adresse mail du contact de votre banque
40 : Mail du contact Adresse mail du contact
1780 : Mail personnel Adresse mail personnel de l'employé
84 : Mail professionnel du salarié Adresse mail professionnel de l'employé
359 : Marque article fournisseur Marque de l'article fournisseur
883 : Minimum de commande Article Quantité minimum dans une ligne de commande client pour un article fournisseur
882 : Minimum de commande Industrialisation (0) Quantité minimum dans une ligne de commande client pour une industrialisation
1799 : Mode importation bancaire API : récupération des relevés de compte par API. CSV : récupération des relevés de compte par importation de CSV.
1461 : Mode paiement fournisseur Condition de paiement des factures fournisseurs finales
86 : Mutuelle salarié Mutuelle de l'employé
1654 : N ° Etablissement (1) Identifiant de l'établissement
240 : N° Adresse livraison spécifique Identifiant de l'adresse secondaire
350 : N° Article fournisseur Identifiant article fournisseur
92 : N° Badge Numéro du badge pour cet employé
693 : N° Banque (1) Identifiant de la banque (Compte en banque) ou d'un compte courant d'associé
286 : N° Certificat de conformité (32) Identifiant de la ligne de la livraison
35 : N° Contact (21) Identifiant unique du contact (personne physique ou morale)
156 : N° Devis Identifiant du devis (proposition commerciale , offre de prix)
183 : N° Devise (1) Identifiant de la devise (monnaie)
1587 : N° du contact origne (0) Lien employé et contact
1 : N° Entreprise (14) Identifiant unique qui identifie les professionnels (entreprise) et les particuliers
197 : N° Ligne commande (58) Identifant de la ligne de la commande client
166 : N° Ligne du devis Identifiant de la ligne du devis
3817 : N° Phase de stockage (172) Identifiant de la phase qui mettra à jour la quantité disponible en stock dans la table industrialisation
633 : N° Projet Identifiant du projet
226 : N° Repère (38) Identifiant du repère
63 : N° Salarié (3) Identifiant de l'employé. Un employé est une personne ayant accès au logiciel durant une période. Si une personne fait un stage, puis est embauché, nous demandons de gérer deux employés.
11 : N° Siret de l'entreprise Numéro de SIRET du professionnel
146 : N° Taxe (1) Identifiant de la taxe
78 : Nom de jeune fille salarié Nom de jeune fille de l'employé
36 : Nom du contact (Service COMMERCIAL) Nom du contact ou titre
698 : Nom du contact de la banque Nom du contact de votre banque
64 : Nom salarié (BARBIER) Nom de l'employé
147 : Nom taxe (TVA 20%) Désignation de la taxe
1226 : Nombre d'échéances d'abonnement (abonnement) (0) Nombre d'échéances d'abonnement facturées pour cette ligne de commande client.
261 : Nombre d'heures passés ordre de fabrication (0) Nombre d'heures pointées sur cet ordre de fabrication
222 : Nombre d'heures produites par ligne de commande (0) Nombre d'heures pointées sur cette ligne de commande. Réellement le pointage à lieu sur l'OF.
1227 : Nombre de mois dans une échéance (abonnement) (0) Nombre de mois compris dans une échéance d'abonnement pour cette ligne de commande client.
296 : Nombre de non qualité par ligne de livraison (0) Nombre d'éléments non conformes par ligne de livraison au moment de l'édition de la livraison.
2100 : Nombre heures à conserver RH (39) Nombre d'heures à ne pas modifier son planning lors de la planification automatique
1607 : Note de frais (Non) Oui : Pour cette entreprise, vous pouvez saisir une note de frais. Non : Cette entreprise n'est pas sélectionnable dans le module des notes de frais.
148 : Numéro comptabe taxe client (Non definie) Numéro du compte comptable de la taxe pour les ventes. Si cette valeur est vide, elle ne sera pas sélectionnable pour les ventes.
1358 : Numéro comptable achat export article fournisseur Numéro de compte comptable des achats internationnaux pour cet article fournisseur
372 : Numéro comptable article fournisseur Numéro de compte comptable des achats en france pour cet article fournisseur
1354 : Numéro comptable export industrialisation Numéro comptable des ventes à l'internationnal de l'industrialisation. Le tiret "-" permet de séparer le compte principal du compte auxiliaire.
3810 : Numéro comptable fournisseur acompte Numéro de compte comptable de l'entreprise en attente correspondant au compte 4091-Fournisseur. Un tirer "-" permet de découper le compte principal du compte auxilaire.
136 : Numéro comptable industrialisation Numéro comptable des ventes en France de l'industrialisation. Le tiret "-" permet de séparer le compte principal du compte auxiliaire.
149 : Numéro comptable taxe fournisseur (Non definie) Numéro du compte comptable de la taxe pour les achats. Si cette valeur est vide, elle ne sera pas sélectionnable pour les achats.
1998 : Numero compte rib entreprise Numéro du compte du rib de l'entreprise
26 : Numéro de compte comptable client de l'entreprise Numéro de compte comptable de l'entreprise correspondant au compte 411-Client. Un tirer "-" permet de découper le compte principal du compte auxilaire.
27 : Numéro de compte comptable fournisseur de l'entreprise Numéro de compte comptable de l'entreprise correspondant au compte 401-Fournisseur. Un tirer "-" permet de découper le compte principal du compte auxilaire.
83 : Numéro de portable professionnel salarié Numéro de téléphone (portable) professionnel de l'employé
15 : Numéro de télélphone principal de l'entreprise Numéro de téléphone principal du professionnel ou du particulier
699 : Numéro de téléphone banque Numéro de téléphone du contact de votre banque
42 : Numéro de téléphone du contact Numéro de téléphone du contact
82 : Numéro de téléphone fixe professionnel du salarié Numéro de téléphone (fixe) professionnel de l'employé
1855 : Ordre du repere dans le produit (1) Position (ou ordre) du repère dans la fiche de l'industrialisation
864 : ordre_ligne_commande (3) Position de la ligne de la commande dans la commande
1934 : Origine création du commande Origine de la création de la commande
1933 : Origine création du devis Interface de création du devis
798 : Origine devis Origine du devis
32 : OTD maximum de l'entreprise (1) Nombre de jours accepté par le client de retard de la livraison
31 : OTD minimum de l'entreprise (-1000) Nombre de jours accepté par le client d'anticipation de la livraison
797 : Ouverture Dimanche Entreprise Horaire d'ouverture de l'entreprise le dimanche
793 : Ouverture Jeudi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le jeudi
796 : Ouverture Lundi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le lundi
795 : Ouverture Mardi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le mardi
794 : Ouverture Mercredi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le mercredi
791 : Ouverture Samedi Entreprise Horaire d'ouverture de l'entreprise le samedi
792 : Ouverture Vendredi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le vendredi
6 : Pays de facturation de l'entreprise (FRANCE) Pays de facturation du profesisonnel ou du particulier
8 : Pays de l'adresse de livraison principale de l'entreprise (FRANCE) Pays de l'adresse principale de livraison du profesisonnel ou du particulier
47 : Pays du contact Pays de l'adresse du contact
1660 : Pays établissement (France) Pays de l'adresse de l'établissement
245 : Pays livraison spécifique Pays de l'adresse secondaire
1360 : Poids article fournisseur (kg) Poids de l'article fournisseur en kg
1357 : Poids industrialisation (kg) Poids de l'industrialisation en kg
1779 : Portable personnel Numéro de portable personnel de l'employé
1107 : Position configurateur article fournisseur Position dans le configurateur des articles fournisseurs
1851 : Position des caractères à remplacer taxe (0) Position des caractères qui remplaceront d'autres caractères de l'écriture comptable des ventes
1853 : Position du caractère à remplacer établissement (0) Position du caractère à remplacer pour les comptes comptables pour cet établissement
37 : Prénom du contact Prénom du contact ou sous-titre
65 : Prénom salarié (Bastien) Prénom de l'employé
2085 : Priorite de l OF (50) Niveau de priorité de l'ordre de fabrication
634 : Projet Désignation du projet
39 : Pronom du contact (M.) Prénom du contact si c'est une personne physique
3808 : Pronom employe Pronom de l'employé
1355 : Qte economique lancement (1) Quantité économique de lancement en production de l'industrialisation
838 : qte_stockee Quantité disponible en stock. Valeur calculée.
855 : Qte. a livrer (0)
228 : Qté. de repère par industrialisation (1) Quantité de repère dans une industrialisation
254 : Qté. lancée ordre de fabrication (40) Quantité lancée en fabrication pour cet ordre de fabrication
174 : Qté. ligne devis Quantité d'élements de la ligne du devis
289 : Qté. livrée (20) Quantité livrée pour ce certificat de conformité
375 : Qté. numéro de lot par réception (article fournisseur) Quantité de numéros lots créés automatiquement lors de la réception d'une ligne de commande fournisseur
41 : Qualification du contact (Service COMMERCIAL) Qualification de la personne physique ou service de la personne morale
235 : Qui fournit la matière du repère (Matiere fournie par le client)
87 : Qui prévenir salarié Contact à prévenir pour un employé
295 : Réactivité par ligne de livraison (-21) Nombre de jours d'écart entre la date de la livraison et le délai négocié de la commande au moment de l'édition de la livraison
2088 : Ref client ligne Référence client de la ligne de commande client.
2089 : Ref client ligne devis Référence client de la ligne de devis.
120 : Référence client industrialisation Référence secondaire de l'industrialisation
214 : Référence client ligne de commande Référence client de la ligne de la commande du client
194 : Référence commande client Référence de la commande du client ou titre de la commande interne
116 : Référence complete industrialisation (S-052 Indice a) Concaténation de la référence de l'industrialisation et de sa version. Cette donnée doit être unique.
352 : Référence de l'article fournisseur Référence de l'article fournisseur
971 : Référence de la ligne de la commande Référence ou titre de la ligne de la commande client. Elle est renseignée si ce n'est ni une industrialisation, ni un repère, ni un article fournisseur
969 : Référence de la ligne du devis Référence ou titre de la ligne du devis. Elle est renseignée si ce n'est ni une industrialisation, ni un repère, ni un article fournisseur
162 : Référence devis Désignation du devis ou titre du devis
122 : Référence industrialisation (S-052) Référence de l'industrialisation
357 : Référence secondaire article fournisseur Référence secondaire de l'article fournisseur
12 : Régime des commerces de l'entreprise Régime des commerces à laquelle le professionnel est rattaché
25 : Relevé de mesures par défaut (Fiche-d-autocontrole.php)
229 : Repère (TENON BERCEAUX GH LASER - BARETTE DE 6) Désignation du repère
237 : Repère avec gamme témoin Désignation de la gamme type si ce repère sert de gamme type.
215 : Réponse à la revue des exigences par ligne de commande Commentaire à adresser au client pour cette ligne de commande
161 : Réponse souhaitée par le client devis Date de réponse souhaitée par le client. C'est le délai que nous avons pour lui remettre le devis.
841 : Salarie creation commande (Bastien BARBIER)
75 : Salarié en activité (Oui) Oui, l'employé est disponible dans le logiciel. Non, il est indisponible.
842 : Salarie modification commande (Bastien BARBIER)
72 : Service du salarié Service dans lequel l'employé travaille
370 : Seuil de sécurité article fournisseur Quantité du seuil de sécurité pour l'article fournisseur
1656 : Siret établissement (53492023600021) Numéro de siret de l'établissement
1606 : Site internet Lien du site internet de l'entreprise
80 : Situation familiale salarié Situation familiale de l'employé
354 : Sous famille article fournisseur Sous-famille de l'article fournisseur (troisème niveau d'une catégorisation à 3 niveaux).
868 : Sous famille Industrialisation Sous-famille de l'industrialisation (troisième niveau d'une catégorisation à 3 niveaux).
983 : Step gestion stock Step pour la quantité de stock pour l'article fournisseur
140 : Stock de sécurité industrialisation Valeur en quantité d'industrialisation du seuil d'alerte quand le stock de sécurité est atteint.
3818 : Stock Phase de stockage (0) Quantité du stock de l'industrialisation. Attention cette valeur est calculée. Il vaut mieux la recalculer.
139 : Taille de lot industrialisation Quantité incrémentale pour la vente des industrialisations (utile pour les devis et les commandes)
371 : Taille de lot pour commande article fournisseur Taille de lot de cet article fournisseur pour les lignes de commande fournisseur
1453 : Tarif fixe repere (0) Tarif fixe hors taxe du repère pour la vente
856 : Tarif HT. a livrer (0)
175 : Tarif total HT avant remise ligne devis Tarif total hors taxe avant remise de toute la ligne du devis
999 : Tarif total HT ligne commande (0)
176 : Tarif total HT ligne devis Tarif total hors taxe après remise de toute la ligne du devis
292 : Tarif total HT ligne livraison (0) Total hors taxe après la remise du certificat de conformité
239 : Tarif unitaire de vente repère (0) Tarif unitaire de vente hors taxe du repère
290 : Tarif unitaire HT livré (0)
1465 : Taux acompte client (0) Taux de l'acompte à demander pour les ventes pour cette entreprise
1464 : Taux acompte fournisseur (0) Taux de l'acompte à verser pour les achats pour cette entreprise
1459 : Taux acompte ligne commande (0) Taux d'acompte appliqué à la ligne de commande client.
1457 : Taux acompte ligne devis Taux d'acompte appliqué à la ligne de devis.
196 : Taux de change commande Taux de change de la commande. Cette donnée sert à convertir la devise de la commande en la devise interne du logiciel.
165 : Taux de change devis Taux de change du devis. Cette donnée sert à convertir la devise du devis en la devise interne du logiciel.
374 : Taux de conversion entre unité (article fournisseur) Taux de version entre l'unité d'achat et l'unité de gestion pour l'article fournisseur
74 : Taux horaire de vente du salarié (80) Taux horaire de vente de l'employé dans le pointage des actions
216 : Taux horaire objectif ligne de commande (0) Taux horaire objectif de la ligne de commande. La formule est la somme des coûts de fabrication (taux RH * temps pointé + taux Machine * temps pointé + Achat) divisé par la somme des temps (temps pointé).
213 : Taux horaire réel ligne de commande (0) Taux horaire réel de la ligne de commande. La formule est la différence entre la vente (valeur HT de la ligne de commande) et les achats (valeur HT des affectations des lignes de commandes fournisseurs), le tout divisé par la somme des temps (temps pointé).
151 : Taux taxe (20) Taux de la taxe. C'est le pourcentage de la taxe que vous collectez ou déduissez.
150 : Taxe active (Oui) Oui, la taxe est utilisable. Non la taxe est non sélectionnable dans les formulaires.
1663 : Tél. établissement (02 38 59 15 27) Numéro de téléphone de l'établissement
1778 : Telephone personnel Numéro de téléphone personnel de l'employ
1108 : tp_af
1109 : tu_af
13 : TVA Intra. Com. Entreprise Numéro de TVA intracommunautaire du professionnel
353 : Type article fournisseur Type de l'article fournisseur (premier niveau d'une catégorisation à 3 niveaux).
378 : Type d'approvisionnement (article fournisseur) Type de gestion de stock : FIFO, FEFO, LIFO
144 : Type d'approvisionnement industrialisation Type de gestion de stock : FIFO, FEFO, LIFO
1307 : Type d'utilisateur (0) Type d'utilisateur
1856 : Type de commande (Fabrication) Type de commande
1763 : Type de devis Type de devis (Affaire ou Fabrication)
230 : Type de matière pour le repère
646 : Type de projet Type de projet
121 : Type industrialisation Type de l'industrialisation (premier niveau d'une catégorisation à 3 niveaux).
1066 : type_disponibilite_employe (4) Identifiant du type de semaine par défaut pour cet employe
360 : Unité d'achat article fournisseur Unité d'achat de l'article fournisseur
373 : Unité de gestion article fournisseur Unité de gestion de l'article fournisseur. Cette unité est utilisé pour la gestion interne et pour la revente.
137 : Unité industrialisation (U : Unité) Unité de vente de l'industrialisation
1111 : unite_repere Unité du repère
821 : URL Ical salarié Url pour le partage d'un agenda ICS
1854 : Valeur de remplacement établissement Valeur du caractère à remplacer pour les comptes comptables pour cet établissement
1852 : Valeur de remplacement taxe Caractères (lettre ou chiffre) qui remplacera d'autres caractères de l'écriture comptable des ventes
2086 : Version de la gamme pour l OF (0000-00-00 00:00:00) Date et heure correspondant à la version de la gamme pour cet ordre de fabrication
244 : Ville adresse livraison spécifique Ville de l'adresse secondaire
697 : Ville banque Ville de l'adresse de la banque
5 : Ville de facturation de l'entreprise Ville de l'adresse de facturation du professionnel ou du particulier
10 : Ville de livraison de l'entreprise Ville de l'adresse principale de livraison du professionnel ou du particulier
46 : Ville du contact Ville de l'adresse du contact
1659 : Ville établissement (MENESTREAU EN VILLETTE) Ville de l'adresse de l'établissement
377 : Zone de stockage par défaut (article fournisseur) Zone de stockage par défaut de cet article fournisseur
143 : Zone de stockage par défaut industrialisation Zone de stockage par défaut quand une mise en stock est déclarée pour cette industrialisation.
### liste_finale_foxyz_champ (12)
1 187 : N° Commande (44) Identifiant de la commande client
2 2 : Entreprise / Raison sociale (MECANICKEL) Nom de l'entreprise pour les professionnels ou si c'est un particulier, nom du foyer
3 4049 : Nom & Prénom Contact (Service COMMERCIAL )
4 203 : Qté. commandée ligne de commande (20) Quantité d'élements de la ligne de la commande
5 118 : Industrialisation (TENON BERCEAUX GH LASER) Désignation de l'industrialisation
6 204 : Tarif unitaire HT ligne de commande (0)
7 185 : Symbole devise (€) Symbole de la devis
8 250 : N° OF (47) Identifiant de l'ordre de fabrication
9 208 : Délai négocié pour la ligne de commande (2026-10-02) Délai que vous avez négocié avec le client
10 209 : Délai planifié pour la ligne de commande (0000-00-00 00:00:00) Délai calculé par la planification
11 743 : Tarif total HT ligne commande (0) Tarif total hors taxe après remise de la ligne de commande client
12 115 : N° Industrialisation (28) Identifiant de l'industrialisation. L'industrialisation est un produit ou un produit semi-fini. Il ne peut pas être acheté. Il ne peut être que vendu. Il peut avoir une gamme de fabrication.
```

</details>

### Annexe B — Lignes des factures (91), sélecteur standard
<details><summary>Afficher les 199 colonnes</summary>

```
### liste_possible_foxyz_champ (190)
17 | 17 : Activité de l'entreprise Type d'activité du professionnel. C'est ici qu'il y a d'indiquer "Particulier" si c'est un particulier.
3 | 3 : Adresse de facturation de l'entreprise Adresse de facturation (numéro, rue) du professionnel ou du particulier
44 | 44 : Adresse du contact Adresse postable du contact
242 | 242 : Adresse livraison spécifique entreprise Adresse de l'adresse secondaire
7 | 7 : Adresse principale de livraison de l'entreprise (Z. I. Ormes, 6 Rue du Paradis) Adresse principale de livraison (numéro, rue) du professionnel ou du particulier
881 | 881 : Altitude de l'adresse de facturation de l'entreprise (0) Altitude de l'adresse de facturation de l'entreprise
1310 | 1310 : BIC entreprise Numéro du BIC du compte bancaire de l'entreprise
22 | 22 : BL par défaut (bon_de_livraison.php)
970 | 970 : Catégorie de la ligne du devis Catégorie de la ligne du devis
24 | 24 : Certificat de conformité par défaut (Fiche-de-rapport-de-controle.php)
14 | 14 : Code NAF/APE de l'entreprise Code APE ou NAF du professionnel
4 | 4 : Code postal de facturation de l'entreprise (45140 ) Code postal de l'adresse de facturation du professionnel ou du particulier
9 | 9 : Code postal de livraison de l'entreprise (45140 ) Code postal de l'adresse principale de livraison du professionnel ou du particulier
45 | 45 : Code postal du contact Code postal de l'adresse du contact
173 | 173 : Commentaire de la ligne du devis Commentaire de la ligne du devis
164 | 164 : Commentaire devis Commentaire général à tout le devis
266 | 266 : Commentaire du bl Commentaire de la livraison
293 | 293 : Commentaire du certificat de conformité Commentaire de la ligne de livraison
3954 | 3954 : Commentaire interne industrialisation Commentaire interne de l'industrialisation qui sera marqué par défaut dans l'ordre de fabrication à sa création
238 | 238 : Commentaire repère Commentaire du repère
283 | 283 : Condition de paiement spécifique à la facture Condition de règlement propre à la facture. Si cette data n'est pas renseignée, il faut prendre celle présente dans la table entreprise.
18 | 18 : Condition de règlement de l'entreprise Condition par défaut de règlement des factures clients
119 | 119 : Consigne industrialisation Détail commercial de l'industrialisation. Commentaire appelé par défaut dans les lignes des devis et des commandes clients.
258 | 258 : Consigne ordre de fabricaiton Commentaire de fabrication pour cet ordre de fabrication.
43 | 43 : Contact toujours en activité (Oui) Oui : le contact est sélectionnable dans l'ERP. Non : il n'est plus sélectionnable.
259 | 259 : Cout fabrication ordre de fabrication Cout réel de fabrication (Cout main d'œuvre + achat)
236 | 236 : Cout fourniture repère
260 | 260 : Cout main d'oeuvre ordre de fabrication Cout de main d'œuvre pour cet ordre de fabrication
243 | 243 : CP. livraison spécifique entreprise Code postal de l'adresse secondaire
135 | 135 : Cycle de vente industrialisation (15) Nombre de jours ouvrés pour calculer le délai commercial de l'industrialisation.
134 | 134 : Cycle Premier article de l'industrialisation (0) Nombre de jours ouvrés pour calculer le délai de l'étude de l'industrialisation. Ce nombre n'est utile uniquement pour les lignes en premier article.
276 | 276 : Date clôture facture (0000-00-00) Date de cloture de la facture
211 | 211 : Date clôture ligne de commande Date de clôture de la ligne de commande
257 | 257 : Date clôture ordre de fabrication Date et heure de clôture de l'ordre de fabrication
274 | 274 : Date création facture (2026-09-04) Date de création de la facture
131 | 131 : Date création industrialisation Date et heure de création de l'industrialisation
205 | 205 : Date création ligne de commande Date de création de la ligne de commande
256 | 256 : Date création ordre de fabrication Date et heure de création de l'ordre de fabrication
152 | 152 : Date création taxe Date et heure de création de la taxe
160 | 160 : Date de cloture du devis
207 | 207 : Date de la dernière livraison de la ligne de la commande (2026-07-20) Date de la dernière livraison pour cette ligne de commande
1086 | 1086 : Date de saisie de l'entreprise (2026-05-22 11:25:04) Date et heure de création de l'entreprise
1085 | 1085 : Date de saisie du contact (2026-05-22 11:25:04) Date et heure de création du contact
212 | 212 : Date de validation de la revue des exigences ligne de commande (0000-00-00 00:00:00) Date et heure de validation de la revue des exigences
159 | 159 : Date de validité du devis Date de validité du devis. Jusqu'à quand ce devis peut être converti en commande.
247 | 247 : Date enregistrement adresse spécifique Date et heure d'enregistrement de l'adresse secondaire
190 | 190 : Date enregistrement de la commande (2026-06-10) Date de création de la commande dans le logiciel
264 | 264 : Date expédition bl Date de l'expédition de la livraison
282 | 282 : Date exportation facture (0000-00-00) Date d'envoi de la facture vers le logiciel de comptabilité
979 | 979 : Date mail facture Date et heure du premier envoi par mail de la facture
189 | 189 : Date ouverture par le client de la commande (2026-06-10) Date de la création de la commande par le client
158 | 158 : Date saisie devis Date et heure de la création du devis
210 | 210 : Délai du client pour la ligne de commande (2026-06-17) Délai que le client souhaite
208 | 208 : Délai négocié pour la ligne de commande (2026-07-01) Délai que vous avez négocié avec le client
209 | 209 : Délai planifié pour la ligne de commande (2026-06-10 14:17:01) Délai calculé par la planification
178 | 178 : Délai spécifique ligne devis Date d'un délai de livraison négocié lors de l'édition du devis.
184 | 184 : Devise (Euros) Désignation de la devise
186 | 186 : Devise active (Oui) Oui, la devise est active. Non la devise n'est pas sélectionnable dans le logiciel.
246 | 246 : Employé création adresse secondaire Identifiant de l'employé qui a enregistré l'adresse secondaire
268 | 268 : Employé création BL Identifiant de l'employé qui a créé la livraison
180 | 180 : Employé dernière modification ligne de devis Identifiant de l'employé qui a modifié la ligne du devis
347 | 347 : Employé dernière modification ligne de facture proforma Identifiant de l'employé qui a modifié la ligne de la facture
1262 | 1262 : Encaissement prévu le (2026-07-01) Date prévisionnelle d'encaissement de la ligne de commande client.
29 | 29 : Entreprise active (Oui) Oui, l'entreprise est active dans votre logiciel. C’est-à-dire qu'elle est sélectionnable dans les formulaires. Non c'est qu'elle est inactive.
21 | 21 : Entreprise client (OUI) Oui c'est un client, Non ce n'est pas un client
241 | 241 : Entreprise de l'adresse secondaire (31) Lien adresse de livraison secondaire et entreprise
1089 | 1089 : Entreprise de la facture (31) Lien facture et entreprise
28 | 28 : Entreprise facturable (OUI) Oui, l'entreprise est facturable. Non elle n'est pas facturable.
20 | 20 : Entreprise fournisseur (OUI) Oui c'est un fournisseur, Non ce n'est pas un fournisseur
33 | 33 : Entreprise soumise à la TVA (OUI) Oui, vous pouvez choisir le taux de TVA dans le formulaire. Non, il n'est possible de sélecitonner que des taux de TVA à 0%.
177 | 177 : Etat ligne devis Etat de la ligne du devis. C'est une donnée saisie par les utilisateurs.
279 | 279 : Facture commentaire Commentaire de la facture (en bas)
280 | 280 : Facture commentaire 2 Commentaire de la facture (en haut au centre)
281 | 281 : Facture commentaire 3 Commentaire de la facture (en haut à gauche)
346 | 346 : Facture de la ligne proforma (28) Lien ligne facture et facture
23 | 23 : Facture par défaut (facture.php)
16 | 16 : Fax de l'entreprise Numéro de faxe du professionnel ou du particulier
234 | 234 : Format matière repère
30 | 30 : Groupement pour facturation de l'entreprise Cela permet d'identifier les regroupement des BL par facture.
1311 | 1311 : IBAN entreprise Numéro de l'IBAN du compte bancaire de l'entreprise
1090 | 1090 : id_client (51) Lien facture et contact
1088 | 1088 : id_employe_mail_facture (0) Identifiant de l'employé qui a envoyé la facture par mail
138 | 138 : Image industrialisation Nom du fichier de l'image de l'industrialisation
48 | 48 : Incoterm du contact Condition incoterm du contact
179 | 179 : Indice de confiance de la ligne du devis Notation sur 100 pour indiquer notre confiance dans la transformation de cette ligne de devis en ligne de commande.
123 | 123 : Indice industrialisation (A) Version ou indice de l'industrialisation
118 | 118 : Industrialisation ( JOINTS DIFFUSEUR VISSEUSSE MECA L33) Désignation de l'industrialisation
227 | 227 : Industrialisation du repère (21) Lien repète et industrialisation
870 | 870 : Latitude de l'adresse de facturation de l'entreprise (47.9116141172) Latitude de l'adresse de facturation de l'entreprise
340 | 340 : Ligne de commande de la ligne proforma (40) Lien ligne de la facture et de la ligne de commande client
288 | 288 : Ligne de commande du rapport de contrôle (40) Lien ligne de livraison et ligne de la commande client
871 | 871 : Longitude de l'adresse de facturation de l'entreprise (1.87108144709) Longitude de l'adresse de facturation de l'entreprise
40 | 40 : Mail du contact Adresse mail du contact
240 | 240 : N° Adresse livraison spécifique Identifiant de l'adresse secondaire
286 | 286 : N° Certificat de conformité Identifiant de la ligne de la livraison
35 | 35 : N° Contact (51) Identifiant unique du contact (personne physique ou morale)
156 | 156 : N° Devis Identifiant du devis (proposition commerciale , offre de prix)
183 | 183 : N° Devise (1) Identifiant de la devise (monnaie)
1 | 1 : N° Entreprise (31) Identifiant unique qui identifie les professionnels (entreprise) et les particuliers
115 | 115 : N° Industrialisation (21) Identifiant de l'industrialisation. L'industrialisation est un produit ou un produit semi-fini. Il ne peut pas être acheté. Il ne peut être que vendu. Il peut avoir une gamme de fabrication.
197 | 197 : N° Ligne commande (40) Identifant de la ligne de la commande client
166 | 166 : N° Ligne du devis Identifiant de la ligne du devis
226 | 226 : N° Repère Identifiant du repère
11 | 11 : N° Siret de l'entreprise Numéro de SIRET du professionnel
146 | 146 : N° Taxe (1) Identifiant de la taxe
36 | 36 : Nom du contact (JACOPIN) Nom du contact ou titre
147 | 147 : Nom taxe (TVA 20%) Désignation de la taxe
261 | 261 : Nombre d'heures passés ordre de fabrication Nombre d'heures pointées sur cet ordre de fabrication
222 | 222 : Nombre d'heures produites par ligne de commande (6.82) Nombre d'heures pointées sur cette ligne de commande. Réellement le pointage à lieu sur l'OF.
296 | 296 : Nombre de non qualité par ligne de livraison Nombre d'éléments non conformes par ligne de livraison au moment de l'édition de la livraison.
148 | 148 : Numéro comptabe taxe client (Non definie) Numéro du compte comptable de la taxe pour les ventes. Si cette valeur est vide, elle ne sera pas sélectionnable pour les ventes.
136 | 136 : Numéro comptable industrialisation Numéro comptable des ventes en France de l'industrialisation. Le tiret "-" permet de séparer le compte principal du compte auxiliaire.
149 | 149 : Numéro comptable taxe fournisseur (Non definie) Numéro du compte comptable de la taxe pour les achats. Si cette valeur est vide, elle ne sera pas sélectionnable pour les achats.
26 | 26 : Numéro de compte comptable client de l'entreprise Numéro de compte comptable de l'entreprise correspondant au compte 411-Client. Un tirer "-" permet de découper le compte principal du compte auxilaire.
27 | 27 : Numéro de compte comptable fournisseur de l'entreprise Numéro de compte comptable de l'entreprise correspondant au compte 401-Fournisseur. Un tirer "-" permet de découper le compte principal du compte auxilaire.
15 | 15 : Numéro de télélphone principal de l'entreprise Numéro de téléphone principal du professionnel ou du particulier
42 | 42 : Numéro de téléphone du contact Numéro de téléphone du contact
798 | 798 : Origine devis Origine du devis
973 | 973 : OTD Livraison (100)
32 | 32 : OTD maximum de l'entreprise (1) Nombre de jours accepté par le client de retard de la livraison
31 | 31 : OTD minimum de l'entreprise (-1000) Nombre de jours accepté par le client d'anticipation de la livraison
797 | 797 : Ouverture Dimanche Entreprise Horaire d'ouverture de l'entreprise le dimanche
793 | 793 : Ouverture Jeudi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le jeudi
796 | 796 : Ouverture Lundi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le lundi
795 | 795 : Ouverture Mardi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le mardi
794 | 794 : Ouverture Mercredi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le mercredi
791 | 791 : Ouverture Samedi Entreprise Horaire d'ouverture de l'entreprise le samedi
792 | 792 : Ouverture Vendredi Entreprise (8H-17H) Horaire d'ouverture de l'entreprise le vendredi
6 | 6 : Pays de facturation de l'entreprise (FRANCE) Pays de facturation du profesisonnel ou du particulier
8 | 8 : Pays de l'adresse de livraison principale de l'entreprise (FRANCE) Pays de l'adresse principale de livraison du profesisonnel ou du particulier
47 | 47 : Pays du contact Pays de l'adresse du contact
245 | 245 : Pays livraison spécifique Pays de l'adresse secondaire
37 | 37 : Prénom du contact (Florent) Prénom du contact ou sous-titre
39 | 39 : Pronom du contact (M.) Prénom du contact si c'est une personne physique
203 | 203 : Qté. commandée ligne de commande (4) Quantité d'élements de la ligne de la commande
228 | 228 : Qté. de repère par industrialisation Quantité de repère dans une industrialisation
254 | 254 : Qté. lancée ordre de fabrication Quantité lancée en fabrication pour cet ordre de fabrication
174 | 174 : Qté. ligne devis Quantité d'élements de la ligne du devis
41 | 41 : Qualification du contact (TECHNICIEN MAINTENANCE) Qualification de la personne physique ou service de la personne morale
235 | 235 : Qui fournit la matière du repère
295 | 295 : Réactivité par ligne de livraison Nombre de jours d'écart entre la date de la livraison et le délai négocié de la commande au moment de l'édition de la livraison
2088 | 2088 : Ref client ligne Référence client de la ligne de commande client.
2089 | 2089 : Ref client ligne devis Référence client de la ligne de devis.
120 | 120 : Référence client industrialisation Référence secondaire de l'industrialisation
214 | 214 : Référence client ligne de commande Référence client de la ligne de la commande du client
194 | 194 : Référence commande client Référence de la commande du client ou titre de la commande interne
116 | 116 : Référence complete industrialisation (F-XXX-01 Indice A) Concaténation de la référence de l'industrialisation et de sa version. Cette donnée doit être unique.
971 | 971 : Référence de la ligne de la commande Référence ou titre de la ligne de la commande client. Elle est renseignée si ce n'est ni une industrialisation, ni un repère, ni un article fournisseur
969 | 969 : Référence de la ligne du devis Référence ou titre de la ligne du devis. Elle est renseignée si ce n'est ni une industrialisation, ni un repère, ni un article fournisseur
162 | 162 : Référence devis Désignation du devis ou titre du devis
122 | 122 : Référence industrialisation (F-XXX-01) Référence de l'industrialisation
12 | 12 : Régime des commerces de l'entreprise Régime des commerces à laquelle le professionnel est rattaché
25 | 25 : Relevé de mesures par défaut (Fiche-d-autocontrole.php)
229 | 229 : Repère Désignation du repère
237 | 237 : Repère avec gamme témoin Désignation de la gamme type si ce repère sert de gamme type.
215 | 215 : Réponse à la revue des exigences par ligne de commande Commentaire à adresser au client pour cette ligne de commande
161 | 161 : Réponse souhaitée par le client devis Date de réponse souhaitée par le client. C'est le délai que nous avons pour lui remettre le devis.
841 | 841 : Salarie creation commande
839 | 839 : Salarie creation devis
842 | 842 : Salarie modification commande
840 | 840 : Salarie modification devis
140 | 140 : Stock de sécurité industrialisation (0) Valeur en quantité d'industrialisation du seuil d'alerte quand le stock de sécurité est atteint.
139 | 139 : Taille de lot industrialisation (1) Quantité incrémentale pour la vente des industrialisations (utile pour les devis et les commandes)
175 | 175 : Tarif total HT avant remise ligne devis Tarif total hors taxe avant remise de toute la ligne du devis
743 | 743 : Tarif total HT ligne commande (816) Tarif total hors taxe après remise de la ligne de commande client
999 | 999 : Tarif total HT ligne commande (816)
176 | 176 : Tarif total HT ligne devis Tarif total hors taxe après remise de toute la ligne du devis
239 | 239 : Tarif unitaire de vente repère Tarif unitaire de vente hors taxe du repère
204 | 204 : Tarif unitaire HT ligne de commande (204)
290 | 290 : Tarif unitaire HT livré
196 | 196 : Taux de change commande (1) Taux de change de la commande. Cette donnée sert à convertir la devise de la commande en la devise interne du logiciel.
165 | 165 : Taux de change devis (1) Taux de change du devis. Cette donnée sert à convertir la devise du devis en la devise interne du logiciel.
285 | 285 : Taux de change facture (1) Taux de change de la facture. Cette donnée sert à convertir la devise de la facture en la devise interne du logiciel.
271 | 271 : Taux de change livraison (1) Taux de change de la livraison. Cette donnée sert à convertir la devise de la livraison en la devise interne du logiciel.
216 | 216 : Taux horaire objectif ligne de commande (94.663) Taux horaire objectif de la ligne de commande. La formule est la somme des coûts de fabrication (taux RH * temps pointé + taux Machine * temps pointé + Achat) divisé par la somme des temps (temps pointé).
213 | 213 : Taux horaire réel ligne de commande (119.648) Taux horaire réel de la ligne de commande. La formule est la différence entre la vente (valeur HT de la ligne de commande) et les achats (valeur HT des affectations des lignes de commandes fournisseurs), le tout divisé par la somme des temps (temps pointé).
151 | 151 : Taux taxe (20) Taux de la taxe. C'est le pourcentage de la taxe que vous collectez ou déduissez.
150 | 150 : Taxe active (Oui) Oui, la taxe est utilisable. Non la taxe est non sélectionnable dans les formulaires.
1091 | 1091 : Total HT Facture (-816) Total hors taxe de la facture
1092 | 1092 : Total TTC Facture (-979.2) Total TTC de la facture
13 | 13 : TVA Intra. Com. Entreprise (FR4586321) Numéro de TVA intracommunautaire du professionnel
144 | 144 : Type d'approvisionnement industrialisation Type de gestion de stock : FIFO, FEFO, LIFO
230 | 230 : Type de matière pour le repère
121 | 121 : Type industrialisation (OUTILLAGE) Type de l'industrialisation (premier niveau d'une catégorisation à 3 niveaux).
137 | 137 : Unité industrialisation (U : Unité) Unité de vente de l'industrialisation
244 | 244 : Ville adresse livraison spécifique Ville de l'adresse secondaire
5 | 5 : Ville de facturation de l'entreprise (ORMES) Ville de l'adresse de facturation du professionnel ou du particulier
10 | 10 : Ville de livraison de l'entreprise (ORMES) Ville de l'adresse principale de livraison du professionnel ou du particulier
46 | 46 : Ville du contact Ville de l'adresse du contact
143 | 143 : Zone de stockage par défaut industrialisation Zone de stockage par défaut quand une mise en stock est déclarée pour cette industrialisation.
### liste_finale_foxyz_champ (9)
263 | 1 263 : N° BL Identifiant de la livraison
187 | 2 187 : N° Commande (35) Identifiant de la commande client
250 | 3 250 : N° OF Identifiant de l'ordre de fabrication
277 | 4 277 : Echéance paiement facture (2026-09-04) Échéance de règlement de la facture. C'est la date à laquelle le client doit payer au plus tard.
273 | 5 273 : N° Facture (28) Identifiant de la facture
2 | 6 2 : Entreprise / Raison sociale (L'OREAL GEMEY PARIS - MAYBELLINE NEW YORK) Nom de l'entreprise pour les professionnels ou si c'est un particulier, nom du foyer
289 | 7 289 : Qté. livrée Quantité livrée pour ce certificat de conformité
292 | 8 292 : Tarif total HT ligne livraison Total hors taxe après la remise du certificat de conformité
185 | 9 185 : Symbole devise (€) Symbole de la devis
```

</details>
