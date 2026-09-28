# tokenmeter

Pilote local d'usage Claude : suivre son rythme de consommation par rapport
aux fenêtres du forfait (session glissante ~5h, quota hebdomadaire), estimer
la taille réelle du quota par calibration, et savoir pour quels projets on
consomme.

Statut : cadrage. Aucun code encore.

## Le problème

Les abonnements Claude (Pro, Max) ne fonctionnent pas avec un stock de
tokens affiché : Anthropic expose des pourcentages consommés sur deux
fenêtres — une session glissante d'environ 5h et un plafond hebdomadaire —
sans publier la taille du quota en tokens.

Le plafond hebdomadaire est un vrai **stock périssable** : ce qui n'est pas
consommé avant la remise à zéro est perdu, sans report. Sous-consommer a donc
un coût réel, au même titre que dépasser le plafond.

Deux zones d'ombre empêchent aujourd'hui de piloter ce stock :

1. **L'unité n'est pas publique.** On voit un pourcentage, pas un nombre de
   tokens. Impossible de savoir a priori combien de marge il reste en tokens.
2. **claude.ai n'expose aucune API d'usage.** Seul Claude Code laisse une
   trace exploitable (fichiers JSONL locaux, télémétrie OpenTelemetry).

Des outils existent déjà pour compter les tokens de Claude Code (ccusage,
Claude-Code-Usage-Monitor). Refaire un compteur n'apporte rien de neuf.

## L'angle : calibrer le stock, pas seulement compter les tokens

`tokenmeter` croise deux sources :

- les tokens mesurés dans les fichiers JSONL de Claude Code (fiables, par
  message, par modèle, par projet) ;
- les relevés du pourcentage affiché par Anthropic (saisis à la main, ou
  automatisés si `/usage`/`/status` s'y prête).

En comparant la hausse de tokens consommés à la hausse du pourcentage entre
deux relevés propres (même semaine, pas de remise à zéro entre les deux, pas
d'usage claude.ai invisible dans l'intervalle), on peut **estimer la taille
du quota hebdomadaire**, en unités calibrées sur les prix de l'API. Cette
estimation est présentée comme une estimation, avec sa marge d'erreur — pas
comme une certitude.

C'est ce qui distingue l'outil des simples compteurs de tokens : il répond
à « suis-je dans le bon rythme, et vais-je perdre du stock ou dépasser le
plafond en fin de semaine », pas seulement « combien j'ai consommé ».

## Voir aussi

- [`docs/cadrage.md`](docs/cadrage.md) — le cadrage complet : problème,
  positionnement, sources de données et leurs limites.
- [`docs/plan-mvp.md`](docs/plan-mvp.md) — le plan de MVP détaillé par phase.

## Licence

À définir avant la première publication publique (phase 6 du plan).
