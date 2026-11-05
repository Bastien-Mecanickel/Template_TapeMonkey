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

## Documentation par outil (À LIRE avant de travailler sur un outil)
Claude Code ne charge automatiquement que ce `CLAUDE.md`. Les fichiers de `docs/` ne sont lus que si tu les ouvres : **avant toute modification d'un outil, lis d'abord son fichier principal ci-dessous**, et les fichiers complémentaires seulement si la tâche les concerne (certains sont volumineux). Si la demande de Bastien ne nomme pas l'outil, demande-lui lequel.

| Outil | À lire d'abord | Complémentaires (à la demande) |
|---|---|---|
| Création articles | `docs/creation-articles.md` | `docs/creation-articles-reprise.md`, `docs/creation-articles-chantier-plans-pdf.md`, `docs/creation-articles-diagnostic-plans.md` ; test : `tests/parseur_plans.test.js` |
| Export CA | `docs/export-ca.md` | `docs/export-ca-diagnostic.md` (très long, ne lire que si besoin) |
| Pointages | `docs/pointages.md` | `docs/pointages-mode-emploi.md` |
| Dossier Push commandes | `docs/dossier-push-commande.md` | `docs/dossier-push-commande-snippets.md` |
| Hub, Calculette | pas de doc dédiée : lire l'en-tête et le code du script | |

Les données de chaque outil (Excel, exports, diagnostics bruts) sont dans `C:\Users\Direction\Documents\TRAVAIL\CLAUDE\<dossier de l'outil>\`, hors repo.

## Rappels techniques Foxyz
- Les champs texte ont `type="search"`, jamais `type="text"`. Cibler par `#id` exact ou par placeholder.
- Remplir un champ : `.val()` puis `trigger('input')`, `trigger('change')`, `trigger('blur')`.
- Tout outil doit s'enregistrer dans le Hub avec `connecterHub({ id, label, icone, onOpen })`.
