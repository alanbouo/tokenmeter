# Phase 7 — plusieurs comptes Claude (profils)

Chaque compte Claude a sa propre jauge, sa propre remise à zéro et son
propre stock hebdomadaire. Mélanger leurs relevés fausse la calibration, `pace`
et la statusline. Un **profil** = un compte = un `CLAUDE_CONFIG_DIR`.

## Configuration

`~/.tokenmeter/profiles.json` (géré par `tokenmeter profiles add <nom> <dir>`) :

```json
{
  "perso": { "configDir": "/Users/<moi>/.claude" },
  "pro":   { "configDir": "/Users/<moi>/.claude-pro" }
}
```

Sans ce fichier, un seul profil implicite `perso` couvre `~/.claude` : une
installation à compte unique continue de fonctionner sans rien changer. Une
clé optionnelle `sources` (liste de répertoires) rattache à un profil des
miroirs d'historique d'autres machines.

## Comportement

- **Schéma** : colonne `profile` sur `events`, `readings`, `resets`,
  `calibrations` ; `resets` est unique par `(profile, window, reset_label)`.
  La migration est automatique à l'ouverture de la base : toutes les données
  antérieures sont rattachées au profil `perso` (choix de l'utilisateur —
  c'était son seul compte à l'époque). `resets` est reconstruite (SQLite ne
  modifie pas une contrainte UNIQUE).
- **Profil courant** (`read`, `calibrate`, `pace`, `by-project`, `export`,
  `statusline`) : `--profile <nom>`, sinon `TOKENMETER_PROFILE`, sinon le
  profil dont le `configDir` correspond à `CLAUDE_CONFIG_DIR` (défaut
  `~/.claude`). Si rien ne correspond et qu'il y a plusieurs profils :
  erreur explicite (la statusline affiche `unknown profile` plutôt que
  d'échouer).
- **`ingest` et `sync`** couvrent tous les profils par défaut ; `--profile`
  restreint à un seul. `sync` continue sur les autres profils si l'un échoue
  (code de sortie 1, erreur rappelée sur stderr).
- **`sync`** lance `claude -p "/usage"` avec `CLAUDE_CONFIG_DIR` du profil.
  Pour le dossier par défaut (`~/.claude`) la variable est *retirée* de
  l'environnement : Claude Code indexe ses identifiants sur la présence de la
  variable, la poser explicitement sur le chemin par défaut risque de viser
  une autre entrée d'identifiants.
- **`--source` / `TOKENMETER_SOURCES`** (miroirs VPS) sont rattachés au profil
  sélectionné (`--profile`, sinon profil courant). `scripts/refresh.sh`, sans
  `CLAUDE_CONFIG_DIR`, les rattache donc à `perso`, comme avant.
- **Statusline** : préfixée `[nom]` dès qu'il y a plusieurs profils.
- **`export`** exporte les calibrations d'un profil ; le nom du profil n'est
  pas dans la sortie.

## Vérifié le 2026-10-06

Migration testée sur une copie de la base réelle (12 710 événements, 92
relevés, 42 remises à zéro tous passés en `perso`). `sync` réel sur les deux
comptes : jauges et dates de remise à zéro distinctes (perso 37 %, remise le
11 oct. ; pro 1 %, remise le 9 oct.).

## Limites

- Un `message.id` identique dans deux profils serait compté pour le premier
  ingéré seulement (clé primaire globale) — jamais observé.
- La détection du profil par la statusline suppose que Claude Code transmet
  `CLAUDE_CONFIG_DIR` à la commande `statusLine` : à confirmer à l'usage ;
  sinon, ajouter `--profile <nom>` dans la commande du `settings.json` de
  chaque compte.
