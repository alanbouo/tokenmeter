# Phase 1 — Ingestion (constat du 2026-09-28)

## Ce qui a été construit

- `tokenmeter ingest` lit tous les `~/.claude/projects/**/*.jsonl` (y
  compris les sous-dossiers `subagents/`, voir phase 0), de façon
  incrémentale : la position déjà lue de chaque fichier est mémorisée dans
  la table `ingest_state`, donc une ré-exécution ne retraite que les octets
  ajoutés depuis.
- Table `events` : une ligne par entrée `assistant` avec `usage`, clé
  primaire `message.id` (dédoublonnage — `INSERT OR IGNORE`). Colonnes :
  `timestamp`, `model`, `project` (= `cwd` de l'entrée), `session_id`,
  `is_sidechain`, tokens d'entrée/sortie, cache écrit/lu, et le détail
  cache 1h/5m pour la calibration future (phase 3).
- Stockage SQLite via le module natif `node:sqlite` de Node (pas de
  dépendance native à compiler type `better-sqlite3` — plus simple à
  distribuer par `npx`). Encore marqué expérimental par Node ; le
  warning est filtré dans `bin/tokenmeter.js` sans masquer les autres.
  Base par défaut : `~/.tokenmeter/tokenmeter.db` (pas dans le dépôt projet
  — l'usage est global à la machine, pas par projet).

## Vérification du critère de fin

Comparé aux totaux de `npx ccusage claude daily --json` sur la même
machine, même historique complet (2026-04-24 → 2026-09-28, 151 fichiers,
9343 événements ingérés) :

| Métrique | tokenmeter | ccusage | écart |
|---|---:|---:|---:|
| input tokens | 18 693 | 18 699 | 0,03 % |
| output tokens | 6 764 882 | 6 829 937 | 0,95 % |
| cache creation tokens | 44 804 243 | 44 805 602 | 0,003 % |
| cache read tokens | 1 858 881 188 | 1 859 151 741 | 0,015 % |

Concordance à moins de 1 % sur les quatre métriques. L'écart le plus
visible (sortie, ~1 %) n'a pas été creusé plus loin : hypothèse la plus
probable, une différence de traitement des tokens de raisonnement
(`output_tokens_details.thinking_tokens`) — inclus ou non dans
`output_tokens` selon l'outil. À revisiter si la calibration (phase 3)
montre un biais systématique lié au raisonnement étendu ; sinon, ce niveau
d'écart est jugé suffisant pour le MVP (l'objectif de tokenmeter n'est pas
de reproduire ccusage au token près, mais de mesurer un rythme relatif).

Vérification annexe : exclure les entrées `isSidechain` (sous-agents)
dégrade la concordance sur les tokens d'entrée (18 397 au lieu de 18 693,
soit un écart de 1,6 % au lieu de 0,03 %) — confirme la décision de la
phase 0 de les inclure.

## Points ouverts

- La ré-exécution répétée de `ingest` reste bon marché (lecture
  incrémentale), mais n'a pas été testée sur un fichier tronqué en cours
  d'écriture (troncature vs. simple ajout) — cas rare en pratique, à
  surveiller.
- `node:sqlite` est expérimental côté Node ; si l'API change dans une
  version future de Node, `src/db.ts` est le seul point de contact à
  ajuster.
