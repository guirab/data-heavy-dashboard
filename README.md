# Federal spending gap — commitments vs. payments

**Live demo:** _deploy pending — see [Deploying](#deploying)_ · **Experiment:** `/experiments/chart-stress` · **Baseline:** `/?mode=naive`

## What question this answers

Which Brazilian federal agencies commit money they don't end up paying — how big is the
gap between _empenhado_ (committed) and _pago_ (paid) per agency, and does it close over
the fiscal year? In FY2025 the federal government committed R$ 5.44 trillion and paid
R$ 5.15 trillion; Ministério das Cidades committed R$ 56 billion and paid R$ 24 billion,
Ministério da Fazenda paid 99% of what it committed. Budget analysts and journalists
compare execution discipline across ministries with exactly this number; engineers who
open this repo get a 330k-row table that stays responsive in the browser and a README
that says how.

This README is a decision log, not a feature list. It is written for another engineer.

## The data

| | |
| --- | --- |
| Source | [Portal da Transparência — Execução da Despesa](https://portaldatransparencia.gov.br/download-de-dados/despesas-execucao), Controladoria-Geral da União (CGU). Monthly consolidated CSVs of federal budget execution. [Data dictionary](https://portaldatransparencia.gov.br/pagina-interna/603453-dicionario-de-dados-execucao-da-despesa). |
| Period | FY2024 (12 months), FY2025 (12 months), 2026 through September (9 months, partial). 33 files, 234 MB zipped, 2.17 million raw rows. |
| Grain served | 11 dimensions × month, integer centavos for six amounts. 336,722 / 328,263 / 227,979 rows per year; 3.4 / 3.5 / 2.5 MB gzipped. See [decisions.md](docs/decisions.md#2-storage-and-serving--static-columnar-files-on-the-cdn) for what was dropped and why. |
| Format as published | ISO-8859-1, CRLF, `;`-delimited, every field quoted, 47 columns, decimal comma, no thousands separator. Monthly files are **deltas**, not year-to-date. |
| Licence | The portal states its data is free to use under [Decreto 8.777/2016](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8777.htm) (federal open-data policy; the API page says "livre utilização"). The bulk-download pages carry no licence text; dados.gov.br reportedly lists CGU datasets under ODbL, which I could not confirm programmatically because the catalogue API needs a key. Attribution to CGU / Portal da Transparência is given regardless. |
| Reproduce | `pnpm data:download` fetches the 33 zips listed in [`data/manifest.json`](data/manifest.json) (URL, size, `Last-Modified`, SHA-256 each; cached files are re-hashed before being trusted). The portal blocks a client after ~25 consecutive files with HTTP 405 for a few minutes — the download is resumable, so wait and rerun. `pnpm data:build` runs the pipeline in ~75 s; `pnpm data:verify` rebuilds and fails if any byte of `public/data/` changes. CI downloads each year on its own runner and does this on every push, so the committed artifacts are provably what the code produces. |

Other sources considered, with what was measured before rejecting them: [docs/sources.md](docs/sources.md).

## Data defects and how they were handled

Every rule is code in [`scripts/pipeline/rules/`](scripts/pipeline/rules) (row rules) or the
dictionary/aggregation stages, and every count below comes from
[`public/data/v1/defects-report.json`](public/data/v1/defects-report.json) via
`pnpm readme:defects`. Nothing in this table is typed by hand. Rules are unit-tested on
[real rows extracted from the source](scripts/pipeline/rules/__fixtures__/rows.json).

<!-- defects:start -->
Input: **2,171,859 rows** (2024: 831,444, 2025: 789,883, 2026: 550,532). Kept: **2,167,215**. Dropped: **4,644** (0.2%), all by DEF-17 and nothing else. Counts below are over kept rows unless the rule runs before DEF-17.

| ID | Defect | Rule applied | Action | Rows affected | Example |
| --- | --- | --- | --- | --- | --- |
| DEF-01 | **Header typo and unstable-looking header** — Column 14 is spelled "Código Subfução" (sic) in every file. Any consumer matching on the correct spelling silently gets nothing. | The 47 expected names, typo included, live in schema/raw-header.v1.json. Every file is asserted against it; a drift aborts the run instead of shifting columns. | documented | 2,171,859 (100%) — 2024: 831,444, 2025: 789,883, 2026: 550,532 | `Código Subfução` → `Código Subfunção (kept as published; mapped by position)` |
| DEF-02 | **ISO-8859-1 encoding, CRLF, every field quoted** — Files are Latin-1 (not UTF-8), use ";" as delimiter, CRLF line endings and quote every field. Reading them as UTF-8 yields mojibake in every accented name. | Decode with TextDecoder("iso-8859-1") and assert the result has no U+FFFD and no double-encoding signature ("Ã©"-style sequences). | transformed | 2,171,859 (100%) — 2024: 831,444, 2025: 789,883, 2026: 550,532 | `ISO-8859-1, CRLF, delimiter ";", 40,623,059 bytes` → `UTF-8 in memory` |
| DEF-03 | **Money stored as text with a decimal comma** — All six value columns are strings like "13404423,26"; there is no thousands separator, but the decimal separator is a comma. | Parse with a strict regex into integer centavos (exact in a Float64 below 2^53). Any value that does not match the regex aborts the run instead of becoming NaN. | transformed | 2,171,859 (100%) — 2024: 831,444, 2025: 789,883, 2026: 550,532 | `403260,47` → `40326047` |
| DEF-04 | **Dead columns** — "Nome Programa Governo", "Sigla Localizador" and "Descrição Complementar Localizador" hold the same placeholder in 100% of rows: the schema promises data the export never fills. | Dropped from the served data. The rule counts rows where the placeholder holds, so a future file that starts filling the column shows up as a count below 100%. | column dropped | 2,167,215 (100%) — 2024: 829,599, 2025: 788,115, 2026: 549,501 | `Sem informação` → `(column dropped)` |
| DEF-05 | **Missing agency encoded two different ways** — Rows without an agency come in two flavours: (a) empty code + "Sem informação" + unidade gestora "NAO SE APLICA"; (b) code "-1" + "Sem informação" + órgão subordinado "-3" + unidade gestora "Inválido". | Normalize both to a null agency (and null órgão subordinado). Rows are kept in a "no agency" bucket that the UI excludes from rankings by default. | set to null | 26,966 (1.2%) — 2024: 5,596, 2025: 15,337, 2026: 6,033 | `code="-1" name="Sem informação" ug="Inválido"` → `null` |
| DEF-06 | **Placeholder values instead of nulls** — Missing values are spelled differently per column: "-1" and "Sem informação" for plano orçamentário, "00" for programa de governo, "SEM EMENDA" for the amendment author, and plain empty strings for UF and município. | Map every placeholder to a null code; the dictionary gets one explicit "no value" entry per dimension so nulls are filterable, not invisible. | set to null | 2,167,097 (100.0%) — 2024: 829,550, 2025: 788,053, 2026: 549,494 | `"00 / Sem informação"` → `null` |
| DEF-07 | **Amendment author code and name disagree** — Rows with an empty author code but the name "Informação do autor não disponível": the code says "no amendment", the name says "amendment, author unknown". | Treat as unknown author: null both fields and count. The column is not served, but the count belongs in the report. | set to null | 1,740 (0.1%) — 2024: 849, 2025: 551, 2026: 340 | `code="" name="Informação do autor não disponível"` → `null` |
| DEF-08 | **Runs of internal spaces (fixed-width remnants)** — Names like "ADMINISTRACAO DA UNIDADE       - NACIONAL" keep padding from a fixed-width upstream system. | Collapse any run of two or more whitespace characters to a single space. | transformed | 546,560 (25.2%) — 2024: 208,557, 2025: 198,338, 2026: 139,665 | `ADMINISTRACAO DA UNIDADE       - NACIONAL` → `ADMINISTRACAO DA UNIDADE - NACIONAL` |
| DEF-09 | **Leading/trailing whitespace in names** — Some names carry trailing spaces (e.g. "ADMINISTRACAO DA UNIDADE - NO ESTADO DO "), which makes the same value look like two distinct categories. | Trim every name column. Applied before dictionary building so keys never differ only by whitespace. | transformed | 64,361 (3.0%) — 2024: 22,306, 2025: 24,191, 2026: 17,864 | `"ATIVOS CIVIS DA UNIAO         - NO ESTADO DE "` → `"ATIVOS CIVIS DA UNIAO         - NO ESTADO DE"` |
| DEF-10 | **Names truncated at the source (45 UTF-8 bytes)** — Several name columns are cut at exactly 45 bytes of UTF-8 — bytes, not characters, so "Ministério da Ciência, Tecnologia e Inovaç" loses more letters than an unaccented name would. The cut happened upstream; the file cannot recover it. | Kept as published. For órgão superior, a hand-curated override table (9 full names plus 1 entry marking a 45-byte name as verified complete — the only manual data in the repo) supplies the full name. Entries at exactly 45 bytes elsewhere are flagged "suspected" so the UI can say so. | documented | dictionary-level (see notes) | `Ministério do Desenvolvimento Agrário e Agr` → `Ministério do Desenvolvimento Agrário e Agricultura Familiar` |
| DEF-11 | **"§" mangled to "??" upstream** — Legal references like "§§ 1º e 2º" arrive as "?? 1º e 2º": the section sign was lost before the file was exported (the file itself decodes cleanly as ISO-8859-1). | Left alone. Guessing the original character would be inventing data; the count documents the loss. | kept as-is | 2,159 (0.1%) — 2024: 1,193, 2025: 779, 2026: 187 | `DOTACOES CLASSIFICADAS COM RP 2, INCLUIDAS OU ACRESCIDAS POR EMENDA…` |
| DEF-12 | **Three naming conventions in one file** — Some name columns are Title Case with accents (órgão, função), others are UPPER CASE without accents (ação, plano orçamentário), and a few mix both across rows. | Displayed as published. Search folds accents and case so "acao" matches "AÇÃO" and "Ação". | documented | dictionary-level (see notes) | 2024: Title: orgSup, orgSub, funcao, subfuncao, grupo, elemento, modalidade · UPPER: programa, po, uf · mix… |
| DEF-13 | **Same code, different names across periods** — A code can change its name between months (renamed programs, "- DESPESAS DIVERSAS" suffixes appearing mid-year). | The dictionary keeps one entry per code with the name from the latest period; earlier names are stored as aliases and counted here. Nothing is keyed by name. | transformed | 68,725 (3.2%) — 2024: 45,088, 2025: 18,044, 2026: 5,593 | `0001: "OPERACAO CARRO-PIPA PARA DISTRIBUICAO DE AGUA NO SEMIARIDO B…` → `"0001 - OPERACAO CARRO-PIPA PARA DISTRIBUICAO EMERGENCIAL…` |
| DEF-14 | **Same name, different codes** — Distinct codes can share a display name (e.g. several "ADMINISTRACAO DA UNIDADE" plans under different actions). | Never join or group by name; all keys are codes. The count is reported so the UI can disambiguate with the code when needed. | documented | dictionary-level (see notes) | 2024 programa: 26 names shared by more than one code |
| DEF-15 | **"Código Plano Orçamentário" is not a key** — The plano orçamentário code is only unique inside an action and an agency: code "0001" under action "2000" names 30 different plans in FY2025. | Plano orçamentário is keyed by (órgão subordinado, ação, código PO); the dictionary entry points to its parent action. | transformed | dictionary-level (see notes) | 2024: 320 distinct PO codes expand to 14,773 (órgão subordinado, ação, PO) keys |
| DEF-16 | **Negative amounts** — Committed, verified and paid amounts can be negative in a month: they are reversals (estornos) of earlier commitments, not errors. | Kept as-is. Dropping or clamping them would overstate execution; the UI shows the sign and monthly cumulative series absorb them. | kept as-is | 171,039 (7.9%) — 2024: 69,872, 2025: 71,883, 2026: 29,284 | `-58524,97` |
| DEF-17 | **Rows where all six values are 0,00** — A budget line can appear in a month with every amount equal to zero (nothing committed, paid or carried over). It adds a row and no information. | Drop the row and count it. This is the only rule that drops rows; the count is asserted in validation (input = kept + dropped). | row dropped | 4,644 (0.2%) — 2024: 1,845, 2025: 1,768, 2026: 1,031 | — |
| DEF-18 | **Monthly files are deltas, not year-to-date** — Nothing in the file says whether a month's values are the month's movement or the cumulative position. They are deltas: January 2025 alone shows R$1.76T committed (annual payroll and debt are committed up front), later months show only what changed. | Sum months to get the year; compute cumulative series in the aggregation step. Documented because a YTD reading would over-count twelvefold. | documented | 2,167,215 (100%) — 2024: 829,599, 2025: 788,115, 2026: 549,501 | — |
| DEF-19 | **Duplicate rows** — A monthly file could repeat a line (exact duplicate) or publish two lines with identical classification and different amounts (duplicate key), and grouping would sum them silently. | Every raw row is hashed twice — all 47 fields, and the 41 dimension fields — and repeats are counted per year. The count is reported even when it is zero, because "we checked" is the point. | documented | dictionary-level (see notes) | 2024: 0 exact duplicate rows, 0 rows sharing all dimensions with another row, over 831,444 distinct rows |

<details><summary>Per-year notes generated by the pipeline</summary>

**DEF-05**

- variant b: code "-1", órgão subordinado "-3", unidade gestora "Inválido"
- variant a: code "", órgão subordinado "", unidade gestora "NAO SE APLICA"
- variant a occurs in: 202506, 202605, 202607, 202608
- variant b occurs in: 202401, 202402, 202403, 202404, 202405, 202406, 202407, 202408, 202409, 202410, 202411, 202412, 202501, 202502, 202503, 202504, 202505, 202507, 202508, 202509, 202510, 202511, 202512, 202601, 202602, 202603, 202604, 202606

**DEF-10**

- 2024 orgSup: longest name is exactly 45 bytes (column cut upstream) — 9 confirmed via overrides, 0 suspected
- 2024 elemento: longest name is exactly 45 bytes (column cut upstream) — 0 confirmed via overrides, 22 suspected
- 2025 orgSup: longest name is exactly 45 bytes (column cut upstream) — 9 confirmed via overrides, 0 suspected
- 2025 elemento: longest name is exactly 45 bytes (column cut upstream) — 0 confirmed via overrides, 23 suspected
- 2026 orgSup: longest name is exactly 45 bytes (column cut upstream) — 9 confirmed via overrides, 0 suspected
- 2026 elemento: longest name is exactly 45 bytes (column cut upstream) — 0 confirmed via overrides, 22 suspected

**DEF-12**

- 2024: Title: orgSup, orgSub, funcao, subfuncao, grupo, elemento, modalidade · UPPER: programa, po, uf · mixed (1480 upper / 1 title): acao
- 2025: Title: orgSup, orgSub, funcao, grupo, elemento, modalidade · mixed (2 upper / 99 title): subfuncao · UPPER: programa, acao, po, uf
- 2026: Title: orgSup, funcao, grupo, elemento, modalidade · mixed (1 upper / 258 title): orgSub · mixed (2 upper / 99 title): subfuncao · UPPER: programa, acao, po, uf

**DEF-13**

- 2024 po: 1503 codes with more than one name (45,088 rows carried a non-latest name)
- 2025 po: 1282 codes with more than one name (18,044 rows carried a non-latest name)
- 2026 po: 606 codes with more than one name (5,593 rows carried a non-latest name)

**DEF-14**

- 2024 programa: 26 names shared by more than one code
- 2024 acao: 24 names shared by more than one code
- 2024 po: 1731 names shared by more than one code
- 2025 programa: 25 names shared by more than one code
- 2025 acao: 19 names shared by more than one code
- 2025 po: 2291 names shared by more than one code
- 2026 programa: 20 names shared by more than one code
- 2026 acao: 13 names shared by more than one code
- 2026 po: 1558 names shared by more than one code

**DEF-15**

- 2024: 320 distinct PO codes expand to 14,773 (órgão subordinado, ação, PO) keys
- 2025: 315 distinct PO codes expand to 16,685 (órgão subordinado, ação, PO) keys
- 2026: 320 distinct PO codes expand to 13,751 (órgão subordinado, ação, PO) keys

**DEF-19**

- 2024: 0 exact duplicate rows, 0 rows sharing all dimensions with another row, over 831,444 distinct rows
- 2025: 0 exact duplicate rows, 0 rows sharing all dimensions with another row, over 789,883 distinct rows
- 2026: 0 exact duplicate rows, 0 rows sharing all dimensions with another row, over 550,532 distinct rows

</details>
<!-- defects:end -->

Duplicates are checked, not assumed: DEF-19 hashes every raw row twice (all 47 fields, and
the 41 dimension fields) and found **0 exact and 0 key duplicates** in each of the three
years, so grouping never adds two published lines together silently.

Two things the counts caught that reading the files did not: the truncation is at 45
**UTF-8 bytes**, not characters (so "Ministério da Justiça e Segurança Pública" is
complete at exactly 45 bytes while "Ministério da Ciência, Tecnologia e Inovaç" is not),
and the first version of the rule chain nulled placeholders (DEF-06) *before* the rules
that count them (DEF-04, DEF-07) ran, which zeroed two counts. The order is now asserted
in a test.

## Architecture decisions

Full write-up with alternatives in [docs/decisions.md](docs/decisions.md). The short version:

- **Aggregation: hybrid.** Build-time pre-aggregates answer the question in the static
  HTML before JavaScript runs; every filter after that runs client-side in a **Web Worker**
  over dictionary-encoded typed arrays. Server-side lost on network latency (a round trip
  from Brazil to us-east is already the whole 200 ms budget); pure build-time lost because a
  drill-down needs rows; DuckDB-WASM lost because it outsources the work being demonstrated.
- **Storage: static columnar files on the CDN.** A ~100-line hand-rolled container
  (`lib/data/columnar.ts`) instead of Parquet — no dependency, every byte explainable —
  with a SHA-256 in the manifest that the client checks before inflating.
- **Virtualization: TanStack Virtual, no table library.** The worker returns a
  `Uint32Array` of row indexes; cells read from typed arrays by index; ~30 rows in the DOM.
  A table library would only have rendered headers while materializing row objects on the
  main thread — the exact cost being removed.
- **Filtering and search: in the worker, integer-keyed.** Allow-masks over dictionary ids,
  accent-folded search over ≤ 17k dictionary strings, and a stable LSD radix sort because
  every sort key is an integer. Search input is deferred; every answer carries the request
  id it belongs to.
- **Charting: Recharts 3, stress-tested** rather than trusted. See Performance.

## Performance

Method, modes and how to reproduce: [docs/perf.md](docs/perf.md). The table below is
written by `scripts/perf/measure.ts` (Playwright over a production build) and copied here
by `pnpm readme:perf`:

<!-- perf:start -->
Measured 2026-09-19 on Intel(R) Core(TM) Ultra 7 165U, 33 GB RAM, headless Chromium via Playwright, production build served locally (`next start`). 5 runs per cell; values are medians of interaction → next painted frame, in ms. Engine = filter+sort time alone (worker or main thread). JS heap is the main thread's (`Performance.getMetrics`); in modes C/D the ~22 MB slice also lives in the worker, which is not counted here.

| Mode | Load → first rows | JS heap after load | sort by Paid | search "universidade" | clear search | months jun–dez | filter agency (Educação) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A · naive, plain table, 10k rows in DOM | 3326 ms | 127 MB | **2974** (engine 188) | **2916** (engine 635) | **2446** (engine 193) | **1673** (engine 121) | **2286** (engine 44) |
| A · naive, plain table, 50k rows in DOM | 14154 ms | 276 MB | **18792** (engine 213) | **16420** (engine 630) | **13251** (engine 216) | **8955** (engine 132) | **15234** (engine 47) |
| B · naive compute, virtualized rows (all rows) | 879 ms | 91 MB | **214** (engine 189) | **614** (engine 601) | **197** (engine 172) | **133** (engine 114) | **73** (engine 43) |
| C · worker + typed arrays + virtualized grid, comparator sort (all rows) | 907 ms | 27 MB | **148** (engine 77) | **97** (engine 32) | **144** (engine 79) | **124** (engine 51) | **96** (engine 28) |
| D · C + radix sort in the worker (all rows) — shipped | 906 ms | 28 MB | **94** (engine 30) | **77** (engine 16) | **96** (engine 41) | **87** (engine 19) | **91** (engine 19) |

Row counts after each step (mode D): sort by Paid → 315,755; search "universidade" → 76,498; clear search → 315,755; months jun–dez → 195,852; filter agency (Educação) → 80,203.
<!-- perf:end -->

What each step removed:

1. **A → B, virtualization.** Rendering 50k `<tr>`s costs 10–19 s per interaction; 30
   rows cost nothing. The compute is unchanged (engine ≈ 180–650 ms), so B is bounded by
   the main-thread filter and sort over 328k objects.
2. **B → C, typed arrays in a worker.** Rows become dictionary ids in `Uint8/16Array`s and
   centavos in `Float64Array`s; filtering is integer compares over contiguous memory, and
   it happens off the main thread. The search step drops from ~600 ms to ~90 ms because the
   naive version folded and concatenated six strings per row per keystroke.
3. **C → D, radix sort.** The comparator sort was the last main cost in the engine (≈75 ms
   for 315k rows); a 3-pass LSD radix over integer keys does it in ≈31 ms.

Engine-only numbers (Node, same code): [docs/perf.md#engine-micro-benchmark](docs/perf.md#engine-micro-benchmark-node-pnpm-perfbench-2025).

**Recharts under load.** The dashboard's charts are small on purpose. `/experiments/chart-stress`
draws N points through Recharts and on a canvas (`pnpm perf:chart`):

| Points | Recharts (SVG) to paint | SVG nodes | Canvas draw |
| --- | --- | --- | --- |
| 1,000 | 99 ms | 3,080 | 0.7 ms |
| 10,000 | 620 ms | 30,080 | 2.7 ms |
| 50,000 | 3114 ms | 150,080 | 27.3 ms |
| 100,000 | 7823 ms | 300,080 | 51.6 ms |

Three SVG nodes per point and linear growth: fine for 36 bars, not an option for a
"every budget line over time" view. That view was not built; uPlot or a raw canvas is the
named replacement if it ever is.

**Data delivery.** The three data files are `<link rel="preload">`ed from the prerendered
`<head>` and served under content-hashed `?v=` URLs with `Cache-Control: immutable`, and
the dictionary and columns download in parallel. Measured with `pnpm perf:load` (cold cache,
medians of 3): the first data request leaves at **15 ms** instead of 323 ms on desktop and
at **0.18 s** instead of 3.9 s on slow 4G; a warm mobile load drops from 1.86 s to 1.45 s.
The cold slow-4G load only improves 7% (24.7 → 22.9 s) because the 3.5 MB slice is the
ceiling there, not the latency — see [docs/perf.md](docs/perf.md#data-delivery).

**Lighthouse** (13.5, production build, localhost, `pnpm perf:lighthouse`, reports in
`docs/lighthouse-*.json`): desktop **100 / 100 / 100 / 100** (FCP 0.2 s, LCP 0.6 s,
TBT 40 ms, CLS 0); mobile preset **90** performance (LCP 2.1 s, TBT 370 ms; 87–90 across
runs) with 100 on the other three. The 3.5 MB slice loads after first paint and does not
block LCP because the headline tiles are static HTML. Details in [docs/perf.md](docs/perf.md#lighthouse).

## Accessibility

- The table is an ARIA **grid** with `aria-rowcount` / `aria-colcount` and absolute
  `aria-rowindex` on virtual rows; Tab lands on the active cell (roving focus), arrows /
  Page Up-Down / Ctrl+Home-End move, Shift+Tab walks the sortable headers on the way out,
  `aria-sort` on headers, and a polite live region announcing "N of M lines match".
- Every chart has a `role="img"` summary sentence and a **View as table** toggle, so identity
  and values are never colour-alone. Categorical colours follow a validated CVD-safe order.
  The chart SVGs themselves are inert to the keyboard (Recharts' accessibility layer is off:
  it would add a focusable, unnamed `role="application"` inside the figure, which axe does
  not flag but a screen-reader user would hit); the table view is the keyboard/SR path.
- Filters are native `<select>`s and checkboxes inside a popover; no custom widget stands
  between the keyboard and the state.
- `e2e/a11y.spec.ts` runs axe (WCAG 2.1 AA + best practices) over the **ready, loading, error
  (network and checksum), empty-filter, partial-data and stale-data** states and a
  keyboard-only walkthrough. Bar: no critical or serious violations; the suite currently
  reports none at any level.
- **Trade-off taken:** a virtualized grid cannot be "read all the way through" by a screen
  reader — only ~30 rows exist at a time. Mitigations: the counts and announcements above,
  sortable headers, and the charts' table views. A CSV export of the current filter is the
  next step (see below).
- Bugs the e2e suite found: a pending programmatic focus stealing focus back from a header
  button; the chart table view not being keyboard-scrollable; a missing `<main>` landmark;
  network failures surfacing as "engine" errors; and — only once the walkthrough pressed
  real keys instead of calling `.focus()` — a Shift+Tab trap: the grid container handed focus
  back to the active cell whenever it received it, including from its own header row.

## The five states

| State | What it means here | Where |
| --- | --- | --- |
| Loading | Pre-aggregated headline numbers are in the HTML; the 3.5 MB slice then downloads with a byte-progress bar and a phase label (download → checksum → inflate → decode → index). | `components/states/LoadingProgress.tsx` |
| Error | Network, checksum mismatch, malformed file, worker crash — each with its own copy and a Retry that terminates the worker, starts a fresh one and reloads the year bypassing the HTTP cache (`cache: 'reload'`). The summary above stays. | `components/states/ErrorPanel.tsx` |
| Empty filter | "0 of 328,263 lines match", the active filters, and **Remove last filter** (search first, then the most recent dimension, then months). Charts keep their axes. | `components/states/EmptyFilter.tsx` |
| Partial data | 2026 has 9 of 12 months (banner: not comparable to a closed year); 12,508 lines in 2025 have no agency in the source (DEF-05) and are excluded from rankings with a one-click include; truncated names carry a ‡ and a tooltip. | `components/states/Banners.tsx` |
| Stale data | The badge shows the source's `Last-Modified` and turns when the file is older than 45 days or the next expected monthly file is late. | `components/states/Banners.tsx` |

## What I would do differently / known limitations

- **Parquet.** The hand-rolled columnar container was the right call for a portfolio piece
  (explainable, dependency-free) and the wrong one for a team: Parquet + `hyparquet` gets
  column projection and a format other tools read.
- **One year in memory at a time.** Year-over-year comparison uses pre-aggregates only. A
  cross-year table would need ~65 MB of typed arrays or a server.
- **Mobile.** The naive baseline is desktop-only by nature; the shipped grid works on a phone
  but a 15-column horizontal scroll is a compromise, not a design.
- **Search is prefix-free substring matching over names**, not ranked. Good enough for
  ~17k distinct strings; would not be for free text.
- **The DEF-10 override table is hand-curated** (9 full names plus 1 entry marking a
  45-byte name as verified complete). It is the only manual data in the repo and it is
  labelled as such; it will need a new entry when a ministry is renamed.
- **No CSV export of the current filter yet**, which is the honest answer to "how does a
  screen-reader user get the whole table".
- **Licence text** for the bulk files is inferred from the decree, not quoted from the
  download page — see The data.
- **The radix sort assumes integer keys**; a future float measure would need the
  comparator path (still present) or a float-to-sortable-int transform.
- **Mobile TBT is 380 ms** on Lighthouse's throttled profile: after the worker finishes, the
  main thread still clones ~17k dictionary entries and decodes the columns for cell reads.
  Sending the dictionaries as a shared buffer, or decoding lazily per visible column, is the
  next measured change.

## Running locally

```bash
pnpm install
pnpm data:download   # 33 zips (234 MB) into data/raw/, registered in data/manifest.json
pnpm data:build      # pipeline: ~75 s, writes public/data/v1/ and the defects report
pnpm readme:defects  # regenerates the defects table above
pnpm dev             # http://localhost:3000
```

Tests: `pnpm test` (Vitest: rules on real rows, columnar codec, engine vs. pre-aggregates,
radix vs. comparator, URL codec), `pnpm e2e` (Playwright + axe, builds and serves on :3100),
`pnpm typecheck`, `pnpm lint`. CI runs all of them on every push, plus the per-year source
download and the determinism check.

## Deploying

Vercel, zero configuration: the artifacts under `public/data/` are committed and served as
static files, and the page is prerendered. Push the repo, import it in Vercel, done. The
`data-determinism` CI job re-downloads the sources and rebuilds on every push so the
committed artifacts never drift from the code.

## Project structure

```
app/                    page (static, pre-aggregates baked in), layout, experiments/chart-stress
components/             Dashboard, BudgetLinesTable (ARIA grid), charts/, filters/, states/, naive/
hooks/useDataset.ts     worker client, year loading, query lifecycle
lib/data/               columnar codec, loader (progress + SHA-256 + inflate), engine, worker, aggregates, naive baseline
lib/filters/            URL <-> filter state
lib/perf.ts             interaction -> commit -> paint marks
scripts/pipeline/       00-download … 05-emit, rules/DEF-*.ts, verify (determinism)
scripts/perf/           measure.ts (Playwright), engine-bench.ts
scripts/readme/         defects-table.ts, perf-table.ts
schema/                 raw header (typo included), órgão superior name overrides
data/manifest.json      what was downloaded (URL, bytes, Last-Modified, sha256); raw zips are git-ignored
public/data/v1/         generated artifacts per year + defects-report.json + index.json
docs/                   sources.md, decisions.md, perf.md, perf-results.md
e2e/                    axe + keyboard suite over the five states
```

## Glossary

| Term | Meaning |
| --- | --- |
| Empenhado | Committed: the agency reserved budget for a specific expense. |
| Liquidado | Verified: the good or service was delivered and the obligation confirmed. |
| Pago | Paid: money actually left the Treasury. |
| Restos a pagar (RP) | Prior-year commitments carried into the current year. |
| Órgão superior | Top-level agency (ministry or equivalent). |
| Plano orçamentário (PO) | Budget plan: a sub-division of an action, unique only within (agency, action). |
