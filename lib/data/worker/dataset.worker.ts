/// <reference lib="webworker" />
/**
 * Owns the columnar slice off the main thread. Loads one year at a time and
 * answers queries with transferable typed arrays. Stale answers are the main
 * thread's problem: every message carries the request id it answers.
 */
import { buildIndex, runQuery, type Columns, type Index } from '../engine.ts'
import { DatasetLoadError, loadYear } from '../loader.ts'
import type { Dictionaries } from '../../../types/dataset.ts'
import type { WorkerRequest, WorkerResponse } from './protocol.ts'

let state: { year: number; cols: Columns; dict: Dictionaries; index: Index } | null = null

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer)

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data
  try {
    if (req.type === 'load') {
      state = null
      const loaded = await loadYear(req.year, (progress) => post({ id: req.id, type: 'progress', progress }))
      const t = performance.now()
      const index = buildIndex(loaded.dict)
      loaded.timings.index = performance.now() - t
      state = { year: req.year, cols: loaded.columns as Columns, dict: loaded.dict, index }
      // structured-clone copy (not transfer): the worker keeps its own view for queries.
      post({ id: req.id, type: 'loaded', manifest: loaded.manifest, dict: loaded.dict, buffer: loaded.buffer, columnar: loaded.manifest.columnar, timings: loaded.timings as Record<string, number> })
    } else if (req.type === 'query') {
      if (!state) throw new DatasetLoadError('format', 'query before load')
      const result = runQuery(state.cols, state.dict, state.index, req.query)
      post({ id: req.id, type: 'result', result }, [result.ids.buffer, result.totals.buffer, result.byAgency.buffer, result.byMonth.buffer])
    }
  } catch (e) {
    const kind = e instanceof DatasetLoadError ? e.kind : 'engine'
    post({ id: req.id, type: 'error', kind, message: e instanceof Error ? e.message : String(e) })
  }
}
