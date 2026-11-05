# Foxyz - Outils Tampermonkey (MECANICKEL)

Ce dossier est un repo Git et la **seule source de vérité** des userscripts Foxyz. Ne jamais créer de copie d'un script ailleurs (autre dossier, sauvegarde, version "prod"). Un script = un seul fichier, ici.

## Règles de travail
- Travailler sur la branche `dev`. `main` = prod (Tampermonkey se met à jour depuis `main` via `@updateURL`).
- Incrémenter `@version` à chaque modification d'un script (sinon Tampermonkey ne détecte pas la mise à jour).
- Faire un commit après chaque version validée par Bastien, message court : `<outil> vX.Y : <changement>`.
- Ne jamais merger dans `main` ni pusher sans demande explicite de Bastien.
- Ne jamais renommer ni déplacer un `.user.js` : son nom et son chemin font partie de l'`@updateURL` déjà installé dans les navigateurs. Les scripts restent à la racine.
- Ne pas stocker ici de données (Excel, exports, PDF) : elles restent dans `C:\Users\Direction\Documents\TRAVAIL\CLAUDE\<outil>\`.

## Scripts
| Fichier | Outil |
|---|---|
| `foxyz-hub.user.js` | Hub (boîte à outils) : tous les autres outils s'y branchent via `connecterHub()` |
| `foxyz-creation-articles.user.js` | Création d'articles en masse |
| `foxyz-dossier-push-commande.user.js` | Dossier Push commandes |
| `foxyz-export-ca.user.js` | Export CA par commercial (lecture seule) |
| `foxyz-pointages.user.js` | Extraction pointages vers JSON |
| `foxyz-calculette.user.js` | Calculette temps & prix (100 % local) |

## Documentation
Contexte, IDs de formulaires, pièges et diagnostics de chaque outil : dossier `docs/`. Tests : dossier `tests/` (ex. `node tests/parseur_plans.test.js`).

## Rappels techniques Foxyz
- Les champs texte ont `type="search"`, jamais `type="text"`. Cibler par `#id` exact ou par placeholder.
- Remplir un champ : `.val()` puis `trigger('input')`, `trigger('change')`, `trigger('blur')`.
- Tout outil doit s'enregistrer dans le Hub avec `connecterHub({ id, label, icone, onOpen })`.
