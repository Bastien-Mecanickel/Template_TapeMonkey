# Projet — Automatisations Foxyz (MECANICKEL)

Userscripts Tampermonkey construits par-dessus l'ERP Foxyz. Pas d'accès
serveur, navigateur uniquement. Bastien Barbier, chargé d'affaires, maintient
seul ce code : il doit pouvoir le relire et le modifier sans aide.

Dernière mise à jour : extraction v0.8, import Excel v2.0 (27/10/2026).
Extraction, import, feuille de présence et feuille des primes sont livrés et
en service chez Thérèse depuis octobre 2026. La v2.0 répond à ses premières
demandes (voir « Version 2.0 » plus bas).

**Le classeur de référence est celui de Thérèse**, sur le réseau :
`Z:\DIRECTION\RH\FEUILLES D HEURES PRIMES\FEUILLES DE PRESENCE 2026\POINTAGES FOXYZ\TABLEAU DE POINTAGE MODELE.xlsm`.
`Pointages_MODELE.xlsm` du dossier de dev est reconstruit par le banc et ne
porte pas ses données. Ne jamais écrire sur Z: : travailler sur une copie.

---

## Règles de travail — à respecter sans exception

**Lecture seule sur l'ERP par défaut.** Injection et exécution de JavaScript
autorisées. Aucun clic sur un élément Foxyz, aucune soumission de formulaire,
aucune modification de champ, sauf autorisation explicite et ponctuelle de
Bastien, formulée dans le chat.

**Ne jamais deviner un sélecteur, un ID ou un mécanisme Foxyz.** Toujours
inspecter le DOM réel d'abord. La phase diagnostic précède la phase code, y
compris pour une page déjà connue.

**Chercher les fonctionnalités natives avant d'écrire du code.** Scanner les
attributs `[onclick]` du DOM : Foxyz contient souvent déjà ce qu'on s'apprête
à réimplémenter.

**Livrer des fichiers complets, jamais des correctifs partiels.** Les collages
partiels ont déjà supprimé silencieusement des fonctions adjacentes à deux
reprises.

**Tester avant de livrer.** Vérification syntaxique Node, plus le banc de test
jsdom pour l'outil pointages.

**Pas d'usine à gaz.** Chaque décision d'architecture s'évalue à l'aune de la
maintenabilité par une seule personne.

### Format des réponses dans le terminal

Ne jamais utiliser de tableaux en caractères semi-graphiques (`┌─┬─┐`) : ils se
corrompent à l'affichage et l'information est perdue. Utiliser des listes
simples, une ligne par entrée, séparateur ` | `.

---

## TEMP ou PROD

Deux instances, **code identique** (TEMP reçoit les mises à jour Foxyz comme la
production), **données distinctes**.

- `https://temp-mecanickel.gpao-foxyz.fr/ERP/` — bac à sable
- `https://mecanickel.gpao-foxyz.fr/ERP/` — production

Règle : TEMP dès qu'on écrit. PROD uniquement quand la donnée réelle n'existe
que là, ou pour le déploiement. L'outil pointages travaille sur PROD, en
lecture seule, parce que les données RH n'existent pas sur TEMP.

Conséquence : les identifiants relevés ci-dessous valent pour PROD uniquement.
TEMP a sa propre numérotation.

---

## Mécanique Foxyz

jQuery 3.7.1 chargé partout (`window.$`).

`ouvrir_popup_total('../Formulaires/XXX.php')` charge n'importe quel formulaire
dans `#cadre_total_formulaire` via AJAX. Pattern universel : tout le menu de
l'ERP fonctionne ainsi.

Autres fonctions natives : `actualiser_cadre()`, `ajouter_ligne_commande()`,
`file()` / `file_post()`.

### Pièges

**Les champs texte ont `type="search"`, pas `type="text"`.** Ne jamais cibler
`input[type=text]`, ça ne matche rien. Cibler par `#id` exact ou par
placeholder. Exception relevée : les filtres de date de la page pointages sont
bien en `type="text"`.

**Les ID sont trompeurs.** Un champ affiché « Titre » peut avoir l'ID
`description_projet`.

**Remplir un champ** demande les trois déclencheurs :

```js
$('#id').val(v).trigger('input').trigger('change').trigger('blur');
```

**Bouton de sauvegarde** : `#cadre_total_formulaire .bouton_enregistrer:visible`

**Onglets** : divs `.sous_menu` avec `onclick="ouvrir_popup_total(...)"`. Clic
programmatique par `element.click()` direct, pas par `$.trigger('dblclick')`.

**Firefox** : `@grant none` obligatoire, pas d'`unsafeWindow`. Pas de `\n` ni
`\t` littéraux dans les chaînes, utiliser `String.fromCharCode(10)` et `(9)`.
`window.confirm()` peut être désactivé silencieusement après usage répété :
préférer un bandeau UI inline.

### Sécurité

Les identifiants de connexion (`login_web_foxyz`, `mdp_web_foxyz`) sont en clair
dans des `<input type="hidden">` du DOM. Signalé à l'éditeur.

---

## Outil pointages — état v0.8, extraction verrouillée

Fichier : `foxyz-pointages.user.js` (sans numéro de version dans le nom :
c'est la condition pour que `@updateURL` fonctionne)
Page : « Activité du personnel », PROD
But : extraire le tableau vers un JSON vérifié, lu ensuite par une macro Excel.

### Structure du tableau

Pas d'iframe. Le tableau est le deuxième `<table>` de `#tableau_central`, sans
id ni classe. Il est localisé par son contenu : `thead` dont la ligne 0 commence
par « Date » et la ligne 1 par « Pres. ».

- Ligne 0 (`thead`) : noms des salariés, un `<th colspan=5>` chacun. La cellule
  « Date » a `rowspan=2`. Le dernier bloc est la colonne de totaux.
- Ligne 1 (`thead`) : sous-en-têtes `Pres. | Sup. | Abs. | Aff. | Prod.`,
  110 cellules, pas de cellule Date (absorbée par le rowspan).
- Ligne 2 (`thead`) : totaux Foxyz, 111 cellules, la première vide.
- Lignes suivantes (`tbody`) : une par date, 111 cellules, première au format
  `JJ/MM/AA`.

Distinction lignes de données / en-tête : `row.parentElement.tagName === 'TBODY'`.

L'identifiant salarié est dans l'attribut `onclick` du `<th>` :
`ouvrir_popup_total('../Formulaires/employe.php?id_employe=18')`.
Aucun `data-*`, aucun lien, aucun id sur la cellule.

Filtres de période : `#debut_creation_search` et `#fin_creation_search`, format
`JJ-MM-AAAA`, `type="text"`. Les modifier recharge
`_liste_presence_membre.php` — c'est une lecture, rien n'est écrit.

Pas de pagination : toute la période est dans le DOM au chargement.

### Sémantique des cellules

Une cellule **vide** et une cellule **`0.00`** n'ont pas le même sens. Vide =
aucune saisie ce jour-là (`null`). `0.00` = journée enregistrée à zéro (`0`).
Cette distinction ne doit jamais être écrasée.

Toute cellule non vide qui n'est pas un nombre est refusée et lève une anomalie
bloquante. `parseFloat("9,46")` renverrait `9` en silence : corruption
invisible sur une paie.

**Foxyz écrit un espace comme séparateur de milliers au-delà de 1 000** :
`1 787.98`, `2 006.95`. Les deux écritures sont donc acceptées, `9.46` comme
`2 006.95`, et l'espace est retiré avant conversion. La virgule décimale reste
refusée. Attention : ce format n'apparaît que sur les gros totaux, donc un test
sur une seule semaine ne le révèle pas. Toujours valider sur une période
complète.

### Navigation sur la page

Recharger la page déclenche une alerte « quitter la page ? » de Foxyz, qu'on
peut valider sans risque. Après rechargement, Foxyz revient sur son accueil.
Pour retrouver le tableau, cliquer le menu « Synthèse des ouvertures » de
l'onglet RH : son `onclick` ne fait qu'un GET sur
`_liste_presence_membre.php`. **Ce clic-là est autorisé**, c'est le seul moyen
de revenir au tableau, et il n'écrit rien.

### Comportements Foxyz à connaître

**Foxyz masque les salariés sans aucune donnée sur la période demandée.** Le
nombre de colonnes varie donc d'un export à l'autre. Un salarié absent tout le
mois peut ne pas figurer du tout. Le script ne peut pas le détecter : le
contrôle se fera côté Excel, en comparant à la liste de référence.

**Un pointage resté ouvert continue de compter.** Il apparaît comme une valeur
énorme (200 h sur une journée) qui grossit d'heure en heure. Détecté au-delà de
16 h/jour, en avertissement : c'est Foxyz qu'il faut corriger, pas le script.

### Identifiants salariés (PROD)

**22 salariés.** Sur un mois donné seuls 21 apparaissent : Amaury CLERMIDY
(id 10) a quitté la société, il est à 0 h. Il ne ressort que sur un export
long.

Deux enseignements. Un identifiant survit au départ du salarié, ce qui en fait
une clé sûre. Et un salarié à 0 h peut malgré tout apparaître, ce qui contredit
la règle « Foxyz masque les salariés sans données » : on ne sait pas exactement
ce qui déclenche l'affichage. Ne jamais supposer qu'un salarié absent tout le
mois sera forcément présent, ni forcément absent. Le contrôle se fait côté
Excel, en comparant à la liste de référence.

```
1  David BAETENS       12 Sullivan NEVEU
2  FOXYZ FOXYZ         13 Maëlle SAMUZEAU
3  Bastien BARBIER     14 Gabriel CORMIER
4  Anthony BAILLY      15 Aurélien GRIVOIS
5  Julie SAWEZUK       16 Rémi BORET
6  Geoffrey MOREAU     17 Gaëlle LACHENAUD
7  Flavien MOREAU      18 Adrien BOURGEAU
8  Maxime ADAM         19 Alexia TRAPE
9  Dan Bi MOREAU       20 Elodie SAWEZUK
10 Amaury CLERMIDY     21 Kévin LEBOURG
11 Julien BEIGNET      22 Maya BAETENS
```

Non suivis pour la paie : Anthony BAILLY, Bastien BARBIER et David BAETENS
(cadres au forfait, leurs pointages n'ont pas à remonter), plus FOXYZ FOXYZ
(compte système). Le filtrage se fait **côté Excel**, jamais dans le script :
« qui est au forfait » est une règle RH, elle doit rester modifiable par
Thérèse. Le JSON exporte tout le monde.

Maya BAETENS : premier pointage le 15/09/2026. Cas type « arrivée en cours de
période », produit un écart négatif faux si le calcul n'en tient pas compte.

### Historique du pointage

Septembre 2026 est le **premier mois plein pointé par tous les salariés**. Les
mois précédents sont des essais et ne veulent rien dire : 0 h en janvier, 2 h
en février, premiers pointages échelonnés de février à août. Ne jamais tirer de
conclusion métier d'un export antérieur à septembre 2026.

### Interface

Aucun bouton flottant. Le panneau est créé caché au chargement et s'ouvre
depuis le menu du hub (`id: 'pointages'`, icône `RH`), se ferme par sa propre
croix. Contrairement à Push commande, la visibilité n'est pas mémorisée en
`localStorage` : réafficher des résultats calculés sur une autre page serait
trompeur.

### Sémantique métier des colonnes (validée avec Bastien)

`sup`, `aff` et `prod` sont à zéro pour tout le monde : inutilisées chez
MECANICKEL. On les exporte, le calcul les ignore.

`pres` : heures décimales. Une valeur `0` le jour même signifie « pointé, pas
encore sorti ». Ne jamais extraire une journée en cours.

`abs` : vaut toujours `1`, jamais 0,5 — **Foxyz ne sait pas faire de
demi-congé**. Compte en **jours calendaires**, week-ends compris quand une
absence est à cheval sur deux semaines. Il faut donc filtrer samedi et dimanche
au calcul, sauf pour les salariés dont le contrat inclut le samedi. La colonne
ne dit jamais de quel type d'absence il s'agit : Thérèse qualifie, `abs` sert à
préremplir les jours.

**Demi-journée d'absence** : `abs = 1` ET `pres > 0` le même jour. C'est la
seule façon de la détecter. Exemples du 14/09/2026 : Adrien BOURGEAU 4,16 h,
Aurélien GRIVOIS 2 h.

**Week-ends** : aucun pointage de week-end n'est ignoré, quelle que soit sa
durée. Les opérateurs interviennent parfois 5 ou 10 minutes pour réenclencher
un bouton. Thérèse fait le tri si besoin.

### Cas particuliers par salarié

- FOXYZ FOXYZ (id 2) : compte de test de l'éditeur, impossible à désactiver.
  Jamais un salarié. Exclu **côté Excel**, pas en dur dans le script : une
  seule règle, un seul endroit.
- David BAETENS (id 1) : gérant, n'aura jamais de pointage.
- Bastien BARBIER (id 3) et Anthony BAILLY (id 4) : cadres au forfait. Se
  connecter à Foxyz déclenche un pointage, d'où leurs heures parasites. Non
  comptabilisées.
- Gabriel CORMIER (id 14) : apprenti parti fin août, ressource passée en
  indisponible, et pourtant toujours affiché. Amaury CLERMIDY, également
  parti, est lui masqué. **On ne sait pas ce qui déclenche l'affichage d'un
  salarié.** Ne rien supposer : comparer à la liste de référence côté Excel.

### Semaines types — piste non exploitée

Foxyz gère des « types de semaine » (menu *Type de semaines*, 4 définis :
39 HEURES, 35 HEURES, ROBOTS, 12 HEURES). Chaque fiche salarié porte son type.
Le formulaire donne, jour par jour, le volume horaire et jusqu'à 4 plages
entrée/sortie — donc aussi l'information « travaille le week-end ou non ».

Décision de Bastien : **on n'y touche pas**. Aller lire la fiche de chaque
salarié pour une information que Thérèse connaît déjà ne se rentabilise pas.
Noté pour le jour où ce serait nécessaire.

### Anomalies et statuts

`ERREUR` s'il existe au moins un bloquant : le script a mal lu, le fichier est
inutilisable. `A_VERIFIER` s'il n'y a que des avertissements : la lecture est
bonne, c'est Foxyz qu'il faut corriger. `OK` sinon.

Bloquants : `valeur_illisible`, `salarie_ignore`, `total_absent`,
`total_divergent`, `structure_ligne`, `date_illisible`, `nb_jours_divergent`.

Avertissements : `valeur_aberrante`, `periode_non_close`,
`colonne_finale_inconnue`, `colonne_finale_non_verifiee`.

Contrôle par salarié : `OK`, `DIVERGENT`, ou `NON_VERIFIE` quand le total Foxyz
est absent ou illisible. Jamais de `OK` quand rien n'a pu être comparé.

### Reconnaissance de la colonne de totaux

Ni par son libellé (Foxyz peut la renommer), ni par sa position (un salarié
pourrait s'y trouver), mais par son contenu : son total « Pres. » vaut la somme
des totaux de tous les salariés identifiés. Si l'addition tombe juste, c'est
elle. Sinon, c'est un salarié, et on bloque.

### Limites connues, assumées

Si un total de salarié est illisible **et** qu'un salarié n'a pas
d'`id_employe`, la disparition du salarié n'est signalée qu'en avertissement.
Le `total_absent` produit de toute façon un bloquant, donc le fichier est
écarté. Une règle supplémentaire ne changerait rien pour l'utilisateur et
ajouterait du code à maintenir : non corrigé volontairement.

`meta.exporte_le` est en UTC, donc décalé de deux heures en été. À traiter
côté Excel.

Chrome suffixe le nom du fichier en `(1)`, `(2)` quand il existe déjà. La macro
ne doit pas chercher un nom exact : boîte de dialogue, ou fichier le plus
récent commençant par `pointages_`.

### Pièges corrigés, à ne pas réintroduire

`toISOString()` convertit en UTC et recule d'un jour en France. Utiliser
`isoLocal()` pour toute date destinée à l'affichage ou à la comparaison.

Le contrôle des totaux ne détecte pas un changement global de format : si toutes
les valeurs et leur total passaient en virgule décimale, la somme des valeurs
tronquées correspondrait au total tronqué. Seule la lecture stricte l'attrape.

---

## Relecture du 25/09/2026 — ce qui reste à nettoyer

Faite sur les 3 609 lignes du module, après huit versions enchaînées sans
recul. Rien de tout cela n'est corrigé : **à traiter après le déploiement**,
toucher 3 600 lignes la veille d'une mise en service serait plus risqué que
d'attendre.

**Code mort** : `C_VERT`, `rap.NbAcomptes` (incrémenté jamais lu), la garde
« contrat vide » devenue inatteignable, le rattachement des codes par nom (ne
sert plus qu'au gabarit d'origine, mais le banc en dépend), et deux structures
pour la même information dans `LireCodes`.

**Écrit à plusieurs endroits, et qui divergera un jour** : la règle du 200 %
existe à **5 endroits** et rien ne vérifie qu'ils concordent — or cette règle
attend encore la validation de Thérèse. « Tiret exclu » et « demi-journée =
0,5 » à 4 endroits. Le triptyque mémoriser / replacer / signaler est
implémenté 4 fois. La géométrie d'un bloc du Résumé est encodée dans
7 procédures. Des libellés servent de marqueurs (« AU FORFAIT », « Période : »,
la puce ▶).

**Fragile** : modifier « Éligible prime » après l'import (corrigé en v1.9),
le bloc du patron mémorisé par position relative, la dépendance à un Excel
français (formules conditionnelles via `FormulaLocal`, noms de mois via
`Format "mmmm"`), une ligne vide au milieu de `Salariés` qui fait ignorer tous
les suivants.

**Jamais exécuté** : les parcours interactifs. Le banc appelle les versions
sans boîte de dialogue ; les boutons, la boîte d'enregistrement, la
confirmation de remplacement et le refus « classeur déjà ouvert » n'ont jamais
tourné. **Le premier clic de Thérèse sera leur première exécution.** À tester
à la main avant elle.

**Après un tri du Récap**, la feuille de présence refuse au lieu de suivre :
elle compare encore par position, avec vérification du nom. Elle ne peut pas
produire de chiffres faux, mais elle oblige à relancer l'import.

## Banc de test

Deux bancs. Côté Excel, `excel/tests/tests_import.ps1` : 214 contrôles,
environ 330 s. Il commence par **comparer les deux copies du module**
(`ImportPointages.utf8.bas`, celui qu'on édite, et `ImportPointages.bas` en
cp1252 qu'Excel importe) et s'arrête net si elles diffèrent — une conversion
oubliée a déjà tronqué le `.bas` en silence. Les extractions de référence sont
figées dans `excel/tests/fixtures/`, jamais les Téléchargements.

Le banc Excel garde aussi `excel/tests/fixtures/classeur_v1.9.xlsm` : un
classeur v1.9 rempli (import du 24/08, CP d'Adrien le 07/09, acompte de 300
pour Sullivan), qui sert à tester `excel/mettre_a_jour.ps1`. Le test
d'équivalence avec la v1.4 compare le Résumé colonne par colonne avec une
table de correspondance, puisque la v2.0 a déplacé les colonnes 200 %.

Côté extraction, `node tests/run.js` — jsdom, fixture figée
`tests/fixture-septembre.html` (septembre 2026, 21 salariés, 30 jours).
Il charge `foxyz-pointages.user.js`, le fichier en service (jusqu'au
27/10/2026 il testait par erreur la copie v0.7). 88 assertions.

Le harnais charge le `.user.js` directement, retire l'en-tête UserScript et
l'évalue dans jsdom avec `runScripts: 'outside-only'`. Le script expose
`module.exports` en fin de fichier et `extraire(doc)` accepte un document en
paramètre. **Un seul fichier source, aucune copie de la logique** : une copie
validerait l'ancienne version sans prévenir le jour où le script évolue.

À l'ERP, `window.fzPointages()` renvoie l'objet complet sans passer par l'UI.

---

## Chantiers ouverts

Extraction : **verrouillée**, ne plus y toucher sans raison forte. Intégrée au
hub. Reste à pousser sur GitHub sous le nom `foxyz-pointages.user.js` pour que
`@updateURL` fonctionne.

Import Excel : module `ImportPointages` v2.0, modèle `Pointages_MODELE.xlsm`
reconstruit par le banc, mode d'emploi écrit (à compléter pour la v2.0).
Banc Excel 214 contrôles (environ 330 s), banc jsdom 88.

Export comptable : les trois étapes sont faites.

Questions métier non tranchées : report ou solde mensuel des heures
supplémentaires, traitement des arrivées et départs en cours de période, cumul
d'un CP et d'un pointage le même jour, jours ouvrés sans code ni pointage.

Autres outils : duplication de commande fournisseur via `commande_rapide.php`,
consultation fournisseur vers commande fournisseur (champ numéro de consultation
sur la forme `id_cf` après auto-save), auto-update Tampermonkey via GitHub
(`@updateURL` / `@downloadURL`), deux correctifs en suspens sur Push commande.

---

## Volet Excel — module ImportPointages

Le classeur n'est pas une archive mais un **gabarit** : Thérèse en fait une
copie chaque mois, on la remplit, elle travaille dedans, elle l'archive. Les
feuilles peuvent donc être régénérées à chaque import.

Format **`.xlsm`** obligatoire (un `.xlsx` ne peut pas contenir de macros).
Dépendances : `JsonConverter.bas` (bibliothèque VBA-JSON de Tim Hall, VBA ne
sait pas lire le JSON nativement) et la référence *Microsoft Scripting
Runtime*. Développement piloté par COM depuis PowerShell, avec l'option
« Accès approuvé au modèle d'objet du projet VBA » active — le vrai garde-fou
reste « Désactiver les macros VBA avec notification ».

### Feuilles

`Salariés` — **référentiel durable, jamais régénéré**. Le contrat et les
heures par jour sont des données RH que Thérèse maintient et que le JSON ne
connaît pas. A nom | B contrat | C à I heures prévues par jour (en nombres,
plus de « x ») | J ID Foxyz. Ne jamais insérer de colonne avant B :
`Récap période` référence `Salariés!$B$5`.

Contrôle automatique à l'import : la somme de C à I doit égaler B. C'est ce
contrôle qui aurait attrapé l'erreur de Maya BAETENS, au contrat 35 h avec un
prévu de 39 h — seize heures d'écart faussé sur quatre semaines.

`Résumé` — **régénérée à chaque import**. Un bloc par salarié, une ligne par
jour. A date | B jour | C code (saisie de Thérèse) | D heures travaillées |
E prévu | F créditées | G écart | H écart en h:min (chaque jour et chaque
total, depuis la v2.0) | I samedi 200 % | J dimanche 200 % | K travaillées en
h:min sur les lignes de total, marque « hors période » / « hors contrat » sur
les jours. L'ID Foxyz est écrit en K/L de la ligne contrat, pour retrouver les
codes d'un import à l'autre. Les h:min s'écrivent `1:30` (texte calculé).

Les codes de la colonne C sont **mémorisés puis réappliqués** par
id_employe + date. Un code dont la date disparaît est signalé, jamais perdu en
silence.

`Récap période` — régénérée, une ligne par salarié. Après les absences :
`Heures sup payées` (heures sup + 200 % − récup, formule modifiable, orange
si remplacée), `Heures sup en récup` (saisie, jaune), `Acompte` (saisie,
jaune), puis l'ID Foxyz masqué. Ces colonnes sont **retrouvées par leur
titre**, jamais par position : c'est ce qui permet de relire un Récap v1.9.
`Journal import` — rapport complet (une MsgBox plafonne vers 1 000 caractères).

### Règles de calcul du classeur de pointages

Codes d'origine : `CP`, `DEMICP`, `RTT`, `MALADIE`, `DEMIMAL`, `ENFMAL`,
`FERIE`, `CSS`. Les formules F et G sont construites depuis la feuille `Codes`
à chaque import, et comparées en permanence à la référence en dur des 8 codes
d'origine : si elles diffèrent, le rapport le signale.

200 % le week-end : `=IF($E=0, heures travaillées, 0)`. Un samedi prévu au
contrat (Maëlle) n'est donc pas majoré. **À faire valider par Thérèse.**

Prévu de la ligne de total : doit être `=SUM(E7:E13)` et non
`=Salariés!$B$x`. Identique sur une semaine complète (8+8+8+8+7 = 39), correct
sur une semaine partielle — sinon l'écart est faussement négatif.

### Points d'attention

La macro prend le `pointages_*.json` le plus récent des Téléchargements. Le
message de confirmation doit afficher **la période et le nombre de salariés**,
sinon un mauvais mois peut être importé sans que personne le voie.

Les quatre comptes non suivis (forfait et système) ressortent à chaque import
dans « absents de Salariés ». C'est attendu.

## Export comptable — conception validée avec Thérèse

Objectif : produire le classeur envoyé à la comptable pour les fiches de paie,
aujourd'hui rempli entièrement à la main. Un bouton sur le Récap génère un
**nouveau fichier** daté du mois, sans jamais écraser le modèle. Thérèse relit,
corrige, envoie.

Principe directeur : **le Résumé calcule, le Récap affiche, l'export reprend.**
Si un chiffre est faux, on corrige la cause — un code manquant, une heure à
reprendre dans Foxyz — jamais le résultat.

### Deux fichiers, pas un classeur

La comptable reçoit **deux fichiers séparés** : la feuille de présence et la
feuille des primes. La feuille ROBOT n'est envoyée à personne : c'est un
calcul interne, devenu une feuille du classeur de pointages, à côté du Récap.
Cette séparation supprime le risque d'envoyer le calcul interne par mégarde.

Refonte : la feuille de présence est **entièrement repensée**. La feuille des
primes reste **fidèle à sa forme actuelle**, le patron la remplit en partie et
ne doit pas être dérouté.

Bascule : le premier mois — idéalement les deux premiers, pour couvrir un mois
avec férié et un mois sans — les **deux versions** partent chez la comptable,
l'ancienne et la nouvelle. La comparaison se fait sur les totaux du
récapitulatif. Si les deux concordent deux mois de suite, l'ancienne peut
disparaître.

### Le classeur comptable, trois feuilles

`HEURES` — **l'ancien format, abandonné.** C'était une grille semaine par
semaine en texte libre (« 4CP DU 02 AU 05/03 »), plus un bloc d'heures sup,
d'acomptes et de 200 %. Remplacée par la feuille de présence décrite plus bas.
Décrite ici pour mémoire, le temps de la bascule.

`ROBOT` **fait**, devenue une feuille du classeur de pointages, après le Récap.
Régénérée à chaque import, entièrement calculée : une intervention est un jour
dont le prévu est à zéro avec des heures pointées. Toutes ses cases restent
modifiables ; une valeur saisie à la main passe en orange et survit aux
imports suivants.

`tableau heures primes` — **faite en v1.9**, second fichier envoyé à la
comptable.

Le patron saisit le **chiffre d'affaires** en G17, et `F17 = G17*(0,75/100)`
donne l'enveloppe, divisée par le total des heures pour obtenir un taux
horaire. Ce n'est pas lui qui entre le montant : la spécification était
fausse sur ce point, le classeur réel a tranché.

Colonnes : cumul (vestige toujours vide, **gardé** — une colonne en moins se
remarque plus qu'une colonne vide), nom, heures sup, heures d'absence, temps
de présence, total, montant, prime exceptionnelle.

Heures sup = « Heures sup payées » du Récap (heures sup **plus** heures à
200 %, **moins** la récup depuis la v2.0), lues par **ID Foxyz**, jamais par
position. Un tri du Récap, geste banal dans Excel, donnerait sinon à chacun
les heures d'un autre en silence. La prime exceptionnelle n'est plus
pré-remplie depuis ROBOT (v2.0) : saisie libre.

Deux contrôles avant de générer : chaque ligne du Récap porte encore le nom de
son ID, et la liste correspond toujours à la colonne « Éligible prime ». Sinon
rien n'est créé et le message dit de relancer l'import.

Heures d'absence : calculées sur le Résumé, puisque le Récap est passé en
jours. Depuis la v2.0, seuls les codes à Oui dans la colonne `Réduit la
prime` de la feuille `Codes` réduisent la base (CP, maladie, congé sans
solde à l'installation). La règle « toute absence » du 25/09 est abandonnée. L'en-tête a donc été corrigé en « HEURES
D'ABSENCE », le seul changement autorisé dans la feuille du patron.

Ne figurent que les « Éligible prime = Oui ». Maëlle SAMUZEAU touche ses
heures sup mais pas la prime : elle n'y est pas. Les cadres au forfait non
plus. Une liste en dur `ELIGIBLES_PATRON`, relevée dans le classeur réel,
sert de contre-épreuve **pendant la bascule seulement** : à supprimer après.

**Le bloc du bas, avec les paliers Directeur et chargé d'affaires, appartient
au patron. Ne rien y changer.** Ses couleurs de thème ont dû être figées en
valeurs exactes : copiées dans un autre classeur, « TOTAL PRIME » changeait
de teinte.

Nom : `PRIME MM AAAA sur salaire MOIS`. Depuis la v2.0, la feuille est créée
depuis le classeur du mois de la prime : `MM AAAA` est le mois du classeur,
`MOIS` le mois suivant (celui de la paie).

### La feuille de présence refondue

Le format actuel — une grille semaine par semaine avec du texte libre dans les
cases — est abandonné. Une absence à cheval sur deux semaines y apparaît deux
fois, rien ne se trie, rien ne se totalise, et le nombre de jours se compte de
tête.

Deux zones à la place :

Un **récapitulatif** en haut, réduit au strict nécessaire : nom, CP, RTT,
maladie, heures sup, 200 %, dans l'ordre d'une fiche de paie, avec un total
par colonne. C'est lui qui permettra la comparaison ligne à ligne avec
l'ancien classeur pendant la bascule.

Un **tableau détaillé** en dessous : salarié, type, du, au, jours, remarque.
Il se trie, se filtre et se totalise. La colonne remarque porte ce que le
texte libre ne pouvait pas dire : les heures pointées le jour d'une
demi-journée, les week-ends compris dans un arrêt.

**Fait en v1.7.** Bouton « Créer la feuille de présence » en haut du Récap.
Produit un nouveau classeur d'une seule feuille, sans macro ; le classeur de
pointages n'est jamais modifié. Enregistrement par boîte de dialogue, nom
proposé `FEUILLE DE PRESENCE MM AAAA` — le mois qui contient le plus de jours
de la période, le plus tardif à égalité. Le fichier reste ouvert pour
relecture.

Avant de rien créer, le détail est **recompté et comparé au Récap**, salarié
par salarié et type par type. Un écart veut dire que la feuille `Codes` a
changé depuis l'import : rien n'est créé, il faut relancer l'import.

**Le groupement par « Texte pour la comptable » est la règle unique**, lue
dans la feuille `Codes` et appliquée à la fois au Récap et à la feuille de
présence. Les colonnes d'absence du Récap sont désormais une par texte
comptable, en jours ouvrés : RTT et enfant malade y figurent enfin, et la
colonne Fériés disparaît puisque son texte est un tiret.

Un code à tiret au milieu d'une période ne la coupe pas : il est noté en
remarque et non compté. Exemple réel : le CP de Rémi BORET du 31/08 au 04/09,
avec « FERIE le 02/09, non compté ».

**Acomptes** (avances sur salaire) : colonne jaune `Acompte` du **Récap**,
saisie à la main, mémorisée par ID d'un import à l'autre, reprise dans la
feuille de présence avec un total. Elle ne pouvait pas vivre dans la feuille
de présence, régénérée à chaque fois. Les cadres au forfait n'ayant pas de
ligne au Récap, un acompte pour eux s'ajoute à la main dans le fichier créé,
sans être mémorisé : cas assumé, jugé trop rare pour justifier un mécanisme.

Le récapitulatif ne liste que les salariés ayant **au moins une absence, des
heures sup, des heures à 200 % ou un acompte**. Un salarié sans rien à signaler n'a rien à
dire à la comptable. Conséquence pendant la bascule : les deux classeurs
n'auront pas le même nombre de lignes, la comparaison se fait sur les totaux.

### Règles de calcul

**Base mensuelle : 169 h** pour tous les contrats. Démontré sur une fiche de
paie : 151,67 h de contrat (35 h) plus 17,33 h majorées à 25 % font 169. Les
4 heures hebdomadaires du passage à 39 h sont donc **déjà payées** dans le
salaire mensuel ; les heures supplémentaires qu'on calcule sont bien celles
au-delà de 39 h, pas au-delà de 35. Réduite au prorata en cas d'arrivée en
cours de mois. Le contrat 12 h (ménage) est hors prime.

**Heures supplémentaires** : solde net de la période, pas la somme des seuls
écarts positifs. Une semaine négative annule une semaine positive. On donne un
**total, sans distinction de taux** : la comptable gère 25 ou 50 % elle-même.

**Absences** : comptées en **jours ouvrés**, en décimal. Une demi-journée vaut
**0,5**. Une **ligne par période continue**, avec date de début, date de fin et
nombre de jours ; une interruption ouvre une nouvelle ligne. C'est exactement
la saisie de la comptable : « Congés payés pris 030826-310826 (21 jours) »,
et deux lignes distinctes pour deux périodes séparées dans le même mois.

**Week-end** : les heures d'un jour dont le prévu est à zéro sont payées à
200 % et **n'entrent jamais dans les heures sup**. La règle n'est pas « samedi
ou dimanche » mais « prévu du jour à zéro » — le samedi de Maëlle est un jour
de contrat, ses heures comptent dans son écart normal et non à 200 %. Vérifié
dans le gabarit : les lignes de week-end sans prévu n'ont pas de formule
d'écart et portent une colonne 200 %, l'inverse pour Maëlle.

**Décalage des mois, voulu** : la prime est calculée sur le chiffre d'affaires
du mois précédent (paie d'avril, CA de mars). Les primes robot, elles, portent
sur le mois en cours, puisqu'il s'agit des déplacements du week-end.

**Période** : variable, fixée par Thérèse dans les filtres Foxyz. En pratique
du 25 du mois précédent au 23 ou 24 du mois en cours, les heures étant arrêtées
avant la fin du mois pour laisser le temps à la comptable.

**Prime** : réservée aux salariés ayant six mois d'ancienneté. Pas de calcul
automatique — une colonne « Éligible prime » dans `Salariés`, basculée à la
main. Maëlle touche ses heures sup mais pas la prime, et **ne figure donc pas**
dans la feuille des primes.

**Les heures robot entrent dans les heures de la prime.** Le total proposé est
heures supplémentaires plus heures à 200 %. Vérifié sur Gaëlle en mars :
17,50 + 3,34 = 20,84, la feuille portait 20,83. C'est une décision de Bastien
(25/09/2026), prise parce que c'est la règle cohérente, pas parce qu'elle était
appliquée partout. La cellule reste **modifiable**, et toute valeur qui
s'écarte du calcul est signalée en couleur : un ajustement devient un choix
visible, jamais une divergence silencieuse.

**Indemnité kilométrique du robot** : nombre d'interventions × kilomètres ×
0,606 €. **Aucun seuil.** La colonne `Kilomètres aller-retour (robot)` de
`Salariés` contient les kilomètres d'un déplacement aller **et** retour,
saisis à la main pour les seuls salariés qui y ont droit. Une case vide est
l'état normal et n'est jamais signalée.

L'ancienne règle n'a pas pu être reconstituée : les classeurs portaient 38 km
pour Julien BEIGNET et 94 pour Amaury CLERMIDY, valeurs figées en dur, et
quatre lectures différentes les expliquaient aussi bien. Les 38 km dataient
d'une adresse précédente — Julien en fait 92 aller-retour. La règle a donc été
**simplifiée plutôt que devinée**.

**Acomptes** (avances sur salaire, à la demande) et **primes exceptionnelles**
(robot, prime Macron, autres) restent saisis à la main. Comme les codes du
Résumé, ils sont mémorisés avant régénération et réécrits après ; ceux qui ne
peuvent être replacés sont signalés, jamais effacés en silence.

### Feuille `Codes`

Les codes ne sont plus écrits en dur dans les formules. Une feuille à quatre
colonnes — code, libellé, compte comme, texte pour la comptable — que Thérèse
remplit. « Compte comme » vaut *Journée entière*, *Demi-journée* ou *Zéro*, et
porte la **règle de calcul**, pas une simple étiquette. Le texte comptable
pilote la génération de « 4 CP DU 02 AU 05/03 » ; un tiret exclut le code de
l'export.

La colonne C du Résumé devient une liste déroulante alimentée par cette
feuille : plus de saisie libre, donc plus de faute de frappe qui compterait
zéro en silence. La feuille est protégée, sans mot de passe ; les 8 codes
d'origine ne peuvent être ni supprimés ni modifiés, on peut en ajouter.

Le module garde en dur la formule attendue pour ces 8 codes et la compare à
chaque import à celle composée depuis la feuille. Identiques, rien n'est dit.
Différentes, le rapport l'annonce : ce n'est pas une erreur, c'est une règle de
calcul qui a changé, et ça doit se voir.

### Colonnes ajoutées à `Salariés`

`Statut` : Suivi, Forfait ou Ignoré — remplace la convention du contrat vide.
Un Forfait apparaît dans le Résumé pour la saisie de ses CP et arrêts, mais ses
heures ne sont ni importées ni comparées. Un Ignoré disparaît (FOXYZ FOXYZ).

`Éligible prime` : Oui / Non.

`Kilomètres aller-retour (robot)` : kilomètres d'un déplacement aller et
retour, saisis à la main pour les seuls salariés qui y ont droit (aujourd'hui
Julien BEIGNET, 92 km). Case vide = aucune indemnité, état normal, jamais
signalé.

`Entré le` et `Sorti le` : dates de contrat, vides par défaut (cas normal).
**Les deux bornes sont comprises** : sorti le 31/08 signifie présent jusqu'au
31 inclus. Un jour hors contrat a un prévu de zéro, exactement comme un jour
hors période : ni écart, ni absence, ni 200 %, ni intervention robot. Il est
grisé et marqué « hors contrat ».

Un bloc n'existe dans le Résumé que si le contrat couvre **au moins un jour**
de la période. Le critère est le contrat, **jamais le nombre d'heures** : un
salarié en arrêt tout le mois doit garder son bloc, c'est là que Thérèse
saisit son code ; un salarié parti n'y a rien à faire.

Sans ces dates, Gabriel CORMIER (parti fin août) ressortait à −140 h
supplémentaires et Maya BAETENS (arrivée le 15 septembre) à −113,80. Avec
elles : −42 et −1,80. Ces chiffres partaient chez la comptable.

### Le décalage des mois, voulu

La prime porte sur le **chiffre d'affaires du mois précédent** : la paie
d'avril utilise le CA de mars. Les primes robot, elles, portent sur le **mois
en cours**, puisqu'il s'agit des déplacements du week-end. D'où le titre des
classeurs, du type « PRESENCE 03 2026 - ROBOT 04 - PRIME 03 ».

En pratique, les heures robot sont déjà reportées dans la colonne 200 % de la
feuille `HEURES` du même fichier : inutile d'aller chercher le mois précédent,
tout est sur la même feuille.

### Ce qui a été élucidé dans les classeurs de février à avril 2026

Deux écarts qui paraissaient suspects sont en réalité normaux. Gaëlle
LACHENAUD à 17,5 h dans `HEURES` et 20,83 dans les primes : la différence est
son heure robot. Maëlle SAMUZEAU absente de la feuille des primes : voulu,
elle n'y a pas droit.

Cinq écarts restent inexpliqués, et **ne seront pas reproduits** : la colonne
des heures de la feuille des primes est ressaisie à la main et diverge de la
feuille `HEURES` environ une fois sur cinq, toujours en faveur du salarié.
Rémi BORET en février (2,50 h de robot non ajoutées), Rémi et Elodie en avril
(aucune heure robot reportée ce mois-là, pour personne), Maxime ADAM en
février et Adrien BOURGEAU en avril (un quart d'heure de plus, comme un arrondi
à la demi-heure appliqué à eux seuls). Le calcul automatique proposera la règle
cohérente ; les ajustements resteront possibles, mais visibles.

Enfin, les noms ne sont jamais fiables d'une feuille à l'autre — « LACHENAUD
GAELLE », « GAELLE LACHENAUD », « LACHENAUD GAËLLE ». Rapprocher par
`id_employe`, jamais par le nom. Omar AMAHDAR et Amaury CLERMIDY y figurent
encore alors qu'ils ont quitté la société ; ils disparaîtront d'eux-mêmes,
l'export ne listant que les salariés présents dans Foxyz sur la période.

## Version 2.0 — demandes de Thérèse (27/10/2026)

Quatre décisions de Bastien, toutes sur la recommandation proposée :

1. **Écart en h:min** juste à droite de l'écart décimal (colonne H du Résumé),
   sur chaque jour et chaque total. Format `1:30` partout (Résumé et Récap).
   Les 200 % passent en I et J. Le texte des interventions ROBOT garde
   `2h23` : ce n'est pas un écart.
2. **Heures sup payées / mises en récup** : Thérèse saisit la récup au Récap,
   les payées sont déduites (heures sup + 200 % − récup) et restent
   modifiables. Les deux colonnes sont reprises dans la feuille de présence
   pour Sandrine. Le tableau REC (compteur de récupération) est hors classeur :
   rien n'y est écrit.
3. **Absences de la prime** : nouvelle colonne E `Réduit la prime` (Oui / Non)
   de la feuille `Codes`, modifiable par Thérèse, obligatoire pour chaque code
   (refus d'import si vide). À l'installation : CP, DEMICP, MALADIE, DEMIMAL,
   CSS à Oui ; RTT, ENFMAL, FERIE à Non. **Remplace la décision du 25/09**
   « toute absence réduit la base ».
4. **Prime sur le mois M, créée depuis le classeur du mois M** et versée sur
   la paie de M+1 : nom `PRIME MM AAAA sur salaire <mois suivant>`. Colonne C
   = heures sup payées du Récap (200 % compris, récup exclue). Colonne H
   (prime exceptionnelle) **en saisie libre, jamais pré-remplie** : elle
   porte sur le robot du mois en cours, et Foxyz ne voit ni les déplacements
   multiples d'une journée ni ceux de semaine.

Mise à jour d'un classeur en service : `excel\mettre_a_jour.ps1 -Classeur
<en service> -Sortie <copie>`. Remplace le module, ajoute la colonne E de
`Codes`, **ne touche pas au Récap** (le réimport y relit les acomptes sous
leur ancien titre — une première version qui réécrivait les en-têtes perdait
les acomptes). Ensuite : relancer l'import dans la copie. Une copie du
classeur de Thérèse au 26/10 a été mise à jour :
`TABLEAU DE POINTAGE MODELE v2.0.xlsm` (dossier de dev), pas encore
réimportée faute de son extraction d'octobre sur ce poste.

Constats faits dans son classeur :
- Elle avait **supprimé de `Salariés`** trois salariés partis. Règle
  confirmée par Bastien : un départ se note dans `Sorti le`, on ne supprime
  pas la ligne. Remis dans la copie v2.0 : Gabriel CORMIER sorti le
  31/08/2026, Maëlle SAMUZEAU sortie le 23/10/2026, Maya BAETENS entrée le
  15/09/2026 et sortie le 30/09/2026. Conséquence : la feuille de présence
  d'octobre qu'elle a produite le 26/10 ne contient ni Maëlle (jusqu'au
  23/10) ni Maya (28 au 30/09).
- Elle a ajouté à la main dans ROBOT une intervention de Gaëlle **un mardi**
  et porté Rémi à 5 interventions au lieu de 2. Une ligne ajoutée à la main
  n'a pas d'ID : elle est perdue à chaque import (signalée au journal).
- Des heures sup **négatives** donnent des heures « payées » négatives.
  Voulu (Bastien, 27/10) : on envoie déjà des heures négatives à Sandrine,
  par exemple en cas de congé sans solde.

## Autres outils en production

`foxyz-hub.user.js` — seul propriétaire de `window.__foxyz_hub__`, pastille SVG
en `bottom:140px / right:20px`.

`foxyz-push-commande-v1.5` — extraction des commandes clients vers un panier
JSON (`fzd_panier_v1`), export `panier_dossiers.json` pour Excel.

`foxyz-creation-articles-v1.5` — création d'articles en masse. Déclenche la
lookup comptable en faisant `eval()` de l'attribut `fonction_a_lancer` du champ
`#famille_article_four`, plutôt que de recalculer quoi que ce soit.
