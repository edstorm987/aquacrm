# Archived plans

Plans that have **shipped**. They live here rather than being deleted: a shipped
plan is the record of why something is the way it is, and the roadmap's Shipped
lane still links to them.

## What this changes

The board and the task list read `docs/development/plans/` — the **top level
only** — so archiving a plan takes it off the board without touching history.
That is the point: the board should show what is moving, not everything that ever
moved. The Library still lists these (it walks every doc), and a roadmap item's
`**Plans:**` line still resolves to them.

## Moving one here

Archive a plan when its work is genuinely shipped AND verified — not when the
last phase is ticked. Use the Dev Console (Roadmap → the item → mark it shipped),
or by hand:

```bash
mv docs/development/plans/<name>.md docs/development/plans/archive/
```

Nothing else needs updating: the roadmap resolves plan names in both places.

## Do not archive

- A plan a worker is still checked in against — the board would lose them.
- A HANDOFF doc that another plan still points at as its brief.
- Anything with open phases, however old. Park it instead; parked work that is
  still on the board is honest, an archive that quietly hides unfinished work is
  not.
