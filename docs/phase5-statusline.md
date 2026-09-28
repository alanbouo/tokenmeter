# Phase 5 — Statusline (constat du 2026-09-28)

## Ce qui a été construit

- `tokenmeter statusline` — lit le JSON envoyé par Claude Code sur stdin
  (champ `cwd` ou `workspace.current_dir`, confirmé sur
  `https://code.claude.com/docs/en/statusline` le 2026-09-28), calcule le
  rythme via `computePace` (déjà en place depuis la phase 4), et imprime
  une ligne compacte : `hebdo 62 % · semaine 55 % · +7 pts · projet X`.
- `src/statusline.ts` (`formatStatusline`) — dégrade segment par segment :
  pas de relevé → message d'invite à lancer `sync` ; pas de bornes de
  semaine connues → pas de segment `semaine`/`+N pts` ; pas de JSON stdin
  ou champ `cwd` absent → pas de segment `projet`.

## Configuration

Dans `~/.claude/settings.json` (ou les settings du projet) :

```json
{
  "statusLine": {
    "type": "command",
    "command": "tokenmeter statusline"
  }
}
```

Claude Code exécute cette commande à chaque événement (nouveau tour,
changement de répertoire, etc.) et affiche tel quel ce qu'elle imprime sur
stdout. Pas de `refreshInterval` configuré par défaut : l'estimation ne
bouge qu'avec l'activité (nouveaux tokens ingérés), donc le rafraîchissement
événementiel suffit ; l'ajouter reste possible si on veut un affichage qui
avance même pendant un tour d'outil long.

## Vérifié

Testé en pipant un JSON minimal (`cwd`, `workspace.current_dir`) sur stdin :
`hebdo 16 % · projet tokenmeter` — conforme au format cible, avec le
segment `semaine`/`+pts` absent puisqu'aucune remise à zéro n'a encore été
observée sur cette machine (cohérent avec la phase 4).

## Limites assumées

- **`tokenmeter statusline` relit la base SQLite à chaque appel** (pas de
  cache). Sur l'historique actuel de cette machine (quelques milliers
  d'événements), c'est rapide ; à surveiller si le volume grossit
  beaucoup, vu que Claude Code peut appeler la statusline plusieurs fois
  par minute.
- **N'ingère pas de nouveaux événements.** `statusline` lit ce qui est déjà
  dans la base — sans `tokenmeter ingest` régulier (cron, ou lancé à la
  main), l'estimation en continu se fige au dernier ingest. Automatiser
  l'ingestion est hors périmètre du MVP (voir `docs/cadrage.md`, pas de
  démon prévu).
- **Le JSON de `/docs/statusline`** est documenté comme stable, mais reste
  une interface Claude Code externe au projet — à revérifier si le nom des
  champs change (même prudence que pour `/usage`, voir phase 0).

## Prochaine étape

Phase 6 — publication open source : README avec section méthodologie,
commande `export` des rapports de calibration anonymisés, choix de
licence.
