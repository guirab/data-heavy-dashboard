# Story E — Data-heavy dashboard (draft for interview-pitch.md)

> Appended to `~/Downloads/interview-pitch.md` when the project ships. Numbers below come
> from docs/perf.md and public/data/v1/defects-report.json; update if they change.

### Story E — 330k-row dashboard in the browser (performance with measurements, messy data)

**Situation.** My resume said "data-heavy dashboards and performance work" and my public
portfolio had nothing that proved it. I picked a real, uncleaned dataset — Brazil's federal
budget execution files from Portal da Transparência, 2.17 million raw rows across 33
monthly Latin-1 CSVs — and one question: which agencies commit money they don't pay, and
does the gap close over the year.

**Task.** Ship a public dashboard that stays under 200 ms per interaction at full size,
handles the mess with a traceable pipeline, and documents every decision with numbers.

**Action.** Three decisions carried the project.

1. *Where the work happens.* I ruled out a database early: a round trip from Brazil to
   us-east is 120–250 ms, the whole budget, before any query runs. Instead the pipeline
   pre-aggregates the headline view at build time so the page answers the question in
   static HTML, and everything interactive runs in a Web Worker over dictionary-encoded
   typed arrays — 328k rows in 22 MB decoded, 3.5 MB over the wire.
2. *Naive first, then measure.* I built the obvious version first — row objects,
   `Array.filter`/`sort`, a plain table — and kept it in the repo behind a flag. Then I
   removed one cost at a time with the same Playwright script: virtualization took an
   interaction from 10–19 seconds to ~200 ms; moving to typed arrays in a worker took
   search from ~600 ms to ~90 ms; replacing the comparator sort with a radix sort over
   integer keys halved the remaining engine time. Every number is a median of 5 runs and
   the script that produced it is in the repo.
3. *The mess is the product.* Eighteen documented defects, each a rule with a count:
   Latin-1 encoding, decimal commas, a typo in a header, two different encodings of "no
   agency", names truncated upstream at 45 UTF-8 *bytes* (not characters — that one took a
   while), budget-plan codes that are only unique inside an agency and an action, and
   1,282 plans renamed mid-year. The README table is generated from the pipeline's report;
   nothing in it is typed by hand.

**Result.** Sort, search and filter over 315k rows land in 77–101 ms end-to-end, including
paint. The pipeline is byte-deterministic and CI proves it on every push. axe passes with
zero violations across the loading, error, empty, partial and stale states, and the whole
thing is keyboard-navigable — the e2e suite found two real focus bugs on the way.

**Lesson.** The interesting engineering was not the virtualized grid; it was deciding what
*not* to build (a database, a table library, dense charts Recharts could not draw) and
having the numbers to justify each "no". And the defect that taught me most was the
45-byte truncation: reading the data told me nothing; counting it did.

*If they push:* the trade-off I would revisit is the hand-rolled columnar format — right for
a portfolio (explainable, zero dependencies), wrong for a team (Parquet exists).
