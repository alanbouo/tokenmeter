# Plan du MVP

Voir [`cadrage.md`](cadrage.md) pour le problème et le positionnement.

## Ce que le MVP doit faire

1. Mesurer la consommation Claude Code en tokens, classée par projet.
2. Relier cette mesure à la jauge hebdomadaire du forfait, pour estimer la
   taille du stock.
3. Dire à tout moment si on est en avance, dans le rythme, ou en passe de
   perdre du stock en fin de semaine.

**Stack proposée :** TypeScript sur Node, stockage SQLite en local,
distribution via `npx`. Aucun serveur, aucune donnée ne sort de la machine.

---

## Phase 0 — Vérifications (une demi-journée)

Avant d'écrire du code, confirmer sur la machine réelle :

- Le format actuel des fichiers JSONL : quels champs `usage` sont présents,
  comment sont enregistrés le modèle et le dossier du projet.
- Si `/usage` (ou `/status`) peut s'exécuter hors mode interactif. Si oui,
  les relevés de jauge peuvent être automatisés ; sinon, ils restent
  manuels dans le MVP.
- Le jour et l'heure de remise à zéro du plafond hebdomadaire.

**Livrable :** une note courte sur le format réel constaté. Tout le reste
s'appuie dessus — ne pas supposer, vérifier.

## Phase 1 — Ingestion

- Lecture incrémentale de `~/.claude/projects/**/*.jsonl`, en mémorisant
  jusqu'où chaque fichier a été lu.
- Dédoublonnage par identifiant de message.
- Table `events` : horodatage, modèle, projet, tokens d'entrée, de sortie,
  d'écriture cache, de lecture cache.
- Commande `ingest`.

**Critère de fin :** les totaux concordent avec ceux de ccusage sur la
même période.

## Phase 2 — Relevés de jauge

- Commande `read <pourcentage> [--session <pourcentage>]` : enregistre le
  pourcentage hebdomadaire affiché, et en option celui de la fenêtre de 5h,
  avec l'horodatage.
- Option `--dirty` : signale un usage claude.ai depuis le relevé précédent.
- Table `readings` : horodatage, pourcentage hebdomadaire, pourcentage de
  session, indicateur `dirty`.
- Table `resets` : dates de remise à zéro, pour découper les semaines.

**Critère de fin :** un relevé prend moins de 5 secondes à saisir.

À démarrer dès que possible, même avant que le reste soit prêt : la
calibration (phase 3) ne produit une estimation qu'une fois quelques
relevés accumulés.

## Phase 3 — Calibration (cœur du projet)

**Principe.** Entre deux relevés consécutifs de la même semaine, la hausse
de la jauge doit correspondre aux tokens consommés dans l'intervalle.

**Étape A — un seul paramètre (MVP) :**
- Les tokens sont convertis en une **unité équivalent-coût**, pondérée par
  les ratios de prix de l'API (par modèle et par type de token : entrée,
  sortie, cache). Hypothèse de départ, affichée comme telle.
- Pour chaque intervalle propre : estimation du stock = unités consommées
  ÷ (hausse de la jauge en points ÷ 100).
- Estimation finale : médiane des intervalles, avec leur dispersion comme
  indicateur de fiabilité.

**Filtres sur les intervalles :**
- Exclure les intervalles marqués `dirty` (usage claude.ai invisible) et
  ceux qui traversent une remise à zéro.
- Exclure les intervalles où la jauge a trop peu bougé (arrondie au point
  près, donc bruitée en-dessous d'un seuil). Seuil configurable, pas fixé
  en dur.

**Étape B — v2 :** régression sur l'ensemble des intervalles, pour
**apprendre les pondérations** au lieu de reprendre les prix de l'API.
Permettrait de vérifier si la lecture du cache pèse vraiment ce que coûte
son équivalent API.

**Commande `calibrate` :** affiche le stock estimé, le nombre
d'intervalles utilisés, la dispersion, la date de la dernière calibration.

**Critère de fin :** au moins une estimation produite, avec sa marge
affichée.

## Phase 4 — Rythme et projection

- Commande `pace` : pourcentage consommé contre pourcentage de la semaine
  écoulé.
- Projection en fin de semaine au rythme actuel : dépassement prévu (à
  quelle date) ou stock perdu (combien de points).
- Entre deux relevés, jauge estimée en continu : dernier relevé + tokens
  consommés depuis, convertis via la calibration.
- Commande `by-project` : répartition de la semaine par projet, en
  pourcentage du stock.

## Phase 5 — Statusline

- Ligne compacte dans Claude Code, ex. :
  `hebdo 62 % · semaine 55 % · +7 pts · projet X`.
- Fonction d'usage quotidien de l'outil.

## Phase 6 — Publication open source

- README avec une section **Méthodologie** expliquant la calibration, ses
  hypothèses et ses limites — c'est ce qui distingue l'outil et ce qui se
  communique.
- Commande `export` des rapports de calibration, anonymisés.
- Option ultérieure (hors MVP) : mise en commun volontaire des rapports de
  calibration par forfait, pour une estimation collective des stocks.

---

## Ordre et effort

| Phase | Taille indicative |
|---|---|
| 0 Vérifications | Demi-journée |
| 1 Ingestion | Petite |
| 2 Relevés | Petite |
| 3A Calibration | Moyenne |
| 4 Rythme | Petite |
| 5 Statusline | Petite |
| 6 Publication | Moyenne (surtout rédaction) |

Les phases 1 à 4 forment le MVP utilisable.

## Points ouverts

- TypeScript confirmé, ou Python à évaluer.
- Licence à choisir avant la phase 6.
- Résultat de la phase 0 sur `/usage` hors interactif : détermine si les
  relevés restent manuels ou deviennent automatisables.
