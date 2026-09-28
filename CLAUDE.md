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

Ces deux fichiers font autorité sur le périmètre et l'ordre de travail. Ne
pas sauter la phase 0 (vérifications sur le format réel des données) avant
d'écrire du code d'ingestion : les hypothèses du cadrage sont à confirmer
sur la machine réelle, pas à supposer.

## État du projet

Cadrage posé, aucun code écrit. Prochaine étape : phase 0 du plan
(vérifications sur le format JSONL, sur l'automatisation de `/usage`, sur
l'heure de remise à zéro hebdomadaire).

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
