Measured 2026-09-19 on Intel(R) Core(TM) Ultra 7 165U, 33 GB RAM, headless Chromium chromium via Playwright, production build served locally (`next start`). 5 runs per cell; values are medians of interaction → next painted frame, in ms. Engine = filter+sort time alone (worker or main thread).

| Mode | Load → first rows | JS heap after load | sort by Paid | search "universidade" | clear search | months jun–dez | filter agency (Educação) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A · naive, plain table, 10k rows in DOM | 3816 ms | 0 MB | **2932** (engine 180) | **2966** (engine 648) | **2467** (engine 185) | **1708** (engine 137) | **2299** (engine 40) |
| A · naive, plain table, 50k rows in DOM | 14501 ms | 0 MB | **18824** (engine 216) | **15518** (engine 651) | **13899** (engine 182) | **10145** (engine 129) | **15891** (engine 48) |
| B · naive compute, virtualized rows (all rows) | 1384 ms | 0 MB | **208** (engine 184) | **612** (engine 598) | **207** (engine 179) | **135** (engine 115) | **76** (engine 43) |
| C · worker + typed arrays + virtualized grid, comparator sort (all rows) | 1418 ms | 0 MB | **159** (engine 75) | **94** (engine 29) | **139** (engine 78) | **124** (engine 55) | **94** (engine 25) |
| D · C + radix sort in the worker (all rows) — shipped | 1407 ms | 0 MB | **98** (engine 31) | **77** (engine 19) | **101** (engine 32) | **92** (engine 32) | **90** (engine 18) |

Row counts after each step (mode D): sort by Paid → 315,755; search "universidade" → 76,498; clear search → 315,755; months jun–dez → 195,852; filter agency (Educação) → 80,203.
