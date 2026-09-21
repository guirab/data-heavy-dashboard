Measured 2026-09-21 on Intel(R) Core(TM) Ultra 7 165U, headless Chromium via Playwright, production build served locally (`next start`). 3 runs per profile; medians in ms from navigation start. Cold = empty HTTP cache; warm = second navigation in the same context. Throttling is applied through CDP.

| Profile | Cold: first /data request | Cold: columns downloaded | Cold: first rows | Warm: first rows | Data over the wire |
| --- | --- | --- | --- | --- | --- |
| Desktop, no throttling | 17 ms | 350 ms | **918 ms** | **878 ms** | 3.88 MB |
| Mobile, 4× CPU slowdown, slow 4G | 177 ms | 22269 ms | **23062 ms** | **1349 ms** | 3.88 MB |
