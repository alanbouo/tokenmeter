# Phase 4 — Rythme et projection (constat du 2026-09-28)

## Ce qui a été construit

- `tokenmeter pace` — compare l'usage hebdomadaire estimé au pourcentage
  de la semaine écoulé, et projette la fin de semaine au rythme constant
  observé depuis le début de la semaine :
  - **Usage courant estimé** = dernier relevé + coût équivalent des tokens
    ingérés depuis, converti en points via la dernière calibration
    (`tokenmeter calibrate`). Sans calibration disponible, retombe sur le
    dernier relevé brut (pas d'estimation continue).
  - **Semaine écoulée** = position de l'instant présent entre la dernière
    remise à zéro connue et la prochaine (table `resets`, phase 2).
  - **Projection** = extrapolation linéaire du rythme observé depuis le
    début de semaine. Si elle dépasse 100 %, affiche la date estimée de
    dépassement ; sinon, le nombre de points de stock qui seraient perdus
    en fin de semaine au rythme actuel.
- `tokenmeter by-project` — répartition du coût équivalent de la semaine en
  cours par projet (`cwd`), triée par coût décroissant, avec le
  pourcentage du stock estimé quand une calibration existe.

## Dégradation gracieuse

Ni `pace` ni `by-project` n'exigent que toutes les données soient
disponibles — chaque étape manquante réduit ce qui est affiché plutôt que
de faire échouer la commande :

- Pas de relevé du tout → `pace` le dit et s'arrête là.
- Relevé mais pas de calibration → `pace` affiche le dernier relevé brut
  sans estimation continue ; `by-project` affiche des dollars
  équivalent-coût sans pourcentage de stock.
- Pas de remise à zéro hebdomadaire observée (jamais lancé `sync`, ou pas
  encore vu de remise à zéro) → `pace` n'affiche ni l'écoulement de semaine
  ni la projection ; `by-project` retombe sur tout l'historique ingéré au
  lieu de la semaine en cours, en le signalant explicitement.

## Vérifié en conditions réelles

Sur cette machine (2026-09-28, un seul relevé disponible, pas encore de
remise à zéro observée) :

- `tokenmeter pace` affiche correctement le dernier relevé (16 %) et
  indique proprement l'absence de calibration et de bornes de semaine,
  sans planter.
- `tokenmeter by-project` a produit une répartition sur tout l'historique
  ingéré (plus de 60 projets, du plus gros consommateur à moins de 0,01 $),
  avec la note attendue sur l'absence de calibration.
- En creusant les événements exclus (modèle inconnu), deux cas repérés :
  - `<synthetic>` (9 événements, tous à 0 token) — marqueur interne sans
    coût, écarté sans impact.
  - `claude-haiku-4-5-20251001` (variante datée, 7 événements avec de
    vrais tokens) — corrigé en faisant retomber `pricing.ts` sur l'ID sans
    suffixe de date (`-YYYYMMDD`) quand l'ID exact n'est pas dans la table,
    au lieu d'exiger que chaque variante datée y soit listée.

## Limites assumées

- **La projection suppose un rythme constant** depuis le début de semaine,
  ce qui est rarement vrai (usage en rafales). C'est une extrapolation
  simple, explicitement nommée « au rythme actuel » dans la sortie — pas
  une prédiction fiable, un ordre de grandeur.
- **`pace` recharge la dernière calibration existante**, il ne relance pas
  `calibrate`. Une calibration périmée (faite avant un changement de
  rythme d'usage) fausse l'estimation continue jusqu'à la prochaine
  calibration manuelle.
- **`by-project` ne filtre pas par relevé `dirty`** : contrairement à la
  calibration (phase 3), la répartition par projet inclut tous les tokens
  ingérés dans la fenêtre, y compris ceux d'intervalles qui auraient été
  exclus du calcul de calibration. C'est intentionnel — on répartit ce qui
  a été réellement consommé, pas ce qui aurait servi à calibrer.

## Prochaine étape

Phase 5 — statusline : ligne compacte dans Claude Code
(`hebdo 62 % · semaine 55 % · +7 pts · projet X`), réutilisant
`computePace` et `byProject` déjà en place.
