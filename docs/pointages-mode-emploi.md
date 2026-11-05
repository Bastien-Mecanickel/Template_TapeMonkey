# Pointages : de Foxyz au tableau Excel

## 1. Quand faire l'extraction

Uniquement sur des **semaines terminées** : commencer un **lundi** et finir un **dimanche déjà passé**. Jamais sur la semaine en cours : une journée pas encore finie remonte à 0 heure, et le calcul serait faux.

## 2. L'extraction dans Foxyz

1. Onglet **RH**, menu **Synthèse des ouvertures** : la page « Activité du personnel » s'ouvre.
2. Régler les deux dates de la période (par exemple 24-08-2026). Le tableau se met à jour tout seul.
3. Ouvrir la boîte à outils en bas à droite, cliquer sur **Pointages** et lire le verdict :
   - **vert** : tout est bon ;
   - **orange** : fichier bien lu, mais quelque chose est à corriger dans Foxyz (pointage resté ouvert, semaine pas terminée). Le mieux : corriger, puis refaire l'extraction ;
   - **rouge** : fichier inutilisable, ne pas l'importer. Refaire l'extraction ; si le rouge revient, prévenir Bastien.
4. Cliquer sur **Telecharger le JSON**. Le fichier arrive dans Téléchargements.

## 3. Importer dans Excel

1. Chaque mois, partir d'une **copie** de **Pointages_MODELE.xlsm**, renommée pour le mois. Ne jamais remplir le modèle lui-même. À l'ouverture, cliquer sur **Activer le contenu** si la barre jaune apparaît.
2. Dans le **Résumé**, cliquer sur **Importer les pointages**. Vérifier la période annoncée, puis lire le résultat : **IMPORT TERMINÉ** (avec, s'il y en a, des points à vérifier qui disent quoi faire) ou **IMPORT IMPOSSIBLE** (rien n'a été modifié).
3. Tout est noté dans la feuille **Journal import** : une ligne par import, en vert, orange ou rouge. Ne pas l'effacer. On peut relancer l'import autant de fois que nécessaire : les codes déjà saisis sont conservés.

Les jours grisés **« hors contrat »** du Résumé sont des jours où la personne n'était pas encore arrivée ou était déjà partie. Ils ne comptent pour rien.

Dans le **Récap**, les absences sont comptées en **jours** (0,5 pour une demi-journée), plus en heures, avec une colonne par type de la feuille Codes.

## 4. La feuille de présence pour la comptable

Une fois les codes saisis, cliquer sur **Créer la feuille de présence**, en haut du Récap. Une fenêtre propose un nom, par exemple « FEUILLE DE PRESENCE 09 2026 » (le mois qui compte le plus de jours de la période), dans le dossier du classeur ; on peut changer l'un et l'autre, et Excel demande avant de remplacer un fichier existant. Le fichier créé contient une seule feuille : un récapitulatif par salarié, puis une ligne par absence avec ses dates. Il reste ouvert : **le relire avant de l'envoyer**.

Si la fenêtre dit **« FEUILLE DE PRÉSENCE NON CRÉÉE »** et demande de relancer l'import, c'est que la feuille Codes a changé depuis : relancer l'import, puis recommencer.

**Acompte d'un cadre au forfait** : les cadres au forfait n'ont pas de ligne dans le Récap. Ajouter la ligne à la main dans le fichier créé, avant de l'envoyer. Cette saisie n'est pas mémorisée : si la feuille de présence est créée à nouveau, il faut la refaire.

## 5. Ce qui reste à votre charge

- **Les codes d'absence**, dans la colonne **Code** du Résumé : cliquer sur la case et choisir dans la liste. Pour une demi-journée, que Foxyz ne sait pas faire, saisir DEMICP ou DEMIMAL.
- **La feuille Codes** : les 8 codes d'origine ne sont pas modifiables. Pour en ajouter un, remplir une ligne jaune sous la liste (code, libellé, texte pour la comptable, ou un tiret s'il ne lui est pas transmis) et choisir **Compte comme** : *Journée entière*, *Demi-journée* ou *Zéro*. Puis relancer l'import.
- **La feuille Salariés** :
  - **Statut** : *Suivi* (heures comparées au contrat), *Forfait* (seulement ses congés et arrêts) ou *Ignoré* (n'apparaît nulle part).
  - **Entré le** et **Sorti le** : à remplir à l'arrivée ou au départ, vides le reste du temps. Les deux dates sont comprises : « sorti le 31/08 » veut dire présent jusqu'au 31. Sans elles, un départ en cours de mois est compté comme s'il devait travailler toute la période : Gabriel CORMIER, parti fin août, ressortait avec 140 heures supplémentaires en moins, qui seraient parties chez la comptable.
  - **Éligible prime** (Oui ou Non) et **Kilomètres aller-retour (robot)**, seulement pour ceux qui y ont droit.

## 6. Si ça coince

Appeler **Bastien Barbier**. Si Excel affiche un message, le lui transmettre tel quel.
