# Reprise du chantier plans PDF (état au 16/10/2026)

**MAJ 27/10 (soir) : v1.9 VALIDEE par Bastien dans Firefox sur TEMP (checklist complete, aucune erreur). Chantier plans PDF termine cote code ; reste a Bastien : copie dans Template_TapeMonkey, passage PROD, nettoyage TEMP. Details : DIAGNOSTIC_PLANS.md sections 9 a 11. Le reste de ce fichier est l historique du 12/10.**

À lire au redémarrage, après `CLAUDE.md`, `CHANTIER_PLANS_PDF.md` et `DIAGNOSTIC_PLANS.md`.

## Où on en est
- Phase 0 (diagnostic) : **terminée**, livrable `DIAGNOSTIC_PLANS.md`.
- Phase 1 (v1.6, import + parsing + contrôle, aucune écriture Foxyz) : **pas commencée**,
  bloquée par les questions ci-dessous.
- Code de l'outil : toujours la v1.5, pas modifié.

## Redémarrer la session Playwright sur TEMP
- TEMP est derrière une authentification HTTP (pare-feu), avant le login Foxyz.
  Playwright annule la fenêtre native : il faut poser les identifiants avec
  `page.context().setHTTPCredentials(...)` via `browser_run_code_unsafe`.
  **Ils ne sont stockés nulle part** : les redemander à Bastien (ou lui proposer un
  fichier de config ignoré par git, chargé par `.mcp.json`).
- Entrée : `https://temp-mecanickel.gpao-foxyz.fr/ERP/Interfaces/` (`/ERP/` seul = 403).
- Puis Bastien se connecte à Foxyz lui-même dans la fenêtre.
- Enregistreur AJAX de diagnostic : hook `XMLHttpRequest` dans `window.__trace`
  (à reposer après chaque rechargement de page).

## Vrais noms de fichiers fournis par Bastien (à la racine du dossier, exclus de git)
Ne jamais lire leur contenu, seulement le nom.

| Fichier | Lecture proposée | Statut |
|---|---|---|
| `E-600-07-A INSERTS (PLAN ST).PDF` | art. E-600-07-A, doc E-600-07 ind. A, désignation INSERTS, sous-traitance | OK |
| `E-600-08-A INSERT BISEAU (PLAN ST).PDF` | idem | OK |
| `E-680-01-A FIXATION (PLAN ST).PDF` | idem | OK |
| `E3.12.04301_B.pdf` (plan client) | art. E3.12.04301_B ? doc E3.12.04301 ind. B ? désignation = référence | **Question 1** |
| `P.C. PINCE Ø13.3.PDF` (plan de coulée) | aucune référence, désignation "PINCE Ø13.3" | **Question 2** |
| `P.E-F-946-NEZ D'ETIQUETAGE OVALE 31X13.PDF` (plan d'ensemble) | réf. F-946 ? sans indice ? désignation NEZ D'ETIQUETAGE OVALE 31X13 | **Question 3** |
| `CDC Réalisation godets type WECKERLE SHOCK SHINE-Ligne M31.docx` | ressource, ni réf. ni type | **Question 4** |
| `Spécifications dimensionnelles Godets WECKERLE SHOCK SHINE - Ligne M31.pdf` | ressource, ni réf. ni type | **Question 4** |

Convention réelle : `REF-INDICE DESIGNATION (SUFFIXE).PDF` (espace + parenthèses), pas
`REF-INDICE_DESIGNATION__TYPE_.PDF`. Préfixes `P.C.` / `P.E-` en tête pour certains.

## Questions en attente de Bastien
1. `E3.12.04301_B.pdf` : `_B` = indice ? Réf. article `E3.12.04301_B`, doc `E3.12.04301`
   indice `B`, désignation = référence ?
2. `P.C. PINCE Ø13.3.PDF` : aucune référence. Quelle référence d'article créer ?
3. `P.E-F-946-…` : réf. `F-946`, sans indice ? Indice vide ou `A` par défaut ?
4. Les 2 ressources (docx + pdf) : rattacher comme documents à un article (lequel, quel
   type ?) ou hors périmètre v1 ? Le `.docx` passe dans la GED.
5. Type de document pour P.E : aucun "plan d'ensemble" connu sur PROD (Plan, PLAN DE
   COULÉE, PLAN DE FABRICATION, PLAN DE SOUS TRAITANCE). Créer le type ou prendre "Plan" ?
6. Valider la nouvelle clé de rapprochement GED (section 3 du diagnostic).

## Décisions déjà prises par Bastien
- Nom de fichier conservé : `foxyz-creation-articles.user.js`. Pas de push, git local.
- Pas de référence ni de nom lisible : mettre la référence dans les 2 champs (réf. + désignation).
- **Le type de document se choisit dans l'outil**, comme les catégories (Type / Famille /
  Sous-famille). Le suffixe ne fait que pré-remplir.

## Propositions faites, en attente de son accord
- Colonne **Type doc** alimentée par la liste réelle de l'instance
  (`liste_type_document.php`, TEMP ≠ PROD), pré-remplie par le suffixe, bouton "tous".
  Suffixe inconnu = case à choisir, plus une erreur.
- Réf. article, réf. doc, indice, désignation **modifiables dans le tableau** : le parseur
  propose, Bastien corrige.
- Clé GED : `Ø`→`O`, retrait des accents, majuscules, suppression de tout sauf `A-Z0-9`.

## Créé sur TEMP (à nettoyer par Bastien)
Voir la section 7 de `DIAGNOSTIC_PLANS.md` : article N° 60 `ZZ-TEST-01-A`, Doc 12, et
10 fichiers factices dans la GED privée de Bastien (2 `ZZ_TEST_…` + 8 aux noms réels).
