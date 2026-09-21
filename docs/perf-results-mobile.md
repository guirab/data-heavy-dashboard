Measured 2026-09-20 on Intel(R) Core(TM) Ultra 7 165U, 33 GB RAM, headless Chromium via Playwright, production build served locally (`next start`). Profile: Mobile, 4× CPU slowdown, slow 4G. 5 runs per cell; values are medians of interaction → next painted frame, in ms. Engine = filter+sort time alone (worker or main thread).

| Mode | Load → first rows | JS heap after load | sort by Paid | search "universidade" | clear search | months jun–dez | filter agency (Educação) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D · C + radix sort in the worker (all rows) — shipped | 23100 ms | 41 MB | **269** (engine 38) | **274** (engine 21) | **245** (engine 31) | **364** (engine 31) | **425** (engine 14) |

Row counts after each step (mode D): sort by Paid → 315,755; search "universidade" → 76,498; clear search → 315,755; months jun–dez → 195,852; filter agency (Educação) → 80,203.
