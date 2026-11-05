# FOXYZ — Outil Export CA / Prime mensuelle

> Fichier de cadrage du projet. **Maintenu par Claude (claude.ai), pas par Claude Code.**
> Claude Code ne modifie jamais ce fichier. Il peut en revanche alimenter `DIAGNOSTIC.md`.

---

## 1. Objectif

Extraire, à la fin de chaque mois, le **chiffre d'affaires facturé par commercial**
(chargé d'affaires) afin que la direction puisse calculer les primes.

Foxyz ne permet pas de sortir cette information nativement : le commercial
n'est pas porté par la facture, mais par la **commande**.

**Utilisateur final : le gérant, niveau informatique 0.**
L'outil doit tenir en un clic. Pas d'usine à gaz.

---

## 2. ⛔ RÈGLES DE SÉCURITÉ — SÉPARATION TEMP / PROD

Deux environnements, deux régimes. **La frontière est l'URL.**

| | TEMP | PROD |
|---|---|---|
| URL | `temp-mecanickel.gpao-foxyz.fr` | `mecanickel.gpao-foxyz.fr` |
| Rôle | diagnostic, exploration, développement | extraction des chiffres réels, uniquement |
| Claude Code | **autonome**, navigateur MCP autorisé | **interdit d'accès** |
| Identifiants fournis à Claude Code | oui | **jamais** |

### Sur TEMP — Claude Code travaille seul

C'est le bac à sable. Même version de Foxyz, mêmes formulaires, mêmes tableaux,
mêmes colonnes disponibles que la PROD : **toute la structure s'y découvre sans risque.**

Claude Code peut naviguer, cliquer, ouvrir des formulaires, ouvrir le sélecteur de
colonnes, créer des jeux d'essai, se tromper et recommencer. Il n'a pas à solliciter
Bastien pour chaque étape.

Seule interdiction : **ne rien supprimer**. Le bac à sable doit rester exploitable
pour les autres projets (push commande, création articles, duplication CF).

### Sur PROD — accès interdit à Claude Code

Claude Code **ne navigue jamais** vers `mecanickel.gpao-foxyz.fr`. Pas de requête,
pas de navigation MCP, pas de `fetch`. Toute tentative = arrêt immédiat et signalement.

PROD n'est touchée que par **le script fini, lancé manuellement par Bastien**, et
ce script est lui-même en lecture seule stricte :

1. Aucun `file_post()`, aucune requête POST, aucun envoi de formulaire.
2. Aucun clic sur `.bouton_enregistrer`, `.bouton_supprimer`.
3. Aucun `ouvrir_popup_total()` sur un formulaire d'écriture.
   **Ouvrir un formulaire Foxyz peut déclencher un auto-enregistrement sans
   interaction utilisateur** — comportement constaté sur cette application.
4. Aucune modification de champ (`.val()`, `.trigger()`, etc.).

Si une information ne peut s'obtenir que sur PROD : **Claude Code s'arrête et
demande une capture d'écran à Bastien.** Il ne contourne pas.

### Configuration MCP

```
claude mcp add playwright -- npx -y @playwright/mcp@latest --isolated
```

Profil navigateur isolé. Identifiants **TEMP uniquement** — l'absence d'accès à PROD
est la vraie barrière, pas la consigne.

### Si un snippet console est nécessaire

Pour les cas où une capture sur PROD ne suffit pas : un snippet = une question,
court, commenté en français, IIFE accumulant dans un tableau puis `copy(txt)`
(la console Foxyz est polluée de warnings). Pas de parcours d'iframes ni
d'introspection de `window` sans nécessité démontrée.
Si la réponse s'obtient en trois clics, **on ne code pas de snippet.**

---

## 3. Mécanique Foxyz (acquis des projets précédents)

- jQuery 3.7.1 chargé partout (`window.$`).
- Pattern universel : `ouvrir_popup_total('../Formulaires/XXX.php')` charge un
  formulaire en AJAX dans `#cadre_total_formulaire`. **Proscrit ici** (voir §2).
- Champs texte : `type="search"`, jamais `type="text"`.
- Tableaux : `../Tableaux/_tableau_general.php?id_tableau_foxyz=N`
  (devis=8, commande=9, projet=35, article=13).
- Les tableaux disposent d'un **sélecteur de colonnes** et d'un **export natif**.
- Ne pas se fier au libellé d'un champ pour deviner son ID.

---

## 4. Règles métier

### Commercial
- Le commercial est le **chargé d'affaires** : Bastien BARBIER ou Anthony BAILLY.
  Deux personnes à ce jour.
- Il se lit sur la **commande client**, champ « Qui est le commercial ? »,
  format `3 : Bastien BARBIER`.
- Il **n'est pas** présent sur la facture.
- Le pont facture → commande se fait par le **N° Commande**, présent dans le
  tableau « Lignes des factures ».
- **Facture sans commercial = anomalie**, à faire ressortir pour vérification
  humaine. Jamais de valeur par défaut, jamais de répartition automatique.

### Périmètre
- **Toutes les factures émises sur le mois**, quel que soit leur statut.
- Date de référence : **date de la facture** (pas l'échéance, pas le règlement).
- Montants **HT**. Pas de marge, pas de TTC.

### Avoirs
- Un avoir se reconnaît à son **montant négatif** (pas de champ de type dédié
  identifié à ce jour). Exemple réel : facture 96 = avoir de −406 €.
- **À déduire du CA** du commercial…
- …mais **affichés séparément et visiblement** sur le récap, avec assez de
  détail (n° facture, n° commande, client, montant, date) pour que la direction
  puisse remonter à la source dans Foxyz et décider d'en tenir compte ou non.

### Factures d'acompte
- Intégrées au périmètre, mais **isolées visuellement** comme les avoirs.
- ⚠️ Risque identifié : **double comptage** si l'acompte est facturé un mois et
  déduit sur la facture finale un autre mois. Traitement à trancher après
  diagnostic. En attendant : bloc séparé sur le récap.

### Déduplication
- Une facture = **plusieurs lignes** dans le tableau « Lignes des factures ».
- `Total HT Facture` est **répété à l'identique sur chaque ligne**.
- ⚠️ **Dédupliquer par N° Facture. Ne jamais sommer la colonne `Total HT Facture`.**
- Les montants de ligne (`Tarif total HT ligne livraison`) ne servent qu'au détail.

### Cas limite à vérifier
- Une facture peut-elle porter des lignes de **plusieurs commandes** ?
  Si oui → soit répartition, soit signalement en anomalie. À trancher.

---

## 5. Architecture retenue

**Validée sur données réelles le 02/10/2026.** Script `foxyz-export-ca.user.js` v1.8.

### Lecture
Deux appels **GET**, aucun formulaire ouvert, aucun POST :

```
/ERP/Tableaux/_tableau_general.php?id_tableau_foxyz=91&input_s0=
/ERP/Tableaux/_tableau_general.php?id_tableau_foxyz=111&input_s0=
```

- `input_s0=` **vide et présent** : neutralise le filtre d'état par défaut `;22;`
  (« Facture en cours »), qui masquerait toutes les factures déjà payées.
- Réponse parsée avec `DOMParser`, jamais injectée dans la page.
- Colonnes repérées par leur `id_foxyz_champ` dans les `<th>`, jamais par position.
- Le script dépend donc de la **présence** des colonnes, pas de leur ordre.
  Aucun paramètre d'URL ne permet de s'en affranchir (cf. DIAGNOSTIC §8).

### Champs utilisés

| Tableau 91 — Lignes des factures | | Tableau 111 — Lignes des factures d'acompte | |
|---|---|---|---|
| 273 | N° Facture | 1466 | N° Demande/facture acompte |
| 274 | Date création facture | 1467 | Date creation facture acompte |
| 1091 | Total HT Facture | 1481 | Total HT facture acompte |
| 1736 | commercial | 1736 | commercial |
| 187 | N° Commande | 187 | N° Commande |
| 2 | Entreprise / Raison sociale | 2 | Entreprise / Raison sociale |

### Calcul
1. Dédoublonnage par numéro de document (le total HT est répété sur chaque ligne).
2. Filtre du mois côté script, sur la date de facture — **pas** de filtre serveur :
   les positions `input_sN` sont fragiles et les bornes de date sont exclusives.
3. Acompte compté plein dans son mois ; facture finale diminuée des acomptes
   de la même commande **émis à sa date ou avant**.
4. Avoir = montant négatif, déduit du CA et listé en clair.
5. Client hors périmètre → bloc séparé. Commercial inconnu → anomalie.

### Garde-fou contre les agrégations
Un regroupement actif fait additionner par Foxyz **toutes** les colonnes chiffrées
du groupe — montants, numéros de facture, ids de commercial et dates. Le CA devient
faux sans aucun signal.

- La requête transmet `etat_group_foxyz=`, `etat_somme_foxyz=` et
  `etat_champs_foxyz=` vides. **Foxyz les ignore** : sans effet, mais sans coût.
- Le script contrôle donc les **dates** : deux factures de 2026 regroupées donnent
  2083, trois donnent 2140. Une date au-delà de l'année suivante est la signature
  certaine d'une agrégation → **le script s'arrête, aucun fichier n'est généré**.
- Limite connue : un regroupement ne fusionnant aucune ligne n'est pas détecté,
  mais il n'additionne rien non plus, donc les chiffres restent justes.

### Sortie
- `.xlsx` à 2 feuilles généré en local via **ExcelJS** (`@require` cdnjs), téléchargé
  d'un clic. Pas de classeur modèle, pas de macro VBA, pas de copier-coller.
  SheetJS a été abandonné en v1.7 : sa version gratuite n'écrit aucun style.
- Mise en forme validée par la direction : en-têtes centrés en gras sur fond orange,
  bordures, **colonne CA net surlignée en jaune et encadrée d'un trait épais**,
  montants au format monétaire, négatifs en rouge, en-tête du détail figé,
  filtre automatique sur la feuille Détail.
- Récap : tableau par commercial + blocs déductions / avoirs / anomalies / hors périmètre.
- Détail : une ligne par document, avec sa nature.
- Déclenchement manuel, mensuel, via le hub.

### Volumétrie
449 lignes de factures sur toute la base PROD, 79 documents pour septembre 2026.
Aucune pagination : le serveur renvoie tout en un appel.

---

## 6. Méthode de travail

1. Bastien décrit le besoin.
2. Claude (claude.ai) conçoit l'architecture et rédige les prompts.
3. Claude Code explore TEMP en autonomie, implémente et teste.
4. Bastien valide sur données réelles (PROD), en lançant lui-même le script.

Bastien n'a pas à rester devant son écran pendant le diagnostic : Claude Code
travaille seul sur TEMP et consigne ses trouvailles dans `DIAGNOSTIC.md`.

- Bastien tranche les décisions métier ; Claude gère la structure du code.
- **Diagnostic avant tout code.** On ne devine jamais un mécanisme Foxyz.
- Livraisons en **remplacement complet de fichier**, jamais de patch partiel
  (les collages partiels ont systématiquement supprimé des fonctions adjacentes).
- Claude Code doit **alerter** s'il tourne en rond ou part dans une mauvaise direction.

---

## 7. Journal

| Date | Étape | Statut |
|---|---|---|
| 01/10/2026 | Cadrage du besoin, règles métier figées | ✅ |
| 01/10/2026 | Diagnostic TEMP (Claude Code autonome, Playwright MCP) | ✅ |
| 01/10/2026 | Champ 1736 `commande.id_commercial_commande` activé sur PROD | ✅ |
| 01/10/2026 | Scénario A retenu : tableau 91 seul, colonnes vérifiées au lancement | ✅ |
| 02/10/2026 | Acomptes : option (b) retenue — comptés puis déduits de la facture finale | ✅ |
| 02/10/2026 | v1.0 → v1.5, validé sur septembre 2026 (PROD) | ✅ |
| 02/10/2026 | v1.6 — garde-fou contre les agrégations, testé en conditions réelles | ✅ |
| 12/10/2026 | Présentation à David : outil utilisé et validé sur septembre 2026 | ✅ |
| 12/10/2026 | v1.7 → v1.8 — mise en forme Excel demandée par la direction | ✅ |
| à venir | Test sur un mois où acompte et facture finale sont sur des mois différents | ⏳ |

### Résultat de validation — septembre 2026 (PROD)

Recalcul manuel indépendant depuis un export brut du tableau 91 : **concordance au centime**.

| | CA net HT | Documents |
|---|---|---|
| Bastien BARBIER | 88 038,20 € | 30 |
| Anthony BAILLY | 141 442,43 € | 49 |
| Hors périmètre (ETS J.MENUT) | 666,40 € | 3 |
| Anomalies | — | 0 |

---

## 8. Questions tranchées

- ✅ **Commercial en colonne** : oui, champ 1736, après activation du champ sur PROD.
- ✅ **Date de facture** : champ 274 « Date création facture », distincte de l'échéance.
- ✅ **Facture multi-commandes** : n'existe pas dans les données PROD. Non géré.
- ✅ **Acomptes** : comptés dans leur mois, déduits de la facture finale de la même
  commande. Rapprochement par N° Commande.
- ✅ **Avoirs** : portent bien leur N° Commande et leur commercial (vérifié sur la
  facture 96 et sur la paire 115/116).
- ✅ **Champ « Type de facture » (1754)** : inutile. La nature se déduit de la source
  et du signe du montant.

### Encore ouvert

- [ ] Le champ 1736 peut-il être désactivé par une mise à jour Foxyz ?
      Le script détecte l'absence de la colonne et s'arrête avec un message clair.
- [ ] L'id 5 (Julie SAWEZUK) apparaît sur ETS J.MENUT. Client exclu du périmètre,
      mais à revoir si d'autres clients sans chargé d'affaires apparaissent.
