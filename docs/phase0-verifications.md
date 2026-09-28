# Phase 0 — Vérifications (constat du 2026-09-28)

Constat fait sur `/Users/alanbouo/.claude/projects/**/*.jsonl`, machine
réelle, avec Claude Code version 2.1.283. À revérifier si la version change
significativement — voir `CLAUDE.md`.

## 1. Format des fichiers JSONL

Chaque fichier `<session-id>.jsonl` est un flux d'événements, un JSON par
ligne. Types observés :

- `bridge-session` — parfois en première ligne, métadonnées de session
  (compte, organisation), pas d'usage. À ignorer pour l'ingestion.
- `assistant` — un tour de réponse du modèle, avec le champ `usage` qui
  nous intéresse.
- (d'autres types existent, ex. `user`, non explorés en détail — l'usage
  n'y est présent que côté `assistant`.)

Il existe aussi un sous-dossier `<session-id>/subagents/*.jsonl` pour les
appels de sous-agents (`isSidechain: true`). Dans un échantillon de ~200
fichiers, ~2 % des entrées `assistant` sont des sidechains. Elles consomment
du quota au même titre que le fil principal et **doivent être incluses**
dans l'ingestion — les exclure sous-estimerait la consommation réelle
(surtout sur les projets qui utilisent beaucoup de subagents).

### Champ `usage` (entrées `assistant`)

Stable sur tous les échantillons testés (projets et dates différents,
modèles `claude-sonnet-5` et `claude-opus-5-5`) :

```json
{
  "input_tokens": 2,
  "cache_creation_input_tokens": 23389,
  "cache_read_input_tokens": 31590,
  "output_tokens": 141,
  "output_tokens_details": { "thinking_tokens": 17 },
  "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 },
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 23389,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "not_available",
  "iterations": [ /* même détail par itération, si plusieurs appels API dans le tour */ ],
  "speed": "standard"
}
```

Points utiles pour l'ingestion :

- `cache_creation` distingue le cache 1h et 5m (deux tarifs API différents
  côté Anthropic) — utile dès l'étape A de la calibration (phase 3), où on
  pondère par les ratios de prix.
- `iterations` peut contenir plusieurs entrées si le tour a fait plusieurs
  appels API (agentic loop) — sommer `iterations[].input_tokens` etc. donne
  le même total que les champs de premier niveau ; dans le doute, se fier
  aux champs de premier niveau (`input_tokens`, `output_tokens`, etc. du
  `usage` racine), pas à la somme des itérations.

### Champs utiles hors `usage`

Sur chaque entrée `assistant` :

- `message.model` — nom du modèle (`claude-sonnet-5`, `claude-opus-5-5`,
  observés).
- `cwd` — chemin absolu du projet en cours ; **c'est le champ fiable pour
  classer par projet**, pas le nom du dossier `~/.claude/projects/<slug>/`
  (le slug est juste `cwd` avec les `/` remplacés par `-`, mais `cwd` est
  la source de vérité et lisible directement).
- `sessionId` / `session_id` (les deux présents, redondants) — identifiant
  de session.
- `timestamp` — horodatage ISO 8601 UTC (`Z`).
- `isSidechain` — `true` pour les appels de sous-agent.
- `gitBranch`, `version`, `entrypoint` — contexte additionnel, pas
  indispensable au MVP.

### Dédoublonnage

Utiliser `message.id` (ex. `msg_011CfVjLGnB6CwcyzwLKvjSq`) comme clé de
déduplication — c'est l'identifiant côté API, stable et unique par message
de réponse. Le champ `uuid` de l'entrée existe aussi mais c'est un
identifiant local à l'entrée JSONL, pas garanti unique côté API ; préférer
`message.id`.

### Étendue de l'historique disponible

Sur cette machine, les fichiers JSONL remontent au 2026-04-24 (le plus
ancien) jusqu'à aujourd'hui — plus de 5 mois d'historique. Largement de
quoi amorcer la calibration une fois les premiers relevés de jauge
disponibles. Cette étendue dépend de la politique de rétention locale de
Claude Code (non documentée officiellement) — ne pas supposer qu'elle sera
toujours aussi longue sur une autre machine.

## 2. `/usage` hors mode interactif

**Confirmé : `/usage` fonctionne en mode non-interactif**, via :

```
claude -p "/usage"
```

Sortie observée (2026-09-28) :

```
Current session: 44% used · resets Sep 28 at 3pm (Europe/Madrid)
Current week (all models): 16% used · resets Oct 4 at 4pm (Europe/Madrid)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include
other devices or claude.ai.
...
```

Conséquences pour le plan :

- **Les relevés de jauge (phase 2) sont automatisables.** On peut lancer
  `claude -p "/usage"` périodiquement (cron, ou hook) et parser la sortie
  texte pour extraire le pourcentage hebdomadaire et de session — pas
  besoin de saisie manuelle comme le MVP l'envisageait par défaut.
- La sortie donne aussi **la date et l'heure exactes de remise à zéro**,
  directement, en toutes lettres et dans le fuseau horaire local
  (`Europe/Madrid` observé ici) — répond aussi à la question 3 sans calcul
  a priori.
- Attention : c'est une sortie texte en langage naturel, pas un JSON
  structuré. Le parsing devra être tolérant aux reformulations (ex.
  variations de formulation d'une version de Claude Code à l'autre) et
  vérifié à nouveau si le format change — cohérent avec l'avertissement du
  `CLAUDE.md` sur la fragilité de ces éléments.
- Cette invocation compte-t-elle elle-même dans l'usage capturé (double
  overhead) ? Non vérifié précisément, mais l'appel est minimal (une seule
  commande, pas de contexte de conversation) — impact négligeable a priori,
  à confirmer si la calibration montre un biais systématique.

## 3. Jour et heure de remise à zéro du plafond hebdomadaire

Pas besoin de le déduire indirectement : `/usage` l'affiche directement
(`resets Oct 4 at 4pm (Europe/Madrid)` observé le 2026-09-28, pour une
semaine qui a donc démarré le 2026-09-27 aux alentours de 16h, fuseau
local). Le jour de la semaine et l'heure ne semblent pas fixes en valeur
absolue universelle mais propres au cycle de facturation du compte — donc
à lire à chaque fois via `/usage`, pas à coder en dur.

## Conclusion — impact sur le plan

- Phase 1 (ingestion) : le format JSONL confirmé permet de commencer sans
  divergence par rapport aux hypothèses de `cadrage.md`. Ajout à prévoir :
  inclure les fichiers `subagents/*.jsonl`, utiliser `cwd` pour le projet
  et `message.id` pour la déduplication.
- Phase 2 (relevés) : peut être automatisée dès le départ via
  `claude -p "/usage"` + parsing texte, au lieu d'une saisie manuelle
  systématique. Garder la commande manuelle `read` en secours si le
  parsing casse, et pour les relevés `--dirty` (usage claude.ai) qui
  restent hors de portée de `/usage`.
- Phase 3 (calibration) : le détail `cache_creation` (1h vs 5m) donne un
  levier de pondération plus fin que prévu pour l'étape A.

**Livrable de la phase 0 : cette note.** Prochaine étape proposée : phase 1
(ingestion), avec la commande `ingest` qui lit `~/.claude/projects/**/*.jsonl`
(y compris `subagents/`), déduplique par `message.id`, et alimente la table
`events`.
