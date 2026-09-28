# Cadrage

## Le besoin de départ

Pouvoir gérer sa consommation de tokens de l'abonnement Claude pour ne pas
sur- ou sous-consommer, avec de la visibilité sur le volume utilisé et sur
les usages associés (par projet). Objectif secondaire : en faire un outil
open source communicable.

## Ce qu'on peut réellement mesurer

Les forfaits Pro et Max ne publient pas de quota en tokens. Il existe deux
fenêtres d'usage, affichées en pourcentage :

- une **session glissante** d'environ 5h ;
- un **plafond hebdomadaire**.

| Source | Ce qu'on obtient | Accès |
|---|---|---|
| Claude Code, historique local (`~/.claude/projects/**/*.jsonl`) | Tokens par message (entrée, sortie, cache), modèle, horodatage, dossier projet | Lecture directe de fichiers, fiable |
| Claude Code, télémétrie OpenTelemetry | Métriques de tokens et de coût en continu | À activer par variable d'environnement |
| Claude Code, `/usage` ou `/status` | Pourcentage consommé des limites du forfait | Affiché en interactif ; automatisable ou non, à vérifier (phase 0 du plan) |
| claude.ai (web, mobile, desktop) | Barres de pourcentage dans Réglages → Usage | Aucune API publique ; scraping fragile et hors périmètre |

L'usage Claude Code est mesurable finement. L'usage sur claude.ai reste en
grande partie invisible sans saisie manuelle. C'est une limite structurelle
à assumer, pas un défaut à corriger dans le MVP.

## Le plafond hebdomadaire est un stock, pas juste un compteur

Deux propriétés déterminent la conception de l'outil :

1. **Le stock est périssable.** Ce qui n'est pas consommé avant la remise à
   zéro est perdu, sans report. Un reste en fin de semaine est une perte
   sèche, pas une économie — d'où l'intérêt de détecter la
   sous-consommation autant que le dépassement.
2. **L'unité du stock n'est pas publique.** On observe un pourcentage
   consommé, pas une quantité de tokens. D'où la nécessité de calibrer.

La fenêtre de 5h est un plafond de *débit*, secondaire : elle peut bloquer
temporairement même s'il reste du stock hebdomadaire, mais elle ne
détermine pas le budget de la semaine.

## Positionnement face à l'existant

`ccusage` et `Claude-Code-Usage-Monitor` comptent déjà les tokens Claude
Code à partir des mêmes fichiers JSONL. Refaire un compteur n'apporterait
rien de neuf et se remarquerait mal.

Le différenciateur de `tokenmeter` : **relier les tokens mesurés au stock
réel du forfait**, par calibration, pour répondre à « suis-je dans le bon
rythme » plutôt qu'à « combien j'ai consommé ». Voir
[`plan-mvp.md`](plan-mvp.md) phase 3 pour le mécanisme.

## Limites assumées dès le départ

- L'estimation du stock est une calibration statistique, pas une valeur
  officielle. Elle varie selon le modèle utilisé, l'usage du cache, et peut
  changer si Anthropic modifie ses règles — sans préavis ni annonce
  garantie.
- L'usage sur claude.ai (hors Claude Code) reste une zone aveugle tant
  qu'il n'est pas saisi manuellement.
- Le nom des fenêtres, leur durée exacte, et le comportement de `/usage`
  hors mode interactif sont à revérifier au moment de coder (phase 0 du
  plan) : ces éléments évoluent vite côté Anthropic.

## Hors périmètre du MVP

- Scraping de claude.ai.
- Recommandation d'usage ou arbitrage à la place de l'utilisateur : l'outil
  informe, il ne décide pas.
- Mise en commun communautaire des calibrations (envisagée en phase 6,
  seulement après un MVP stable).
