'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { DatasetClient, DatasetError, type LoadedYearView } from '@/lib/data/client'
import type { LoadProgress, Query, QueryResult } from '@/types/query'

export type DatasetState =
  | { status: 'loading'; year: number; progress: LoadProgress | null }
  | { status: 'ready'; year: number; data: LoadedYearView }
  | { status: 'error'; year: number; error: DatasetError }

/** One worker per page. It outlives the dashboard component; a year switch reloads inside it. */
let singleton: DatasetClient | null = null
const subscribeNever = () => () => {}
export function useDatasetClient(): DatasetClient | null {
  return useSyncExternalStore(
    subscribeNever,
    () => (singleton ??= new DatasetClient()),
    () => null,
  )
}

interface YearSlot {
  year: number
  attempt: number
  state: DatasetState
}

export function useYear(client: DatasetClient | null, year: number) {
  const [attempt, setAttempt] = useState(0)
  const [slot, setSlot] = useState<YearSlot | null>(null)

  useEffect(() => {
    if (!client) return
    let alive = true
    const put = (state: DatasetState) => alive && setSlot({ year, attempt, state })
    client
      .load(year, (progress) => put({ status: 'loading', year, progress }))
      .then((data) => put({ status: 'ready', year, data }))
      .catch((e: DatasetError) => {
        if (e.message !== 'superseded') put({ status: 'error', year, error: e })
      })
    return () => {
      alive = false
    }
  }, [client, year, attempt])

  // A slot for another year (or attempt) is stale: report "loading" until the new one lands.
  const state: DatasetState = slot && slot.year === year && slot.attempt === attempt ? slot.state : { status: 'loading', year, progress: null }
  return { state, retry: () => setAttempt((a) => a + 1) }
}

export interface QueryStats {
  /** Time inside the worker's engine. */
  engineMs: number
  /** postMessage round trip including engine time, as seen by the main thread. */
  roundTripMs: number
}

interface Resolved {
  key: string
  result: QueryResult
  stats: QueryStats
}

/**
 * Runs `query` in the worker whenever it changes. Keeps the previous result
 * while the next one is pending, and drops answers that arrive out of order.
 * `scope` (the loaded year) is part of the key so a result never outlives its slice.
 */
export function useQuery(client: DatasetClient | null, ready: boolean, scope: string, query: Query) {
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [error, setError] = useState<{ key: string; error: DatasetError } | null>(null)
  const key = `${scope}|${JSON.stringify(query)}`

  useEffect(() => {
    if (!client || !ready) return
    let alive = true
    const t0 = performance.now()
    client
      .query(JSON.parse(key.slice(key.indexOf('|') + 1)) as Query)
      .then((result) => alive && setResolved({ key, result, stats: { engineMs: result.engineMs, roundTripMs: performance.now() - t0 } }))
      .catch((e: DatasetError) => alive && e.message !== 'superseded' && setError({ key, error: e }))
    return () => {
      alive = false
    }
  }, [client, ready, key])

  const current = ready && resolved && resolved.key.startsWith(`${scope}|`) ? resolved : null
  return {
    result: current?.result ?? null,
    stats: current?.stats ?? null,
    pending: ready && current?.key !== key,
    error: error && error.key === key ? error.error : null,
  }
}
