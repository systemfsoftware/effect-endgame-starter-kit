# Lake 1 QA evidence (#38 local stack, #41 site), head 2b763c1

Checkout `starter.worktrees/lake1-review` (detached at `origin/lake1/site`), `nix develop`, `pnpm install --frozen-lockfile` (28.7 s).

## Q1. `pnpm dev` fails without a terminal (#38)

`pnpm dev`, stdout piped, no TTY:

```
$ ./bin/local-stack up
26-10-06 06:36:36.824 FTL TUI startup error error="terminal entry not found: term not set"
[ELIFECYCLE] Command failed with exit code 1.
```

The one-command stack exits 1 in any non-interactive shell (an agent, CI, `ssh host cmd`). `pnpm dev -- --tui=false` doesn't work around it: pnpm forwards the literal `--` and process-compose reads it as a process name (`FTL … error="no such process: --tui=false"`). The rest of QA ran under a PTY with `TERM=xterm-256color`.

## Q2. Stack comes up in a PTY (#38)

process-compose 1.120.0, 4/4 processes running. Tempo, the OTel collector and Grafana reported Ready within 6 s; the site went Ready once `/llms.txt` answered on 1337. `local-stack down` stopped everything in 22.8 s, and ports 1337, 3000, 3200 and 13133 were free afterwards.

## Q3. Grafana downloads plugins from the internet at startup (#38)

```
logger=plugin.installer … msg="Installing plugin" pluginId=grafana-pyroscope-app
logger=installer.fs … msg="Downloaded and extracted grafana-pyroscope-app v2.3.1 zip successfully to …/local-stack/data/grafana/plugins/…"
logger=plugin.installer … msg="Installing plugin" pluginId=grafana-exploretraces-app
logger=installer.fs … msg="Downloaded and extracted grafana-exploretraces-app v2.2.1 zip …"
```

Grafana's background plugin installer fetches unpinned plugins over the network on every fresh data dir. Nix pins none of that code, and it runs outside the sandbox.

## Q4. Site content negotiation (#41), real Chromium with its own cookie jar

| Accept | Status | Content-Type | Vary |
|---|---|---|---|
| browser default (`text/html,application/xhtml+xml,…;q=0.8`) | 200 | text/html; charset=utf-8 | Accept |
| `text/html` | 200 | text/html; charset=utf-8 | Accept |
| `text/markdown` | 200 | text/markdown; charset=utf-8 | Accept |
| `text/markdown, text/html;q=0.5` | 200 | text/markdown; charset=utf-8 | Accept |
| `*/*` | 200 | text/markdown; charset=utf-8 | Accept |
| none | 200 | text/markdown; charset=utf-8 | Accept |

- `/llms.txt`: 200 Markdown, one link, `http://127.0.0.1:1337/` (the origin of the request).
- `/no-such-page` and `/index.md` with `Accept: text/markdown`: 404 Markdown, "Try `/`".
- In the browser: title "Endgame Starter", the README opening rendered as four blocks, no console errors and no page errors (only the Vite and React DevTools notices). The page has no stylesheet of its own (browser default serif) and no links or landmarks; `observe()` finds zero interactive elements. Screenshot taken.

## Q5. No traces reach Tempo (#38 with #41)

Three requests to `/`, then a Tempo search over the last 30 minutes returned 0 traces, and `apps/site` has no OTel or OTLP code at this head. The collector, Tempo and Grafana run with no producer. Tracing the front door is the later `lake1/traces` layer, so at #38/#41 the observability half of the stack is idle.
