# Phase 2 — Relevés de jauge (constat du 2026-09-28)

## Ce qui a été construit

- `tokenmeter read <pourcentage> [--session <pourcentage>] [--dirty]` —
  relevé manuel, prend une fraction de seconde à saisir (une seule
  commande, un seul nombre obligatoire). Critère de fin de la phase
  respecté.
- `tokenmeter sync` — relevé **automatique**, via `claude -p "/usage"`
  (confirmé non-interactif en phase 0). Parse la sortie texte
  (`src/usage-parser.ts`), enregistre un relevé `source: 'auto'`, et
  détecte les nouvelles dates de remise à zéro annoncées.
- Table `readings` : horodatage, `weekly_pct`, `session_pct` (optionnel),
  `dirty`, `source` (`manual` ou `auto`).
- Table `resets` : une ligne par libellé de remise à zéro observé pour la
  première fois (`week` ou `session`), avec le texte brut annoncé
  (`reset_label`) et une tentative de conversion en instant ISO
  (`reset_at`, peut être `null` si le format ne correspond pas au motif
  attendu).

## Limites assumées

- **`dirty` reste déclaratif.** `sync` ne peut pas savoir si de l'usage
  claude.ai a eu lieu depuis le dernier relevé — seul l'utilisateur le
  sait. Un relevé automatique est donc toujours `dirty = 0` ; si de
  l'usage claude.ai a eu lieu, il faut repasser par
  `tokenmeter read <pct> --dirty` pour le signaler explicitement.
- **Le parsing de `/usage` est fragile par nature** (texte en langage
  naturel, pas un format stable) : `usage-parser.ts` retourne `null`
  plutôt que de planter si une ligne ne correspond plus au motif attendu.
  `sync` échoue proprement avec un message clair si le pourcentage
  hebdomadaire n'a pas pu être trouvé.
- **`reset_at` suppose que le fuseau horaire de la machine correspond à
  celui affiché par `/usage`** (ex. `Europe/Madrid`). Vérifié correct sur
  cette machine (le fuseau système correspond), mais pas garanti sur une
  autre configuration — le `reset_label` brut est conservé dans tous les
  cas comme source de vérité, `reset_at` n'est qu'une commodité dérivée.
- Le dédoublonnage de `resets` se fait sur `(window, reset_label)` :
  tant que la remise à zéro annoncée ne change pas, des appels répétés à
  `sync` n'ajoutent pas de doublon.

## Vérifié en conditions réelles

`tokenmeter sync` exécuté sur cette machine le 2026-09-28 a correctement
enregistré weekly 16 % / session 49 %, et calculé `reset_at` cohérent avec
les libellés affichés (`Oct 4 at 4pm` → `2026-10-04T14:00:00.000Z`, `Sep 28
at 3pm` → `2026-09-28T13:00:00.000Z`, cohérent avec l'heure d'été
Europe/Madrid, UTC+2).

## Prochaine étape

Phase 3 — calibration : une fois plusieurs relevés accumulés dans une même
semaine, estimer le stock hebdomadaire en unités équivalent-coût à partir
des tokens ingérés (`events`) et de la hausse de jauge observée
(`readings`), en excluant les intervalles `dirty` ou traversant une remise
à zéro (`resets`).
