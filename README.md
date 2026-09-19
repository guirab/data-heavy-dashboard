# Federal spending gap — commitments vs. payments

**Live demo:** _pending deploy_

Which Brazilian federal agencies commit money they don't end up paying, how big is the gap
between _empenhado_ (committed) and _pago_ (paid), and does it close over the fiscal year?
Built for anyone comparing execution discipline across ministries: budget analysts,
journalists covering public spending, and engineers who want to see a 300k-row table stay
responsive.

This README is a decision log, not a feature list. It is written for another engineer.

## The data

_Source, license, size, period, reproduction — filled in Phase 1._

## Data defects and how they were handled

Every rule below is code in `scripts/pipeline/rules/`. Counts are generated from
`public/data/v1/defects-report.json` by `pnpm readme:defects`; nothing in this table is typed
by hand.

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
| DEF-10 | **Names truncated at the source (45 UTF-8 bytes)** — Several name columns are cut at exactly 45 bytes of UTF-8 — bytes, not characters, so "Ministério da Ciência, Tecnologia e Inovaç" loses more letters than an unaccented name would. The cut happened upstream; the file cannot recover it. | Kept as published. For órgão superior, a 9-entry hand-curated override table supplies the full name (the only manual data in the repo). Entries at exactly 45 bytes elsewhere are flagged "suspected" so the UI can say so. | documented | dictionary-level (see notes) | `Ministério do Desenvolvimento Agrário e Agr` → `Ministério do Desenvolvimento Agrário e Agricultura Familiar` |
| DEF-11 | **"§" mangled to "??" upstream** — Legal references like "§§ 1º e 2º" arrive as "?? 1º e 2º": the section sign was lost before the file was exported (the file itself decodes cleanly as ISO-8859-1). | Left alone. Guessing the original character would be inventing data; the count documents the loss. | kept as-is | 2,159 (0.1%) — 2024: 1,193, 2025: 779, 2026: 187 | `DOTACOES CLASSIFICADAS COM RP 2, INCLUIDAS OU ACRESCIDAS POR EMENDA…` |
| DEF-12 | **Three naming conventions in one file** — Some name columns are Title Case with accents (órgão, função), others are UPPER CASE without accents (ação, plano orçamentário), and a few mix both across rows. | Displayed as published. Search folds accents and case so "acao" matches "AÇÃO" and "Ação". | documented | dictionary-level (see notes) | 2024: Title: orgSup, orgSub, funcao, subfuncao, grupo, elemento, modalidade · UPPER: programa, po, uf · mix… |
| DEF-13 | **Same code, different names across periods** — A code can change its name between months (renamed programs, "- DESPESAS DIVERSAS" suffixes appearing mid-year). | The dictionary keeps one entry per code with the name from the latest period; earlier names are stored as aliases and counted here. Nothing is keyed by name. | transformed | 68,725 (3.2%) — 2024: 45,088, 2025: 18,044, 2026: 5,593 | `0001: "OPERACAO CARRO-PIPA PARA DISTRIBUICAO DE AGUA NO SEMIARIDO B…` → `"0001 - OPERACAO CARRO-PIPA PARA DISTRIBUICAO EMERGENCIAL…` |
| DEF-14 | **Same name, different codes** — Distinct codes can share a display name (e.g. several "ADMINISTRACAO DA UNIDADE" plans under different actions). | Never join or group by name; all keys are codes. The count is reported so the UI can disambiguate with the code when needed. | documented | dictionary-level (see notes) | 2024 programa: 26 names shared by more than one code |
| DEF-15 | **"Código Plano Orçamentário" is not a key** — The plano orçamentário code is only unique inside an action and an agency: code "0001" under action "2000" names 30 different plans in FY2025. | Plano orçamentário is keyed by (órgão subordinado, ação, código PO); the dictionary entry points to its parent action. | transformed | dictionary-level (see notes) | 2024: 320 distinct PO codes expand to 14,773 (órgão subordinado, ação, PO) keys |
| DEF-16 | **Negative amounts** — Committed, verified and paid amounts can be negative in a month: they are reversals (estornos) of earlier commitments, not errors. | Kept as-is. Dropping or clamping them would overstate execution; the UI shows the sign and monthly cumulative series absorb them. | kept as-is | 171,039 (7.9%) — 2024: 69,872, 2025: 71,883, 2026: 29,284 | `-58524,97` |
| DEF-17 | **Rows where all six values are 0,00** — A budget line can appear in a month with every amount equal to zero (nothing committed, paid or carried over). It adds a row and no information. | Drop the row and count it. This is the only rule that drops rows; the count is asserted in validation (input = kept + dropped). | row dropped | 4,644 (0.2%) — 2024: 1,845, 2025: 1,768, 2026: 1,031 | — |
| DEF-18 | **Monthly files are deltas, not year-to-date** — Nothing in the file says whether a month's values are the month's movement or the cumulative position. They are deltas: January 2025 alone shows R$1.76T committed (annual payroll and debt are committed up front), later months show only what changed. | Sum months to get the year; compute cumulative series in the aggregation step. Documented because a YTD reading would over-count twelvefold. | documented | 2,167,215 (100%) — 2024: 829,599, 2025: 788,115, 2026: 549,501 | — |

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

</details>
<!-- defects:end -->

## Architecture decisions

_Aggregation location, storage, virtualization, filtering — each with the alternatives and
why they lost. Filled as each decision is validated by a measurement._

## Performance

_What was slow, how it was measured, what changed, what it is now. See `docs/perf.md`._

## Accessibility

_Keyboard model, ARIA grid semantics, axe results, and the tradeoffs taken._

## What I would do differently / known limitations

_Filled at the end, honestly._

## Running locally

```bash
pnpm install
pnpm data:download   # fetches the monthly zips from Portal da Transparência into data/raw/
pnpm data:build      # runs the cleaning pipeline and writes public/data/v1/
pnpm dev
```

## Glossary

| Term | Meaning |
| --- | --- |
| Empenhado | Committed: the agency reserved budget for a specific expense. |
| Liquidado | Verified: the good or service was delivered and the obligation confirmed. |
| Pago | Paid: money actually left the Treasury. |
| Restos a pagar (RP) | Prior-year commitments carried into the current year. |
| Órgão superior | Top-level agency (ministry or equivalent). |
