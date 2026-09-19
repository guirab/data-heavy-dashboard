Measured 2026-09-19 on Intel(R) Core(TM) Ultra 7 165U, 33 GB RAM, headless Chromium via Playwright, production build served locally (`next start`). 5 runs per cell; values are medians of interaction → next painted frame, in ms. Engine = filter+sort time alone (worker or main thread). JS heap is the main thread's (`Performance.getMetrics`); in modes C/D the ~22 MB slice also lives in the worker, which is not counted here.

| Mode | Load → first rows | JS heap after load | sort by Paid | search "universidade" | clear search | months jun–dez | filter agency (Educação) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A · naive, plain table, 10k rows in DOM | 3326 ms | 127 MB | **2974** (engine 188) | **2916** (engine 635) | **2446** (engine 193) | **1673** (engine 121) | **2286** (engine 44) |
| A · naive, plain table, 50k rows in DOM | 14154 ms | 276 MB | **18792** (engine 213) | **16420** (engine 630) | **13251** (engine 216) | **8955** (engine 132) | **15234** (engine 47) |
| B · naive compute, virtualized rows (all rows) | 879 ms | 91 MB | **214** (engine 189) | **614** (engine 601) | **197** (engine 172) | **133** (engine 114) | **73** (engine 43) |
| C · worker + typed arrays + virtualized grid, comparator sort (all rows) | 907 ms | 27 MB | **148** (engine 77) | **97** (engine 32) | **144** (engine 79) | **124** (engine 51) | **96** (engine 28) |
| D · C + radix sort in the worker (all rows) — shipped | 906 ms | 28 MB | **94** (engine 30) | **77** (engine 16) | **96** (engine 41) | **87** (engine 19) | **91** (engine 19) |

Row counts after each step (mode D): sort by Paid → 315,755; search "universidade" → 76,498; clear search → 315,755; months jun–dez → 195,852; filter agency (Educação) → 80,203.
