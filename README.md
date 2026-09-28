# tokenmeter

Pilote local d'usage Claude : suivre son rythme de consommation par rapport
aux fenêtres du forfait (session glissante ~5h, quota hebdomadaire), estimer
la taille réelle du quota par calibration, et savoir pour quels projets on
consomme.

Statut : MVP fonctionnel (phases 0 à 5 du plan faites). Aucune donnée ne
quitte la machine : tout est lu depuis les fichiers locaux de Claude Code et
stocké dans une base SQLite locale (`~/.tokenmeter/tokenmeter.db`).

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
  automatisés via `claude -p "/usage"`).

En comparant la hausse de tokens consommés à la hausse du pourcentage entre
deux relevés propres (même semaine, pas de remise à zéro entre les deux, pas
d'usage claude.ai invisible dans l'intervalle), on peut **estimer la taille
du quota hebdomadaire**, en unités calibrées sur les prix de l'API. Cette
estimation est présentée comme une estimation, avec sa marge d'erreur — pas
comme une certitude.

C'est ce qui distingue l'outil des simples compteurs de tokens : il répond
à « suis-je dans le bon rythme, et vais-je perdre du stock ou dépasser le
plafond en fin de semaine », pas seulement « combien j'ai consommé ».

## Installation

```bash
git clone <url-du-dépôt>
cd tokenmeter
npm install
npm run build
```

Nécessite Node ≥ 22.5 (utilise le module natif `node:sqlite`, encore
marqué expérimental par Node à ce jour — voir
[`docs/phase1-ingestion.md`](docs/phase1-ingestion.md)).

Une fois construit :

```bash
node bin/tokenmeter.js <commande>
# ou, après `npm link` :
tokenmeter <commande>
```

## Commandes

| Commande | Rôle |
|---|---|
| `ingest` | Lit `~/.claude/projects/**/*.jsonl` (y compris les sous-agents) dans la base locale. Incrémental. |
| `read <pct> [--session <pct>] [--dirty]` | Enregistre un relevé de jauge à la main. |
| `sync` | Enregistre un relevé automatiquement via `claude -p "/usage"`. |
| `calibrate [--min-delta <pct>]` | Estime le stock hebdomadaire à partir des relevés et des tokens ingérés. |
| `pace` | Compare l'usage estimé au temps écoulé de la semaine, projette la fin de semaine. |
| `by-project` | Répartit le coût équivalent de la semaine en cours par projet. |
| `statusline` | Ligne compacte pour l'intégration `statusLine` de Claude Code. |
| `export [--out <fichier>]` | Exporte les rapports de calibration (anonymisés) en JSON. |

Chaque commande a sa note de phase associée dans `docs/` (voir
[À lire avant de coder](CLAUDE.md#à-lire-avant-de-coder) pour le détail des
décisions et limites de chacune).

### Usage typique

```bash
tokenmeter ingest              # à lancer régulièrement (cron, ou à la main)
tokenmeter sync                # relevé de jauge, à répéter dans la semaine
tokenmeter calibrate           # une fois au moins deux relevés propres accumulés
tokenmeter pace                # voir le rythme actuel
tokenmeter by-project          # voir qui consomme quoi cette semaine
```

Pour la statusline, dans `~/.claude/settings.json` :

```json
{
  "statusLine": { "type": "command", "command": "tokenmeter statusline" }
}
```

## Méthodologie

**Le principe.** Entre deux relevés consécutifs de jauge hebdomadaire, la
hausse du pourcentage affiché doit correspondre aux tokens réellement
consommés dans l'intervalle :

```
stock estimé = coût équivalent des tokens consommés / (hausse de jauge en points / 100)
```

Le « coût équivalent » convertit chaque token (entrée, sortie, écriture
cache 5 minutes ou 1 heure, lecture cache) en dollars, aux **prix publiés de
l'API Anthropic** (voir `src/pricing.ts`, tarifs vérifiés à la date indiquée
dans le fichier). L'estimation finale est la **médiane** des estimations
obtenues sur chaque intervalle « propre », avec la **déviation absolue
médiane** comme indicateur de marge.

**Ce qu'on exclut d'un intervalle** (voir
[`docs/phase3-calibration.md`](docs/phase3-calibration.md)) :

- les intervalles marqués `dirty` (usage claude.ai possible entre les deux
  relevés, invisible dans les tokens Claude Code) ;
- les intervalles qui traversent une remise à zéro hebdomadaire détectée ;
- les intervalles où la jauge a trop peu bougé (seuil configurable via
  `--min-delta`, pas figé en dur — la jauge est arrondie au point près,
  donc bruitée en-dessous d'un seuil).

**Hypothèses assumées, pas des certitudes :**

- Les ratios de prix API (entrée/sortie/cache par modèle) sont utilisés
  comme pondération de départ. Rien ne garantit que c'est ainsi que le
  forfait facture en interne — c'est justement ce que la calibration permet
  de vérifier en pratique, pas une prémisse tenue pour acquise.
- L'usage sur claude.ai (hors Claude Code) reste une zone aveugle tant qu'il
  n'est pas déclaré manuellement (`--dirty`).
- Le format des fichiers JSONL, le comportement de `/usage` hors interactif,
  et la durée des fenêtres peuvent changer côté Anthropic sans préavis —
  voir [`docs/phase0-verifications.md`](docs/phase0-verifications.md) pour
  le constat à la date de vérification, à reconfirmer si le comportement
  semble avoir changé.

**Toute estimation de quota s'affiche comme une estimation**, avec sa marge
quand elle existe — jamais comme une valeur officielle d'Anthropic. C'est
une règle du projet, pas une formule de politesse : voir
[`CLAUDE.md`](CLAUDE.md).

**Étape suivante non implémentée (v2, hors MVP)** : apprendre les
pondérations par régression sur l'ensemble des intervalles plutôt que
reprendre les prix API tels quels — permettrait de vérifier si, par
exemple, la lecture de cache pèse vraiment ce que coûte son équivalent API
dans le calcul interne du forfait.

## Voir aussi

- [`docs/cadrage.md`](docs/cadrage.md) — le cadrage complet : problème,
  positionnement, sources de données et leurs limites.
- [`docs/plan-mvp.md`](docs/plan-mvp.md) — le plan de MVP détaillé par
  phase, avec le critère de fin de chacune.
- `docs/phase0-verifications.md` à `docs/phase5-statusline.md` — le constat
  et les décisions prises à chaque phase, avec leurs limites assumées.

## Licence

[MIT](LICENSE).
