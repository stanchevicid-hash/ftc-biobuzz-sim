# Java in the browser (no start.bat)

Goal: a team opens the hosted site, pastes an OpMode, presses Build and runs it. No install.
Status: **works** with CheerpJ. Measured 2026-11-01 in Chrome and in the Claude app's browser, page served the way Netlify serves it
(`node tests/serve-static.mjs`, no Java server).

## Options

| | CheerpJ 5.0 (chosen) | TeaVM + teavm-javac | Others |
|---|---|---|---|
| What it is | A full JVM (Java 8–25) in WebAssembly + JIT to JS | javac + the TeaVM compiler built to WebAssembly: Java source → a wasm module | Doppio: dead, Java 8, slow. JSweet, j2cl: compile ahead of time only. A cloud compile server can't hold the 10 ms lockstep over the internet |
| Our code unchanged | Yes: `ecj.jar`, the fake SDK and `SimServer.dispatch` run as they are | No: OpMode discovery needs reflection and annotations, `Sim.barrier` needs real threads with wait/notify, `Runner.stop` uses `Thread.stop`. TeaVM's wasm backend limits reflection and doesn't document threads | — |
| Licence | Free for non-commercial FOSS **if** loaded from their CDN and the page says "Built with CheerpJ" (the bridge label's tooltip does). Self-hosting the runtime needs a paid licence ([cheerpj.com/docs/licensing](https://cheerpj.com/docs/licensing)) | Apache 2.0 (OpenJDK parts GPLv2+CE) | — |
| Download | Ours: `ftcsim.jar` 237 KB + `ecj.jar` 2.4 MB (byte ranges, only what is used). JRE from the CDN, ~9.7 MB of preloaded chunks, then browser-cached | ~6 MB (the author's figure) | — |

## Measured (CheerpJ 5.0)

| | Time |
|---|---|
| Page open → JVM ready → all 5 examples built | 8.5–12 s (first visit and reload) |
| Build of all 5 examples once warm | 0.36–0.6 s (local JVM: ~0.3 s) |
| `sync` per physics tick (JS → Java → JS, OpMode runs to its next barrier) | median 0.7 ms, p95 7 ms, max 27 ms |
| DemoAutoRedAudience | runs to "Auto finished at 11.4 s" |
| DemoTeleOp | Init → Start → Running, telemetry live |

## Three traps found (and fixed)

1. **ECJ's helper thread.** By default ECJ parses on a second thread and polls it with `sleep`/`wait`. On CheerpJ's green threads
   a build took 6–100 s (it looked like a hang) and sometimes crashed in `Scanner.getNextToken0`. Fix: `jdt.compiler.useSingleThread=true`
   in `BrowserApi.setup`.
2. **Lazy JRE loading.** Without a preload list, a cold build waited ~74 s while CheerpJ fetched JRE chunks one by one.
   Fix: `preloadResources` in `bridge.js` (the `PRELOAD` list, recorded with `cjGetRuntimeResources()` after Build + Init + Start).
   Re-record it if the Java side starts using new JRE areas.
3. **One call at a time.** CheerpJ rejects a JS → Java call while another is running ("Java code still running"). `sync` runs
   every tick, so Start failed silently. Fix: `bridge.js` queues browser calls.

Also: compiled classes are kept in memory (`SimServer.MemOut` / `MemLoader`, used by the local server as well). Nothing is written
to CheerpJ's IndexedDB disk, and there is no `build/user` folder any more.

## How it works

- `web/js/bridge.js`: if `/api/status` answers, it uses the local server (start.bat) as before. Otherwise it loads CheerpJ, then
  `/app/java/ftcsim.jar:/app/java/ecj.jar`, and sends every call to `ftcsim.server.BrowserApi.call(path, json)`. That method runs the
  same `SimServer.dispatch`, so the rest of the app is unchanged. The label reads "Java in browser".
- `start.bat` / `start.sh` builds also pack `web/java/ftcsim.jar` (SDK + bridge + `examples/`) with `ftcsim.server.Pack` and copy
  `ecj.jar`. **Commit both jars**: Netlify has no build step.
- `tests/serve-static.mjs` serves `web/` like Netlify, with Range support (CheerpJ needs it).
- `tests/CompileCheck.java` checks the in-memory build (OpMode found, file and line on errors).

## Limits

- Stack traces from CheerpJ have no file or line numbers. The error box shows the user file and method (`Boom.java  Boom.runOpMode`),
  without the line.
- The first visit needs internet for the CheerpJ CDN. start.bat stays the offline option.
- `libs/` (team libraries) is local-server only.
- The Netlify function for the public Teams list is untouched.
