Measured 2026-09-20 on Intel(R) Core(TM) Ultra 7 165U, 33 GB RAM, headless Chromium via Playwright, production build served locally (`next start`). Profile: Desktop, no throttling. 5 runs per cell; values are medians of interaction → next painted frame, in ms. Engine = filter+sort time alone (worker or main thread).

| Mode | Load → first rows | JS heap after load | sort by Paid | search "universidade" | clear search | months jun–dez | filter agency (Educação) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A · naive, plain table, 10k rows in DOM | 3261 ms | 128 MB | **2792** (engine 187) | **2856** (engine 640) | **2482** (engine 188) | **1728** (engine 121) | **2213** (engine 52) |
| A · naive, plain table, 50k rows in DOM | 13931 ms | 277 MB | **18488** (engine 207) | **15022** (engine 615) | **13099** (engine 185) | **9547** (engine 127) | **14376** (engine 48) |
| B · naive compute, virtualized rows (all rows) | 882 ms | 92 MB | **213** (engine 188) | **624** (engine 610) | **198** (engine 173) | **137** (engine 112) | **63** (engine 43) |
| C · worker + typed arrays + virtualized grid, comparator sort (all rows) | 909 ms | 35 MB | **149** (engine 79) | **107** (engine 31) | **143** (engine 73) | **133** (engine 52) | **112** (engine 27) |
| D · C + radix sort in the worker (all rows) — shipped | 902 ms | 35 MB | **103** (engine 34) | **83** (engine 17) | **105** (engine 33) | **103** (engine 23) | **103** (engine 26) |

Row counts after each step (mode D): sort by Paid → 315,755; search "universidade" → 76,498; clear search → 315,755; months jun–dez → 195,852; filter agency (Educação) → 80,203.
