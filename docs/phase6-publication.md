# Phase 6 — Publication open source (constat du 2026-09-28)

## Ce qui a été fait

- **Licence : MIT**, choisie par l'utilisateur (voir `LICENSE` à la racine,
  `package.json` mis à jour). Répond au point ouvert du plan
  (« licence à choisir avant la phase 6 »).
- **README réécrit** avec une section **Méthodologie** expliquant le
  principe de calibration, ce qui est exclu d'un intervalle, les hypothèses
  assumées (pas des certitudes), et le renvoi vers les notes de phase pour
  le détail. C'est la section que le plan identifie comme le
  différenciateur à communiquer.
- **Commande `export [--out <fichier>]`** — exporte le contenu de la table
  `calibrations` en JSON. Anonyme par construction : cette table ne stocke
  déjà ni chemin de projet, ni modèle, ni tokens bruts — seulement
  l'horodatage du calcul, l'estimation, sa dispersion, et le nombre
  d'intervalles utilisés. Aucune anonymisation supplémentaire n'était donc
  nécessaire ; documenté ici pour que ce choix de schéma reste visible
  plutôt qu'implicite.

## Ce qui reste un choix de l'utilisateur, volontairement pas fait ici

- **Rendre le dépôt public sur GitHub** (ou équivalent) — action distincte
  de préparer le contenu pour la publication. `CLAUDE.md` dit « le dépôt
  est privé » jusqu'à cette phase ; passer le dépôt en public change qui
  peut le voir, ce n'est pas une décision à prendre pour l'utilisateur.
- **Publier le paquet sur le registre npm** (`npm publish`) — le
  `package.json` garde `"private": true` par précaution : publier
  officiellement engage un nom de paquet, une politique de versions, et une
  charge de maintenance qui dépassent la préparation de la phase 6.
  `npx <chemin-github>` reste utilisable sans ce choix.
- **Mise en commun volontaire des calibrations par forfait** (mentionnée
  dans le plan comme option *hors MVP*, après un MVP stable) — non
  entamée, cohérent avec le plan.

## Prochaine étape

Le plan de MVP (phases 0 à 6) est maintenant couvert. Ce qui reste, au-delà
du MVP :

- Accumuler des relevés réels sur plusieurs semaines pour que `calibrate`
  produise une première estimation en conditions réelles (pas seulement
  sur données synthétiques, voir `docs/phase3-calibration.md`).
- Étape B de la calibration (régression au lieu des ratios de prix API) si
  l'étape A montre un biais systématique.
- Décider, le moment venu, des deux points ouverts ci-dessus (visibilité du
  dépôt, publication npm).
