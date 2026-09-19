# Architecture decisions

Each decision names the alternatives and why they lost. Numbers come from `docs/perf.md`
and the pipeline output; nothing here is a guess dressed as a fact.

## 1. Where aggregation happens — a hybrid

**Decision.** Two layers. (a) The pipeline pre-aggregates the primary view at build time
(agency × month, agency × function, agency × group, per year: 30–115 KB JSON each) and the
page is statically prerendered with the default year's numbers baked in, so the headline
tiles are in the HTML before any JavaScript runs. (b) Every filter, sort, search and the
live aggregates run **client-side in a Web Worker** over the served columnar slice
(328,263 rows for FY2025 as dictionary-encoded typed arrays).

**Alternatives.**

- *Pure client-side over row objects.* This is the naive baseline kept in the repo
  (`?mode=naive`). It works, badly: 612 ms for a text search on the main thread, and it
  can only exist because the payload was already columnar — as JSON rows with names the
  slice is 33 MB gzipped.
- *Server-side (Postgres on Neon / SQLite on Turso behind a route handler).* Every keystroke
  becomes a round trip. From Brazil to us-east that is 120–250 ms before any work happens,
  plus Vercel Hobby cold starts and a 4.5 MB response cap. It cannot meet a 200 ms
  interaction target on a network the app does not control. It wins only when the data no
  longer fits in a tab (several million rows).
- *Everything pre-computed at build time.* Answers only the combinations it anticipated;
  the drill-down table needs rows anyway, and a Cartesian product of five filters is not
  a file.
- *DuckDB-WASM over Parquet.* Six megabytes of WASM before the first query, and it
  outsources exactly the work this project exists to demonstrate. Documented fallback if
  the hand-rolled engine had failed at the raw grain.

**What breaks where.** At 100k rows a plain `<table>` is already seconds per interaction
(mode A). At 330k, JavaScript objects cost ~200–400 MB of heap and a main-thread sort is
a visible freeze (mode B). At 5M rows the payload passes 100 MB and the design would have
to move server-side.

## 2. Storage and serving — static columnar files on the CDN

**Decision.** `public/data/v1/<year>/columns.bin.gz` (typed arrays, 8-byte aligned, offsets
in a JSON manifest), `dict.json` (codes, names, aliases, truncation flags), `agg/*.json`, and
a `defects-report.json`. Vercel serves them as static assets; the browser verifies the
gzip's SHA-256 against the manifest before inflating with `DecompressionStream`.

**Alternatives.** *Vercel Blob* — same bytes, one more moving part and a dependency on a
SDK. *Postgres/SQLite* — see decision 1. *Parquet + hyparquet* — the honest "would do
differently": Parquet is the standard, but the hand-rolled container is ~100 lines
(`lib/data/columnar.ts`), has no dependency, and every byte of it is explainable in an
interview. The trade is documented, not hidden.

**Grain.** The pipeline serves "G2b": órgão superior × órgão subordinado × função ×
subfunção × programa × ação × plano orçamentário × grupo × elemento × modalidade × UF ×
month. It drops unidade gestora, gestão, unidade orçamentária, subtítulo/localizador,
amendment author and município from the served rows (789,883 → 328,263 rows for FY2025,
21 MB decoded, 3.5 MB gzipped). The question is about agencies and programs, not the 3,300
executing units; the pipeline still processes and profiles every raw column, and the
defect report is at the raw grain.

## 3. Virtualization — TanStack Virtual for rows, no table library

**Decision.** `@tanstack/react-virtual` renders ~30 of the 315k rows; a plain column-def
array renders headers and cells. The worker owns sorting and filtering and hands back a
`Uint32Array` of row indexes, so no row object is ever materialized on the main thread —
cells read straight from the typed arrays by index.

**Why no TanStack Table / AG Grid.** With the row model in the worker, a table library
would only render headers. It also fights the virtualizer: its built-in sorted/filtered
row models materialize row objects on the main thread, which is the exact cost being
removed. The 200-line ARIA grid is smaller than the integration would have been.

**Where virtualization bit.** (1) Keyboard focus: a focused cell that scrolls out of the
window is unmounted, so focus falls to `<body>` — the grid keeps the active cell in state
and re-focuses it after `scrollToIndex` (and must not steal focus back if the user has
meanwhile moved to a header button; the e2e suite caught that). (2) Sorting: rows are
fixed-height (36 px) so `scrollToIndex` is exact after a sort. (3) Sticky header and
horizontal scroll: the grid itself is the scroll container so header and body scroll
together. (4) Screen readers cannot "read all" — mitigated by `aria-rowcount`, absolute
`aria-rowindex`, a live count, and chart table views.

## 4. Filtering and search — client-side, in the worker, integer-keyed

**Decision.** Categorical filters are per-dimension `Uint8Array` allow-masks over
dictionary ids; the month range is two integer compares; search folds accents and case
over the dictionary strings (≤ 17k per dimension) and expands to a row mask. Sorting keys
are integers (centavos, name ranks, months), which allowed an LSD radix sort instead of a
comparator sort — engine time on the full slice went from 75 ms to 31 ms for "sort by
paid" (mode C → D in `docs/perf.md`). Search input is wrapped in `useDeferredValue`;
each query carries a request id so a late answer never overwrites a newer one.

**Alternatives.** *Server-side query* — decision 1. *A hybrid with a prebuilt inverted
index* — unnecessary: folding ~17k dictionary strings per keystroke is ~10 ms.

## 5. Charting — Recharts 3, stress-tested

**Decision.** Recharts for the primary view (36 bars; 3 series × 12 points) with
animations off and custom tooltips. `app/experiments/chart-stress` renders 1k/10k/50k/100k
SVG points and records commit time; the numbers are in `docs/perf.md`. The cliff is real
(SVG node count), which is why the dense views this dashboard could have had (every
budget line over time) were not built, and why uPlot (canvas) is the named fallback.

## 6. Naive first, then measured

**Decision.** The first implementation was the naive one and it is still in the repo
(`?mode=naive`, `?mode=naive&virtual=1`, `?engine=comparator`). Every optimization was
applied on top of the previous one and re-measured with the same Playwright script, so
the before/after table in `docs/perf.md` is reproducible, not remembered.
