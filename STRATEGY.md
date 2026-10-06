---
name: starter
last_updated: 2026-10-06
---

# starter Strategy

## Purpose

AI writes most of the code now, so precedent decides the shape — and the Effect
idiom the ecosystem teaches, including the canonical exemplars it learns from
(`mikearnaldi/effect-torch`), was authored for human hands. Agents reproduce it
faithfully at volume, producing code that compiles, passes tests, and has thrown
away the invariants that made Effect worth adopting, with nothing in the loop
that rejects it. Maybe fine when AIs weren't programming everything; it isn't
the endgame.

## Positioning

One opinionated shape, enforced end to end — zero knobs — in a GitHub template
for starting a Cloudflare app: one Worker, deployed with Alchemy. The endgame ships as
mechanism (the house lint preset, the complexity-1 gate on decisions, mutation
floors, CI at error severity, the vendored constitution, the agent harness),
never as documentation a reader can ignore: an invariant is carried by a gate
that fails the build, or not carried at all. Effect 4 is the price of entry. The
destination law itself lives in `repos/constitution/` and
`skill://endgame-strangler`, not in this document.

## Users

**Primary:** The engineer accountable for a TypeScript/Effect tree that agents
write into — solo, or leading a team that does. They're hiring starter to make
the endgame shape the default, so correctness is enforced by CI rather than by
their own review attention, and drift can't accumulate behind their back.

## Boundaries

- No distribution work: the gates earn the stars, not the pitch.
- No light preset, no opt-out, no `warn` severity — ever.
- No second exemplar: the starter is the exemplar, and a demo app would drift from doctrine; systemfsoftware's `examples/` is deleted in its favour.
- Cloudflare is the one deploy target.
- Mutation runs only on push to `main`.
- No Effect 3 compatibility surface: Effect 4 is the price of entry.

_Resist a change when:_ it buys adoption — or stars — by making the endgame shape optional.

_Gate:_ review — the reviewer applies exactly the resist test above; a policy
refusal has no command that can catch it, so the PR decision is the gate.

## Key metrics

- **Stars** - the leading signal that serious people have found the kit; measured on GitHub (baseline: 1 star, 0 forks for `systemfsoftware/starter`, 2026-09-12).

Single metric by decision: a deliberate launch-phase bet on attention, revisited
**2026-12-12** (chosen here, 90 days out), when the adoption metric gets named.
The template's usual 3-5 is knowingly unmet until then.

## Tracks

### Template hardening via dogfooding a derived repo

A derived repo hits the real walls — `are-the-types-wrong-effect` did, and its
fixes came back upstream as PR #8 (merge commit `7207d28`) — so field use is how
the template learns where the shape leaks.

_Why it serves the approach:_ zero knobs only holds if the shape survives real
work; the derived repo finds the holes before adopters do.

### The enforcement surface (gates, presets, constitution)

The house oxlint preset (`packages/starter/oxlint.config.ts`),
the complexity-1 gate on decisions, mutation floors (stryker), CI at error
severity (`pnpm check:ci`), and the vendored constitution (`repos/constitution/`).

_Why it serves the approach:_ the approach is mechanism over documentation — an
invariant is carried by a gate, or not carried at all.

### The agent harness

`AGENTS.md` and its gated Definition of Done, worktree lifecycle hooks
(`repos/worktrunk-scripts/`), the worktree include whitelist, and the
constitution as load-bearing context.

_Why it serves the approach:_ the agents are the writers, so the harness is the
interface — it makes the endgame the path of least resistance.

## Milestones

- **On Effect 4 stable** — the kit's `effect` pin in the `pnpm-workspace.yaml`
  catalog moves from the release candidates to the stable line and the audience
  arrives on it; the date is Effect's release schedule, not ours.
- **Exemplar handoff** — systemfsoftware's `examples/` is deleted and every
  reference points at this kit.

## Brand

**One-liner:** We embrace the ENDGAME.

**Key message:** The starter kit for anyone serious about writing TypeScript with
Effect and AI. The shape is enforced, not documented — one architecture, zero
knobs, gates that reject the slop precedent would otherwise produce.
