# Feed v4.3 — Fresh-first reservation

Implemented 24 September 2026.

## Product rule

For Indegenius at its current stage, recent legitimate publications must receive visible distribution before older historical winners are allowed to dominate Home.

Feed v4.3 therefore changes new-content protection from a lane preference into a **selection-stage reservation**.

## First-screen contract

For each 12-card For You window:

- reserve up to **5 protected fresh positions first**;
- protected fresh means published within the previous **72 hours** and not yet qualified-read by this reader;
- lightweight viewport impressions do **not** remove protection;
- then allow personalized, discovery, trending, evergreen and score backfill to fill the remaining positions.

If five eligible recent publications exist, older high-performing inventory cannot take those five reserved positions.

The fresh cards remain interleaved through the screen rather than appearing as one chronological block.

## Fresh ordering

Protected recent inventory is ordered independently of the general ranking score:

1. 0–24 hour publications before 24–48 hour publications;
2. 24–48 hour publications before 48–72 hour publications;
3. fewer prior viewer impressions first;
4. publications still below the initial 30 global-impression test audience first;
5. lower global exposure first;
6. reader fit / early satisfaction / recency as tie-breakers.

This ordering prevents an older or already-popular publication from winning a protected new-content slot merely because it has accumulated stronger historical engagement.

## Consumption rule

A viewport impression is intentionally not treated as consumption. The current impression event is lightweight enough that a reader may have simply scrolled past the card.

For v4.3, a **qualified read** is the hard signal that removes a publication from the protected fresh allocation for that reader. Impression count still affects ordering and novelty, but does not veto fresh protection.

A stronger explicit negative signal (for example Not interested / repeated meaningful skips) can be added later without weakening the fresh-first contract.

## Diversity

Author/topic diversity is still preferred while selecting protected fresh inventory. If the recent inventory is concentrated, the system does not silently hand protected positions back to old winners solely to satisfy a soft diversity preference.

## Live sessions

The v4.2 live-session layer remains intact. Post-snapshot publications can still enter continuation pages without re-ranking the frozen snapshot. v4.3 aligns that layer with the same consumption rule: a qualified read excludes a live-fresh candidate; lightweight impressions alone do not.

## Unchanged

- 72-hour new-content window.
- 5 protected positions per 12-card ranked window when inventory allows.
- v4 stable signed snapshot pagination.
- up to 2 live-fresh continuation cards per page.
- 192-candidate first-page universe.
- Following remains chronological.
- satisfaction, affinity, exploration decay and qualified-read definitions remain unchanged.

## Attribution

- Algorithm version: `feed-v4.3.0`.
- Experiment variant: `ranking_v4`.
- Protected first-page/window source: `for_you_fresh`.
- Post-snapshot live source: `for_you_live_fresh`.
