# tokenmeter

Pilote local d'usage Claude : suivre le rythme de consommation par rapport
aux fenêtres du forfait, estimer la taille réelle du quota hebdomadaire par
calibration, et voir pour quels projets on consomme.

Projet destiné à une publication open source (phase 6 du plan). D'ici là,
le dépôt est privé.

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

Ces fichiers font autorité sur le périmètre et l'ordre de travail. Ne pas
sauter la phase 0 (vérifications sur le format réel des données) avant
d'écrire du code d'ingestion : les hypothèses du cadrage sont à confirmer
sur la machine réelle, pas à supposer.

## État du projet

Phase 0 (vérifications) et phase 1 (ingestion) faites le 2026-09-28.

- Phase 0 — voir `docs/phase0-verifications.md`. Constats clés : format
  JSONL stable (usage détaillé par entrée `assistant`, y compris cache
  1h/5m), sous-agents dans `subagents/*.jsonl` à inclure, `cwd` comme clé
  de projet, `message.id` comme clé de déduplication. `/usage` fonctionne
  hors interactif via `claude -p "/usage"` et donne aussi la date/heure
  exacte de remise à zéro — les relevés de jauge (phase 2) sont donc
  automatisables dès le départ, pas seulement manuels.
- Phase 1 — voir `docs/phase1-ingestion.md`. Commande `tokenmeter ingest`
  fonctionnelle, lecture incrémentale, stockage SQLite via `node:sqlite`
  (pas de dépendance native à compiler) dans `~/.tokenmeter/tokenmeter.db`.
  Totaux vérifiés à moins de 1 % de `ccusage` sur l'historique complet de
  la machine.

Prochaine étape : phase 2 (relevés de jauge), avec la commande `read` et,
vu le constat de la phase 0, une automatisation possible via
`claude -p "/usage"`.

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
