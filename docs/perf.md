# Performance — method and numbers

Target from the brief: **interaction → visible update under 200 ms at full dataset size**
(FY2025: 328,263 served rows, 315,755 after the default "no agency" exclusion).

## What is measured, and how

Three clocks, all in the page:

1. **Engine** — filter + sort + aggregate alone. In the worker it is `performance.now()`
   around `runQuery`; in the naive baseline it is the same around `Array.filter` + `sort`.
2. **Interaction → commit** — `performance.mark` when the user's action is dispatched
   (`lib/perf.ts: markInteraction`), measured in a `useLayoutEffect` after the table
   receives the new row indexes.
3. **Interaction → paint** — the same mark, measured two `requestAnimationFrame`s after
   commit, i.e. after the browser has laid out and painted the new rows. This is the number
   that matters; for a plain `<table>` layout dwarfs React's commit.

Every entry is pushed to `window.__perfLog`. `scripts/perf/measure.ts` drives a production
build (`next build && next start`) with Playwright, performs the same five interactions in
each mode, reads the log, and writes `docs/perf-results.md` (medians of 5 runs per cell).
`?perf=1` shows the same log live in the corner of the page.

Modes are the same app with the optimizations peeled back:

| Mode | URL | Data model | Compute | DOM |
| --- | --- | --- | --- | --- |
| A | `/?mode=naive&rows=N` | one object per row, names resolved | `Array.filter` + comparator `sort` on the main thread | plain `<table>`, N rows rendered |
| B | `/?mode=naive&virtual=1&rows=all` | same | same | TanStack Virtual, ~30 rows rendered |
| C | `/?engine=comparator` | dictionary-encoded typed arrays | Web Worker, comparator sort | ARIA grid, virtualized |
| D | `/` (shipped) | same | Web Worker, LSD radix sort | same |

Mode A cannot render all 315k rows: at 50k rows the tab needs 10–19 s per interaction, so
the full set is not a measurement, it is a hang. That is the point of the baseline.

## Results

<!-- results:start -->
Measured 2026-09-19 on Intel(R) Core(TM) Ultra 7 165U, 33 GB RAM, headless Chromium via Playwright, production build served locally (`next start`). 5 runs per cell; values are medians of interaction → next painted frame, in ms. Engine = filter+sort time alone (worker or main thread). JS heap is the main thread's (`Performance.getMetrics`); in modes C/D the ~22 MB slice also lives in the worker, which is not counted here.

| Mode | Load → first rows | JS heap after load | sort by Paid | search "universidade" | clear search | months jun–dez | filter agency (Educação) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A · naive, plain table, 10k rows in DOM | 3326 ms | 127 MB | **2974** (engine 188) | **2916** (engine 635) | **2446** (engine 193) | **1673** (engine 121) | **2286** (engine 44) |
| A · naive, plain table, 50k rows in DOM | 14154 ms | 276 MB | **18792** (engine 213) | **16420** (engine 630) | **13251** (engine 216) | **8955** (engine 132) | **15234** (engine 47) |
| B · naive compute, virtualized rows (all rows) | 879 ms | 91 MB | **214** (engine 189) | **614** (engine 601) | **197** (engine 172) | **133** (engine 114) | **73** (engine 43) |
| C · worker + typed arrays + virtualized grid, comparator sort (all rows) | 907 ms | 27 MB | **148** (engine 77) | **97** (engine 32) | **144** (engine 79) | **124** (engine 51) | **96** (engine 28) |
| D · C + radix sort in the worker (all rows) — shipped | 906 ms | 28 MB | **94** (engine 30) | **77** (engine 16) | **96** (engine 41) | **87** (engine 19) | **91** (engine 19) |

Row counts after each step (mode D): sort by Paid → 315,755; search "universidade" → 76,498; clear search → 315,755; months jun–dez → 195,852; filter agency (Educação) → 80,203.
<!-- results:end -->

Reading the table:

- **A → B (virtualization)** removes the DOM cost: 50k `<tr>`s take 9–19 s to lay out and
  paint; ~30 rows take nothing. The engine column barely moves, so B is bounded by the
  main-thread filter/sort over 328k objects (and the search step, which folds six strings
  per row per keystroke, is 600 ms of pure compute).
- **B → C (typed arrays in a worker)** removes both the object model and the main-thread
  blocking: search goes from 614 ms to 97 ms, heap on the main thread from 91 MB to 27 MB.
  "Sort by paid" is still 148 ms because the comparator sort alone is ~75 ms.
- **C → D (radix sort)** takes the engine for a full-slice sort from 77 ms to 30 ms; every
  interaction is now under 100 ms end to end, with roughly 50–60 ms of that being React
  re-render + paint of the grid rather than data work.
- Load → first rows is ~900 ms on localhost (3.5 MB download, SHA-256, inflate, decode,
  index); on a real network the download dominates.

## Engine micro-benchmark (Node, `pnpm perf:bench 2025`)

Same engine code, run in Node over the real FY2025 slice (medians of 7):

| Query | rows out | comparator sort | radix sort |
| --- | --- | --- | --- |
| default (sort by gap desc) | 315,755 | 83 ms | 36 ms |
| sort by paid | 315,755 | 75 ms | 32 ms |
| sort by action name | 315,755 | 54 ms | 18 ms |
| filter: Ministério da Educação | 129,443 | 37 ms | 14 ms |
| search "universidade" | 76,498 | 24 ms | 14 ms |
| months jun–sep + investimentos | 12,632 | 4 ms | 3 ms |

Inflate + decode of the 3.5 MB gzip: ~55 ms. Search index (accent folding of every
dictionary string): ~36 ms, once per year.

Why radix: every sort key is an integer (centavos, dictionary ranks, months), so a stable
LSD radix sort with 16-bit digits does 3 passes over 315k keys instead of ~5.5M comparator
calls. The comparator version is kept behind `?engine=comparator` so the claim can be
re-checked.

## Recharts under load (`/experiments/chart-stress`)

The dashboard's charts are small (36 bars; 3 series × 12 points). The experiment page draws
N points as an SVG scatter through Recharts and as pixels on a canvas, recording React's
commit time (Profiler), paint time (double rAF) and the SVG node count:

<!-- chart-stress:start -->
| Points | Recharts (SVG) to paint | SVG nodes | Canvas draw |
| --- | --- | --- | --- |
| 1,000 | 99 ms | 3,080 | 0.7 ms |
| 10,000 | 620 ms | 30,080 | 2.7 ms |
| 50,000 | 3114 ms | 150,080 | 27.3 ms |
| 100,000 | 7823 ms | 300,080 | 51.6 ms |

(`pnpm perf:chart` — production build, headless Chromium, `setState` → two animation
frames later. React's Profiler is a no-op in production builds, so commit is not separated.)

Recharts renders three SVG nodes per point and paint time grows linearly with them: ~100 ms
at 1k points, 0.6 s at 10k, 3 s at 50k, 8 s at 100k. A canvas draws the same 100k points in
~50 ms. The dashboard's charts have 36 bars and 36 line points, comfortably inside the
usable range, which is why Recharts stays; a "every budget line over time" scatter would
not be an option, and if such a view is ever added it goes to uPlot or a raw canvas — it
would not be a Recharts chart with more props.
<!-- chart-stress:end -->

## Lighthouse

<!-- lighthouse:start -->
Lighthouse 13.5, production build on localhost, Playwright's Chromium, 2026-09-19:

| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop | 100 | 100 | 100 | 100 | 0.2 s | 0.6 s | 20 ms | 0.017 | 0.7 s |
| Mobile (4× CPU slowdown, slow 4G) | 90 | 100 | 100 | 100 | 0.9 s | 2.1 s | 380 ms | 0 | 2.2 s |

Total transfer 4.3 MB, of which 3.5 MB is the columnar slice and ~330 KB the gzipped
dictionaries; the slice is fetched after first paint and does not block LCP (the headline
tiles are static HTML). Mobile TBT (380 ms) is hydration plus the one-off structured clone
of the ~17k-entry dictionaries and the decode of the columns on the main thread after the
worker finishes; it is the number to attack next (see README limitations).
<!-- lighthouse:end -->

## Reproduce

```bash
pnpm build && pnpm start -p 3100 &
pnpm perf:measure 5        # writes docs/perf-results.md and docs/perf-results.json
pnpm perf:bench 2025       # engine-only numbers in Node
pnpm readme:perf           # copies the results table into the README
```
