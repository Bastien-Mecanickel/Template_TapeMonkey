# Foxyz -> Dossier (passerelle commande Foxyz -> dossier d'affaire Excel)

Outil de MECANICKEL. Lit une commande client dans l'ERP **Foxyz** (via un
userscript Tampermonkey) et remplit le classeur **Dossier d'affaire** (VBA), pour
supprimer la ressaisie a l'atelier. Pas d'acces serveur : navigateur + Excel only.

Auteur/mainteneur : Bastien (charge d'affaires, MECANICKEL). Objectif affiche :
comprendre et maintenir le code soi-meme, pas d'usine a gaz.

---

## 1. Architecture

```
Foxyz (userscript Tampermonkey)              Excel (VBA)
 "Envoyer au dossier" lit la commande         import du panier
   -> panier cumulatif (localStorage)         -> remplit "Dossier Affaire"
   -> "Exporter" telecharge                   -> pagine (1 article jamais coupe)
      panier_dossiers.json                    -> feuille(s) Roll-Stop
                                              -> historise, retire du panier a l'impression
```

- Fiche mere = la **Commande** (N° Affaire = n° commande).
- Pont entre les deux = un fichier JSON (`panier_dossiers.json`) depose dans
  Telechargements (le navigateur ne peut que declencher un telechargement).
- Le classeur est un **gabarit** (remplir / imprimer / remplacer), pas une archive.

---

## 2. Arborescence du dossier

```
foxyz-dossier/
  README.md                         <- ce fichier
  userscripts/
    foxyz-push-commande.user.js      <- userscript (derniere version : v1.6)
  excel/
    ImportDossier.bas                <- module import + remplissage + pagination
    impression.bas                   <- module "impression" (ex-"Module2")
    JsonConverter.README.txt         <- note sur la dependance VBA-JSON
  diagnostics/
    snippets.md                      <- bouts de console reutilisables
```

Cote classeur Excel, le module d'impression s'appelle **`impression`**
(anciennement "Module2"). `ImportDossier` et `JsonConverter` (VBA-JSON) sont des
modules a part.

---

## 3. Mecanique technique Foxyz (a savoir absolument)

- **jQuery 3.7.1** charge partout (`window.$`).
- Fonction native : `ouvrir_popup_total('../Formulaires/XXX.php')` ouvre un
  formulaire dans `#cadre_total_formulaire` (AJAX). Tout le menu ERP suit ce
  pattern. Bouton de sauvegarde : `#cadre_total_formulaire .bouton_enregistrer:visible`.
- **PIEGE MAJEUR** : les champs texte ont `type="search"`, PAS `type="text"`.
  Ne jamais cibler `input[type=text]`. Cibler par `#id` exact ou par placeholder.
- Les **IDs peuvent etre trompeurs** (un champ "Titre" peut avoir un id
  `description_XXX`). Toujours verifier par diagnostic (voir diagnostics/snippets.md).
- Pour remplir un champ, 3 triggers necessaires :
  `$('#id').val(v); $('#id').trigger('input'); $('#id').trigger('change'); $('#id').trigger('blur');`
- Les onglets d'une fiche commande sont des `.sous_menu` (Commande client,
  Revue des exigences, ...). On bascule par `.click()`.

### Marqueurs/champs cles decouverts (confirmes par diagnostic)

- **Ligne de commande** : conteneur `.ligne_devis`. Une ligne **annulee** recoit
  en plus la classe **`bord_rouge`**. -> test fiable, par ligne.
- **Pont ligne -> LC** : sur l'onglet Commande client, `of_foxyz_N` = le LC de la
  ligne N. Ce LC est le suffixe du champ **`date_livraison_prevue_<LC>`** sur
  l'onglet Revue des exigences (= le delai revise).

---

## 4. Mapping des champs (onglet Commande client)

En-tete commande :
- `id_commande_client` -> n_commande (= N° Affaire)
- `id_entreprise` -> client = ALIAS (champ 4571). Valeur "ID : ALIAS (RAISON SOCIALE)" :
  garder apres " : " puis retirer la derniere parenthese (`aliasClient`, comptage
  des parentheses depuis la fin).
- `id_client` -> contact  (idem)
- `id_commercial_commande` -> charge d'affaires  (idem)
- `date_ouverture_client` -> date d'ouverture

Par ligne `_N` :
- `reference_article_N` -> article brut (voir formats ci-dessous)
- `quantite_article_N`  -> quantite
- `of_article_N`        -> commentaire
- `date_cloture_prev_N` -> date souhaitee client (= **repli** du delai)
- `of_foxyz_N`          -> LC de la ligne (pont vers le delai revise)

Devis : pas de champ direct ; texte "Suite au devis N" sur l'onglet
**Revue des exigences**. Le userscript y bascule, lit, puis revient.

---

## 5. Decoupage de la reference article (3 formats + garde-fou)

La valeur de `reference_article_N` prend 3 formes. ART. et REP. sont **inverses** :

- `ART. N : REF (DESIGNATION)`   -> ref AVANT la parenthese, designation DEDANS
- `REP. N-NN : DESIGNATION (REF)`-> designation AVANT, ref DEDANS
- sans prefixe reconnu            -> pas de ref, tout en designation

Regles (fonction `decouperArticle`) :
- Decoupe par **position** de parenthese (1ere pour ART, derniere pour REP), pas
  par regex -> tolere les parentheses **imbriquees** dans la designation
  (ex. `ART. N : G-144 Indice A (JEU ... (SVG BOOSTER 40ML))`).
- **Garde-fou** `estRefValable` : une chaine n'est acceptee comme ref que si elle
  a l'allure d'une ref = **lettre MAJ + '-' + 3 chiffres**, parfois + '-' + 2/3
  chiffres (ex. `F-889`, `G-144`, `F-889-01-A`). Evite de prendre une parenthese
  de prose (ex. `( noir )`) pour une ref.
- **N/A** : une ref contenant "N/A" (non applicable) est traitee comme absente
  -> cote Excel, la ligne ressort avec "PR N°____" (via `EnteteArticle`).

---

## 6. Delai atelier = delai REVISE (pas la date client)

Le "delai atelier" transmis = le delai revise de l'onglet **Revue des exigences**
(`date_livraison_prevue_<LC>`, LC = `of_foxyz_N`), et non la date souhaitee client.
Lu dans le meme aller-retour que le devis. **Repli** : si pas de delai revise
saisi sur une ligne, on garde la date client (jamais de delai vide a l'atelier).

---

## 7. Cote Excel (classeur Dossier d'affaire)

Feuilles : `Dossier Affaire` (+ copies `(2)`, `(3)`...), `Feuille Roll-Stop`
(+ copies), `Historique Feuille Dossier`, `Dossier N,C,` (non-conformite).

Cellules (module ImportDossier) : O4/O5/O6 (affaire/devis/date), N9 client,
U4 contact, U5 charge, X4 delai, N12 designation (zone N12:U39), Q1 titre, X1 page.
Reglages : `LIGNES_MAX=40`, `CARS_PAR_LIGNE=96`, `COL_DONNEES=10` (col J = JSON
d'import pour reimpression), bleu `00B0F0`.

Mise en forme designation, par article : `Ref - Designation` (gras+souligne bleu),
`Quantite : N` (rouge), vide, commentaire (bleu), vide.

Pagination : un article n'est JAMAIS coupe ; pages 2+ = copies autonomes,
regenerees a chaque import, supprimees a la fermeture du classeur.

Roll-Stop : seuls les articles contenant un mot-cle (`MOTS_ROLLSTOP` dans
`impression`) sont recopies, une feuille par Roll-Stop. "RS" nu est exclu (matchait
"CENTREURS"...).

Impression : `impression_feuille_BE` / `impression_feuille_Dir` passent par
`ImprimerToutesLesPagesDossier`. **Cas N.C.** : si la feuille active est
`Dossier N,C,`, on imprime seulement cette feuille (sans Roll-Stop/historique/panier).

Dependances VBA (une fois) : importer VBA-JSON (`JsonConverter.bas`) + cocher
"Microsoft Scripting Runtime" (Outils > References).

---

## 8. Methode de travail (IMPORTANT)

1. **Diagnostic d'abord** : pour tout nouveau champ/formulaire, lancer un snippet
   console (voir `diagnostics/snippets.md`), lire les vrais IDs, PUIS cabler.
2. **Fichier entier** : pour modifier userscript ou module VBA, repartir du
   fichier COMPLET (ne pas faire de collage partiel -> ca mange les fonctions
   voisines, bug recurrent rencontre plusieurs fois).
3. Apres maj Tampermonkey : **recharger la page** Foxyz (sinon ancienne version).
4. Apres maj VBA : **Debogage > Compiler VBAProject** pour verifier qu'aucune
   fonction appelee ne manque.

---

## 9. Historique des versions (userscript)

- v1.0 : base (ART. seulement), connecteur Hub, panier localStorage.
- v1.1 : formats ART. + REP. + garde-fou `estRefValable`.
- v1.2 : decoupe par position (indexOf) -> parentheses imbriquees gerees.
- v1.3 : delai atelier = delai revise (Revue des exigences).
- v1.4 : exclusion des lignes annulees (classe `bord_rouge`).
- v1.5 : ref contenant "N/A" traitee comme absente (-> "PR N°____").
- v1.6 : client = alias Foxyz (champ 4571) au lieu de "alias (raison sociale)".

Cote Excel (correctifs valides) :
- #3 : coloration "Quantite : N" par InStr (plus de decalage du rouge).
- #4 : impression de la feuille `Dossier N,C,` via le bouton Dir/BE.

---

## 10. Etat actuel / a surveiller

- Tout le backlog en cours est traite. `Dossier N,C,` (#4) : code en place et
  compile ; **a valider en direct** a la prochaine creation de non-conformite.
- v1.5 (N/A) : en place, a confirmer a l'usage (surtout un N/A a 3 chiffres).
- v1.6 (alias client) : valide sur 4 clients le 27/10/2026. Si un cas echoue
  (ex. client SANS alias dont la raison sociale finit par une parenthese), plan B =
  lire directement le champ perso 4571 sur la fiche entreprise (diagnostic a faire).
- Vigilance : formatage caractere par caractere fragile au-dela de ~255 car.
  (neutralise par la pagination). Re-pousser apres maj du userscript.
