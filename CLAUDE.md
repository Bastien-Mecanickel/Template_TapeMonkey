# Foxyz - Outils Tampermonkey (MECANICKEL)

Ce dossier est un repo Git et la **seule source de vérité** des userscripts Foxyz. Ne jamais créer de copie d'un script ailleurs (autre dossier, sauvegarde, version "prod"). Un script = un seul fichier, ici.

## Règles de travail
- Travailler sur la branche `dev`. `main` = prod (Tampermonkey se met à jour depuis `main` via `@updateURL`).
- Incrémenter `@version` à chaque modification d'un script (sinon Tampermonkey ne détecte pas la mise à jour).
- Faire un commit après chaque version validée par Bastien, message court : `<outil> vX.Y : <changement>`.
- Ne jamais merger dans `main` ni pusher sans demande explicite de Bastien.
- Ne jamais renommer ni déplacer un `.user.js` : son nom et son chemin font partie de l'`@updateURL` déjà installé dans les navigateurs. Les scripts restent à la racine.
- Ne pas stocker ici de données ni de docs d'outil (Excel, exports, PDF, CLAUDE.md d'outil) : ils restent dans le dossier de l'outil, voir ci-dessous.

## Scripts
| Fichier | Outil |
|---|---|
| `foxyz-hub.user.js` | Hub (boîte à outils) : tous les autres outils s'y branchent via `connecterHub()` |
| `foxyz-creation-articles.user.js` | Création d'articles en masse |
| `foxyz-dossier-push-commande.user.js` | Dossier Push commandes |
| `foxyz-export-ca.user.js` | Export CA par commercial (lecture seule) |
| `foxyz-pointages.user.js` | Extraction pointages vers JSON |
| `foxyz-calculette.user.js` | Calculette temps & prix (100 % local) |

## Documentation par outil
Le point d'entrée de chaque outil est **son dossier**, à côté de `_GitHub/` (`../../<dossier>/`). Chaque dossier a un `CLAUDE.md` qui renvoie vers le script de ce repo. Si tu es lancé depuis le repo, lis le `CLAUDE.md` de l'outil concerné avant de le modifier (et demande lequel si la demande ne le nomme pas).

| Outil | Dossier (depuis la racine du repo) |
|---|---|
| Création articles | `../../Outi ajout article en masse/` (CLAUDE.md, REPRISE.md, CHANTIER_PLANS_PDF.md, DIAGNOSTIC_PLANS.md) |
| Export CA | `../../Outil Export CA Prime mensuelle/` (CLAUDE.md, DIAGNOSTIC.md très long, ne lire que si besoin) |
| Pointages | `../../Export_heures_salariés_Foxyz/` (CLAUDE.md, MODE_EMPLOI.md) |
| Dossier Push commandes | `../../Création Dossier Cmde/` (CLAUDE.md, README.md, diagnostics/) |
| Hub, Calculette | `../../Hub pour outils Foxyz/` |

Les données de chaque outil (Excel, exports, diagnostics bruts, docs) restent dans le dossier de l'outil, hors repo. Seuls les scripts et `tests/` sont versionnés ici.

## Rappels techniques Foxyz
- Les champs texte ont `type="search"`, jamais `type="text"`. Cibler par `#id` exact ou par placeholder.
- Remplir un champ : `.val()` puis `trigger('input')`, `trigger('change')`, `trigger('blur')`.
- Tout outil doit s'enregistrer dans le Hub avec `connecterHub({ id, label, icone, onOpen })`.
