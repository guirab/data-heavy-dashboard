Measured 2026-09-20 on Intel(R) Core(TM) Ultra 7 165U, headless Chromium via Playwright, production build served locally (`next start`). 3 runs per profile; medians in ms from navigation start. Cold = empty HTTP cache; warm = second navigation in the same context. Throttling is applied through CDP.

| Profile | Cold: first /data request | Cold: columns downloaded | Cold: first rows | Warm: first rows | Data over the wire |
| --- | --- | --- | --- | --- | --- |
| Desktop, no throttling | 15 ms | 346 ms | **903 ms** | **862 ms** | 3.88 MB |
| Mobile, 4× CPU slowdown, slow 4G | 178 ms | 22270 ms | **22880 ms** | **1449 ms** | 3.88 MB |
