Measured 2026-09-20 on Intel(R) Core(TM) Ultra 7 165U, headless Chromium via Playwright, production build served locally (`next start`). 3 runs per profile; medians in ms from navigation start. Cold = empty HTTP cache; warm = second navigation in the same context. Throttling is applied through CDP.

| Profile | Cold: first /data request | Cold: columns downloaded | Cold: first rows | Warm: first rows | Data over the wire |
| --- | --- | --- | --- | --- | --- |
| Desktop, no throttling | 323 ms | 406 ms | **932 ms** | **877 ms** | 3.88 MB |
| Mobile, 4× CPU slowdown, slow 4G | 3895 ms | 23805 ms | **24687 ms** | **1859 ms** | 3.88 MB |
