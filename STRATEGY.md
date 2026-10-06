---
name: starter
last_updated: 2026-10-05
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

One opinionated shape, enforced end to end — zero knobs — from the decision core
to the deployed Cloudflare app and its agent front door: one contract per
capability on seven surfaces, one Worker on the current Cloudflare platform, live
on its own site, and the exemplar systemfsoftware's doctrine points at. The
endgame ships as mechanism (the house lint preset, the complexity-1 gate on
decisions, mutation floors, CI at error severity, the vendored constitution, the
agent harness), never as documentation a reader can ignore: an invariant is
carried by a gate that fails the build, or not carried at all. Effect 4 is the
price of entry. The destination law itself lives in `repos/constitution/` and
`skill://endgame-strangler`, not in this document.

## Users

**Primary:** The engineer accountable for a TypeScript/Effect tree that agents
write into — solo, or leading a team that does. They're hiring starter to make
the endgame shape the default, so correctness is enforced by CI rather than by
their own review attention, and drift can't accumulate behind their back.

**Also:** adopters building full-stack Effect apps on Cloudflare, who clone the
kit for a working app and its deployment; and agents, as users of the hosted
front door.

## Boundaries

- No distribution work: the gates earn the stars, not the pitch.
- No light preset, no opt-out, no `warn` severity — ever.
- One exemplar: the worked example is the only one and a live feature of the hosted site, so drift fails a gate; systemfsoftware's `examples/` is deleted.
- Cloudflare is the one deploy target.
- No passwords, anywhere, including tests.
- Mutation runs only at the release gate.
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

The house oxlint preset (the root `oxlint.config.ts` over `@systemfsoftware/oxlint-config-recommended`),
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

### The worked example

One capability-limited domain that every surface projects and the hosted site
runs live, so the exemplar cannot drift from the doctrine without failing a gate.

_Why it serves the approach:_ an exemplar is precedent, and precedent decides the
shape agents reproduce; one that runs in production is held to every gate.

### The hosted front door

The site, its Worker and MCP, `llms.txt`, skills, lore, the debt ledger and the
pins, served Markdown-first to agents from `endgame.systemfsoftware.com`.

_Why it serves the approach:_ agents are users too; the front door makes the
endgame shape the first thing an agent reads.

### systemfsoftware runtime packages at exact pins

Reusable runtime code lives in systemfsoftware under its gates and arrives here
as published packages pinned exactly.

_Why it serves the approach:_ the kit composes gated packages instead of
growing a second, ungated copy of them.

## Milestones

- **On Effect 4 stable** — reached: `effect` 4.0.1 is the stable line (2026-10-05),
  and the kit's catalog pin moves to it.
- **Exemplar handoff** — systemfsoftware's `examples/` is deleted and every
  reference points at this kit's worked example.
- **Front door live** — the hosted site reaches isitagentready level 5.
- **Superiority Map green** — every row checkably beats its rat-stack counterpart.

## Brand

**One-liner:** We embrace the ENDGAME.

**Key message:** The full-stack starter kit for anyone serious about writing
TypeScript with Effect and AI. The shape is enforced, not documented — one
architecture, zero knobs, from the decision core to the deployed app, with gates
that reject the slop precedent would otherwise produce.
