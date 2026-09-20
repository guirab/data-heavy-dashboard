import type { NextConfig } from 'next'

/** Everything under public/data/v1 that the client fetches; see lib/data/urls.ts for the ?v= scheme. */
const DATA = '/data/v1/:path*'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // A full CSP with a nonce would need dynamic rendering (the page is prerendered);
          // frame-ancestors is the part that is safe to set statically.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
      // Data files are served under fixed names (the pipeline is byte-deterministic and CI
      // diffs the artifacts), so the URL carries a content hash as ?v= instead. With it, the
      // response is immutable; without it (naive mode, hand-typed URLs), revalidate every time.
      { source: DATA, missing: [{ type: 'query', key: 'v' }], headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
      { source: DATA, has: [{ type: 'query', key: 'v' }], headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ]
  },
}

export default nextConfig
