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
    // The 3.5 MB columns file must not starve the JS chunks on a slow link.
    preload(dataUrl(year, file, version), { as: 'fetch', crossOrigin: 'anonymous', fetchPriority: file === 'columns.bin.gz' ? 'low' : 'auto' })
  }
  return null
}
