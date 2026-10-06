# tokenmeter

Pilote local d'usage Claude : suivre le rythme de consommation par rapport
aux fenêtres du forfait, estimer la taille réelle du quota hebdomadaire par
calibration, et voir pour quels projets on consomme.

MVP terminé (phases 0 à 6 du plan). Licence MIT. Le dépôt reste privé pour
l'instant — le rendre public sur GitHub (ou équivalent) et publier sur npm
sont des décisions distinctes, pas encore prises (voir
`docs/phase6-publication.md`).

## À lire avant de coder

- [`docs/cadrage.md`](docs/cadrage.md) — le problème, ce qu'on peut
  réellement mesurer, pourquoi le plafond hebdomadaire est un stock
  périssable à unité inconnue, le positionnement face à ccusage et
  Claude-Code-Usage-Monitor, les limites assumées.
- [`docs/plan-mvp.md`](docs/plan-mvp.md) — le plan en phases (0 à 6), avec
  le critère de fin de chaque phase.
- [`docs/phase0-verifications.md`](docs/phase0-verifications.md) — constat
  réel sur le format JSONL, l'automatisation de `/usage`, et la remise à
  zéro hebdomadaire. Fait autorité sur ces points, jusqu'à date de
  péremption (voir avertissement dans le fichier).
- [`docs/phase1-ingestion.md`](docs/phase1-ingestion.md) — décisions de
  l'ingestion (schéma, dédoublonnage, `node:sqlite`) et vérification des
  totaux contre `ccusage`.
- [`docs/phase2-releves.md`](docs/phase2-releves.md) — relevés manuels et
  automatiques (`read`/`sync`), limites du parsing de `/usage` et de la
  détection de remise à zéro.
- [`docs/phase3-calibration.md`](docs/phase3-calibration.md) — méthode de
  calibration (étape A), table de prix par modèle et sa source, limites
  assumées.
- [`docs/phase4-rythme.md`](docs/phase4-rythme.md) — `pace` et
  `by-project`, dégradation gracieuse quand relevés/calibration/remises à
  zéro manquent.
- [`docs/phase5-statusline.md`](docs/phase5-statusline.md) — commande
  `statusline`, format JSON reçu de Claude Code sur stdin, configuration
  `settings.json`.
- [`docs/phase6-publication.md`](docs/phase6-publication.md) — licence,
  commande `export`, ce qui reste un choix de l'utilisateur (visibilité du
  dépôt, publication npm).
- [`docs/phase7-profils.md`](docs/phase7-profils.md) — plusieurs comptes
  Claude : profils (`CLAUDE_CONFIG_DIR`), migration du schéma, détection du
  profil courant.

Ces fichiers font autorité sur le périmètre et l'ordre de travail. Ne pas
sauter la phase 0 (vérifications sur le format réel des données) avant
d'écrire du code d'ingestion : les hypothèses du cadrage sont à confirmer
sur la machine réelle, pas à supposer.

## État du projet

Phases 0 à 6 faites le 2026-09-28 — MVP complet selon `docs/plan-mvp.md`.

- Phase 0 — voir `docs/phase0-verifications.md`. Constats clés : format
  JSONL stable (usage détaillé par entrée `assistant`, y compris cache
  1h/5m), sous-agents dans `subagents/*.jsonl` à inclure, `cwd` comme clé
  de projet, `message.id` comme clé de déduplication. `/usage` fonctionne
  hors interactif via `claude -p "/usage"` et donne aussi la date/heure
  exacte de remise à zéro.
- Phase 1 — voir `docs/phase1-ingestion.md`. Commande `tokenmeter ingest`
  fonctionnelle, lecture incrémentale, stockage SQLite via `node:sqlite`
  (pas de dépendance native à compiler) dans `~/.tokenmeter/tokenmeter.db`.
  Totaux vérifiés à moins de 1 % de `ccusage` sur l'historique complet de
  la machine.
- Phase 2 — voir `docs/phase2-releves.md`. Commande `tokenmeter read
  <pct> [--session <pct>] [--dirty]` pour les relevés manuels, et
  `tokenmeter sync` pour les relevés automatiques via `claude -p "/usage"`.
  Tables `readings` et `resets` en place. `dirty` reste déclaratif (l'outil
  ne peut pas détecter l'usage claude.ai lui-même) ; le parsing de
  `/usage` est volontairement tolérant (texte en langage naturel, pas un
  format stable).

- Phase 3 — voir `docs/phase3-calibration.md`. Commande `tokenmeter
  calibrate [--min-delta <pct>]` : estime le stock hebdomadaire en dollars
  équivalent-API (`src/pricing.ts`, prix vérifiés sur la doc officielle le
  2026-09-28) à partir des tokens ingérés et de la hausse de jauge entre
  deux relevés propres (exclut `dirty`, les remises à zéro, et les
  hausses trop faibles). Médiane + déviation absolue médiane sur les
  intervalles. Logique testée sur données synthétiques ; pas encore assez
  de relevés réels sur cette machine pour une estimation en conditions
  réelles (il faut un second relevé propre dans la même semaine).

- Phase 4 — voir `docs/phase4-rythme.md`. Commande `tokenmeter pace`
  (usage estimé en continu via la dernière calibration, écoulement de
  semaine, projection linéaire de fin de semaine) et `tokenmeter
  by-project` (répartition du coût équivalent par projet). Dégradation
  gracieuse à chaque donnée manquante (pas de relevé, pas de calibration,
  pas de remise à zéro observée) plutôt que d'échouer. `pricing.ts` retombe
  désormais sur l'ID sans suffixe de date (`-YYYYMMDD`) pour les variantes
  datées non listées explicitement.

- Phase 5 — voir `docs/phase5-statusline.md`. Commande `tokenmeter
  statusline` : lit le JSON de Claude Code sur stdin (`cwd` /
  `workspace.current_dir`, confirmé sur la doc officielle), réutilise
  `computePace`, imprime `hebdo 62 % · semaine 55 % · +7 pts · projet X`.
  Se configure via `statusLine.command` dans `settings.json`.

- Phase 6 — voir `docs/phase6-publication.md`. Licence MIT choisie par
  l'utilisateur (`LICENSE`, `package.json`). README réécrit avec une
  section Méthodologie. Commande `tokenmeter export [--out <fichier>]` :
  exporte la table `calibrations`, anonyme par construction (ni chemin de
  projet, ni modèle, ni tokens bruts). `package.json` garde `"private":
  true` — publier sur npm et rendre le dépôt public restent des décisions
  de l'utilisateur, pas prises ici.

- Phase 7 (hors plan initial, 2026-10-06) — voir `docs/phase7-profils.md`.
  Support de plusieurs comptes Claude : profils dans
  `~/.tokenmeter/profiles.json` (`perso` = `~/.claude`, `pro` =
  `~/.claude-pro`), colonne `profile` sur toutes les tables, données
  antérieures rattachées à `perso`, `--profile` partout, `sync` par compte via
  `CLAUDE_CONFIG_DIR`.

Le MVP (phases 0 à 6) est couvert. Ce qui reste, au-delà : accumuler des
relevés réels sur plusieurs semaines pour une première calibration en
conditions réelles, étape B de la calibration (régression) si l'étape A
montre un biais, et les deux décisions de publication ci-dessus quand
l'utilisateur voudra les prendre.

## Conventions

- **Stack prévue :** TypeScript sur Node, stockage SQLite local,
  distribution via `npx`. Pas de serveur, pas de télémétrie sortante :
  toute donnée d'usage reste sur la machine.
- **Langue :** cadrage et documentation en français (le projet est piloté
  par un francophone) ; le code, les noms de variables et les messages
  d'erreur destinés aux utilisateurs finaux en anglais, pour rester
  publiable en l'état.
- **Commits :** un message par changement logique, en français, préfixé par
  la zone touchée (`ingestion:`, `calibration:`, `docs:`, etc.), à l'image
  du dépôt personnel dont ce projet est issu.
- **Rien n'est supposé mesurable sans vérification.** Le comportement de
  `/usage`, le format des fichiers JSONL, la durée des fenêtres : tout ça
  bouge côté Anthropic plus vite que ce dépôt. Revérifier avant de coder en
  dur une hypothèse, ne pas se fier à une réponse déjà écrite dans
  `cadrage.md` si elle date.
- **Toute estimation de quota s'affiche comme une estimation**, avec sa
  marge d'erreur si elle existe — jamais comme une valeur officielle
  d'Anthropic.
