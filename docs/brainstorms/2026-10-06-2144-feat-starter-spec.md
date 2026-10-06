# Starter spec, 2026-10-06

Approved by Ryan ("CLEARLY YES"). Supersedes every earlier requirements doc and lake plan for this repo.

Ryan: "I ASKED A VERSION OF RATSTACK IN SYSTEMF STYLE. NOT CARGO CULTING ALL THE BULLSHIT FROM RATSTACK" /
"YOU'RE SUPPOSED TO BUILD A PROPER STARTER PACKAGE".

## What it is

systemfsoftware/effect-endgame-starter-kit is a GitHub template for starting a new app the systemfsoftware way
on Cloudflare: the same kind of stack rat-stack offers, built with our toolchain and existing libraries. Every
piece must answer "does a good starter need this?". If not, it is out.

## In

1. Toolchain: Nix devshell, pnpm 12, Effect 4 at exact pins (effect / @effect/* / effect-agent in
   minimumReleaseAgeExclude), TypeScript 7 (tsgo), oxlint with the published systemfsoftware presets, dprint,
   @systemfsoftware/vitest, constitution subtree, commitlint + changesets as today. Mutation testing (Stryker)
   runs only on push to main.
2. App: one Cloudflare Worker serving a TanStack Start site, defined and deployed with Alchemy v2. HTTP API with
   Effect HttpApi + OpenAPI. One storage choice through Alchemy (D1 or a Durable Object; pick the simpler).
3. Local: `pnpm dev` runs the whole app locally with Alchemy's local emulation. One command, no cloud.
4. Tests: unit and property tests; end-to-end journeys in a real browser against the local app. CI runs the gate
   and the journeys on every PR (Linux and macOS).
5. Safety: all dependency code (install, build, test, dev) runs in the Nix sandbox launcher; strict CSP.
6. Deploy: `pnpm deploy` through Alchemy. Deploy and preview workflows exist for adopters' copies and never run
   in the template (`if: !github.event.repository.is_template`). No credentials in the template, ever.
7. One small example feature end to end (a pure decision function, one HttpApi endpoint, one page, its tests)
   that an adopter can delete in one step.
8. Distribution of our own packages through the systemfsoftware Nix flake (Ryan's npm rule).

## Out (removed, not deferred)

rat-stack scorecard; debt ledger and diagram generators; the contract kernel and every generated-surface
framework (CLI/MCP/RPC/A2A/gRPC/WebMCP projections, our own code-mode sandbox); the race demo and workshop
registration domain; the heavy-job service; the unit-of-work kit; the Durable Object WorkflowEngine; K2 / Basin /
Pipelines / Issues webhooks / Spectrum / Monetization; signed receipts, crypto-shredding, agent front door. If an
adopter needs MCP or agents later, they add Effect AI McpServer or effect-agent (@yielded/agent) themselves.

## After the starter

Delete examples/ in systemfsoftware/systemfsoftware and point every reference at the starter.
