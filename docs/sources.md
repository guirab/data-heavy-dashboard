# Data sources considered

Evaluated on 2026-09-19 by downloading real files, not from catalog descriptions. Sizes and
row counts are what arrived on disk. The chosen source is in bold.

| Source | What was measured | Verdict |
| --- | --- | --- |
| **Portal da Transparência — Execução da Despesa** (`/download-de-dados/despesas-execucao/YYYYMM`) | Monthly zips 5–11 MB → 41–84 MB CSV, 47 columns, 48k–92k rows/month. FY2025: 789,883 rows (82 MB zipped, 641 MB CSV). ISO-8859-1, `;`, decimal comma. 18 countable defects (see README). Month is a built-in trend dimension. | **Chosen.** Right size for a browser-side dataset once grouped, messy in ways that are documentable, and the empenhado/pago semantics support one sharp question. |
| Portal — Viagens a serviço (`/viagens/2025`) | 156 MB zip → 1.16 GB in 4 files; `Viagem.csv` 814,309 trips, `Trecho.csv` 1.8M rows. Header defects (a column name with a trailing space; accents missing in some files). Free-text `Motivo` makes rows ~1.3 KB. | Rejected: 2–3× the data-engineering work (4-file join), traveller names in the served data, and the natural question reads as a "gotcha" audit rather than a product. Strong runner-up. |
| Portal — CPGF, corporate card (`/cpgf/202508`) | 316 KB zip, 15,285 rows/month (≈180k/yr). 3,775 rows (25%) fully redacted ("Sigiloso", no date), 3,255 exact duplicate rows, `-1` / `NAO SE APLICA` / `SEM INFORMACAO` placeholders, transaction dates from earlier months. | Rejected: 25% redaction guts the analysis and duplicates are ambiguous (repeat purchases vs. defects). Great defect fixture, weak question. |
| Portal — Emendas parlamentares (`/emendas-parlamentares/UNICO`) | 32 MB zip; main file 94,551 rows (2014–2026), `PorFavorecido` 824,336 rows. 17,810 rows with `Código da Emenda = "Sem informação"`. | Rejected: the main table is under 100k rows; the 824k file is "which politician's money went to which company" — the politically loaded framing the brief warns about. |
| Portal — Orçamento da despesa (`/orcamento-despesa/2025`) | 860 KB zip, 26,202 rows/yr, has initial and updated appropriation. | Rejected as primary (too small); a candidate join for "budgeted vs. committed" later. |
| Portal — API (`/api-de-dados`) | Needs an e-mail-registered token; 400 req/min 06:00–23:59, 700 req/min at night; the portal itself recommends the spreadsheets for full datasets. | Rejected for ingestion: 12 requests per year in bulk vs. hundreds of thousands of paginated calls. |
| dados.gov.br catalog | The CKAN API returns 401 without a key; the site is a SPA (curl gets a 9.6 KB shell). Entries point at the same CGU files. | Not a source; useful only as the licence reference. |
| DATASUS SIH/SUS | FTP works: `RDSP2501.dbc` 18.8 MB/month (SP), `RDMG2501.dbc` 9.9 MB. DBC is a proprietary compression needing `blast-dbf` / `read.dbc` (no Node library), then DBF with coded fields that need CID-10, procedure and CNES lookup tables. | Rejected: conversion plus code tables exceed a few-weekends budget, and the "demand vs. supply" question needs two extra joins (CNES, IBGE). |
| INEP / ENEM microdata | Page lists `microdados_enem_2023/2024/2025.zip`; `download.inep.gov.br` did not answer HEAD or range requests from here (size unverified; roughly 1.5–2 GB and ~4M rows/yr from memory). | Rejected: 4M rows/yr forces server-side from day one; codebook-driven survey data is cleaner than the brief wants; well-trodden analysis. |
| CVM (DFP 2024) | `dfp_cia_aberta_2024.zip` = 13.4 MB, HTTP 200. | Rejected: structured financial statements, low mess, finance angle not the goal. |
| TSE | CDN returns 403 to non-browser clients. | Rejected: politically loaded and access friction. |
| IBGE / SIDRA | API works (`apisidra.ibge.gov.br/values/t/6579/...` → JSON). | Kept in mind as a per-capita normaliser; not needed for the chosen question. |

## Why this one

- **Volume without infrastructure.** 790k raw rows a year group to ~330k budget lines at the
  served grain, which fits in a Web Worker as typed arrays (≈22 MB decoded, 3.5 MB gzipped).
  ENEM would have forced a database on day one; CPGF and Emendas are too small to prove anything.
- **The mess is real and enumerable.** Encoding, decimal commas, a header typo, two spellings of
  "no agency", placeholders, whitespace, byte-level truncation, mid-year renames, non-unique codes
  and negative reversals — every one is counted by the pipeline (README, "Data defects").
- **One question falls out of the semantics.** Empenhado (committed), liquidado (verified) and
  pago (paid) per line and month give "who commits money they don't pay, and does it close over
  the year" without any join.
