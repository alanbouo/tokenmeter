# Phase 3 — Calibration (constat du 2026-09-28)

## Principe implémenté (étape A du plan)

Pour chaque paire de relevés hebdomadaires consécutifs et « propres » :

```
stock estimé = coût équivalent des tokens consommés / (hausse de jauge en points / 100)
```

L'estimation finale est la **médiane** des estimations par intervalle ; la
dispersion est la **déviation absolue médiane** (MAD), moins sensible aux
intervalles aberrants que l'écart-type.

## Ce qui a été construit

- `src/pricing.ts` — table de prix par modèle et par type de token (entrée,
  sortie, écriture cache 5m/1h, lecture cache), en `$` par million de
  tokens. **Source : la page de tarification officielle
  (`https://platform.claude.com/docs/en/about-claude/pricing`), récupérée
  le 2026-09-28.** Couvre les modèles observés dans `events` sur cette
  machine (`claude-sonnet-5`, `claude-opus-5-5`) plus quelques autres au
  cas où. Un modèle absent de la table est exclu du calcul de coût (compté
  et signalé, pas silencieusement ignoré).
- `src/calibration.ts` — `calibrate()` : parcourt les relevés
  chronologiquement, exclut les intervalles `dirty`, ceux qui traversent
  une remise à zéro hebdomadaire connue (table `resets`), et ceux dont la
  hausse de jauge est sous le seuil (`--min-delta`, défaut 1 point, pas
  figé en dur). Calcule le coût des tokens ingérés dans chaque intervalle
  retenu, en déduit une estimation de stock, puis prend la médiane.
  Persiste chaque calcul dans la table `calibrations`.
- `tokenmeter calibrate [--min-delta <pct>]` — affiche le stock estimé, sa
  marge (MAD), le nombre d'intervalles utilisés/considérés, et rappelle
  explicitement qu'il s'agit d'une estimation basée sur des ratios de prix
  API, pas d'une valeur officielle Anthropic.

## Important : ce que « coût équivalent » veut dire ici

Le stock affiché est en **dollars équivalent-API**, pas en tokens bruts ni
en unité officielle du forfait — le forfait n'a pas d'unité publique (voir
`docs/cadrage.md`). C'est un choix arbitraire de dénominateur, cohérent
avec l'étape A du plan : pondérer par les prix API donne un point de départ
raisonnable pour comparer types de tokens et modèles entre eux, mais nous
n'avons **aucune garantie** que le forfait facture réellement selon ces
ratios en interne. La calibration elle-même (l'estimation qui sort de la
commande) est ce qui permet, à terme, de vérifier si cette hypothèse tient
— c'est explicitement le sujet ouvert de l'étape B du plan (apprendre les
pondérations par régression plutôt que les supposer).

## Vérifié

- Logique testée sur un jeu de données synthétique isolé (pas la base
  réelle) : 3 relevés consécutifs simulant un intervalle propre (delta
  6 points, coût calculé à la main = 9 $), un intervalle `dirty` (exclu),
  et un intervalle sous le seuil de 1 point (exclu). Résultat :
  1 intervalle retenu sur 3, stock estimé = 150 $, conforme au calcul
  manuel (9 / (6/100) = 150).
- Sur la base réelle de cette machine (2026-09-28), un seul relevé existe
  à ce stade (`tokenmeter sync` exécuté en phase 2) — pas encore de quoi
  produire une estimation. Le critère de fin de la phase (« au moins une
  estimation produite, avec sa marge affichée ») est vérifié sur la
  logique, pas encore en conditions réelles : il faudra au moins un second
  relevé propre dans la même semaine pour voir `tokenmeter calibrate`
  produire un résultat sur les vraies données.

## Limites assumées

- **Un seul intervalle ⇒ marge nulle**, ce qui donne une fausse impression
  de précision. La dispersion (MAD) n'est significative qu'à partir de
  plusieurs intervalles ; `calibrate` l'affiche quand même mais le nombre
  d'intervalles utilisés est toujours montré à côté pour contextualiser.
- **Détection de remise à zéro dépendante de `reset_at`**, qui peut être
  `null` si le libellé de `/usage` n'a pas pu être interprété (voir phase
  2). Un intervalle qui traverse une remise à zéro non détectée ne sera
  **pas** exclu — risque de sous-estimation du stock (hausse de jauge
  reflétant en réalité un cycle qui a redémarré). À surveiller si les
  estimations semblent erratiques autour des dates de remise à zéro.
- **Repli 5 minutes pour le cache non ventilé.** Si `cache_creation_1h_tokens`
  et `cache_creation_5m_tokens` sont tous deux à zéro alors que
  `cache_creation_input_tokens` est positif, le code traite tout comme du
  cache 5 minutes (tarif plus élevé que le 1h). Ne devrait pas arriver avec
  le format JSONL actuel (voir phase 0) mais évite de perdre du coût
  silencieusement si le format changeait.
- **Modèles inconnus exclus du coût, pas de l'intervalle.** Si un
  intervalle contient des événements sur un modèle absent de
  `pricing.ts`, leur coût est ignoré (et compté dans
  `unknownModelEventCount`) plutôt que de faire échouer tout l'intervalle.
  Cela sous-estime le coût de l'intervalle si le modèle inconnu a un poids
  significatif — recalibrer `pricing.ts` dès qu'un nouveau modèle apparaît
  dans `events`.

## Prochaine étape

Phase 4 — rythme et projection : comparer pourcentage consommé à
pourcentage de semaine écoulée, projeter la fin de semaine, et détailler
`by-project` à partir de la même table `events`.
