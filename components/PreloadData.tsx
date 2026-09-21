'use client'

import { preload } from 'react-dom'
import { dataUrl, YEAR_FILES } from '@/lib/data/urls'

/**
 * Emits <link rel="preload" as="fetch"> for the default year's data files into the
 * prerendered <head>, so the downloads start while the JS chunks are still arriving
 * instead of after the third one runs. The worker's fetch() then joins or reads the
 * same immutable HTTP cache entry. (Next's docs route resource hints through
 * ReactDOM.preload in a client component.)
 */
export function PreloadData({ year, version }: { year: number; version: string }) {
  for (const file of YEAR_FILES) {
    // Low priority for all three: as=fetch preloads default to High and would compete with the
    // CSS and font the LCP tiles need; low still starts them with the HTML parse.
    preload(dataUrl(year, file, version), { as: 'fetch', crossOrigin: 'anonymous', fetchPriority: 'low' })
  }
  return null
}
