/**
 * Main-thread facade over the dataset worker: promise-based requests with
 * ids, so a late answer to an earlier query can never overwrite a newer one.
 */
import type { Dictionaries, YearManifest } from '../../types/dataset.ts'
import type { LoadProgress, Query, QueryResult } from '../../types/query.ts'
import { decodeColumns, type TypedColumn } from './columnar.ts'
import type { WorkerRequest, WorkerResponse } from './worker/protocol.ts'

export interface LoadedYearView {
  year: number
  manifest: YearManifest
  dict: Dictionaries
  /** Read-only views for cell rendering; the worker holds its own copy for queries. */
  columns: Record<string, TypedColumn>
  timings: Record<string, number>
}

type Pending =
  | { type: 'load'; resolve: (v: LoadedYearView) => void; reject: (e: Error) => void; onProgress?: (p: LoadProgress) => void; year: number }
  | { type: 'query'; resolve: (v: QueryResult) => void; reject: (e: Error) => void }

export class DatasetError extends Error {
  readonly kind: 'network' | 'integrity' | 'format' | 'engine' | 'worker'
  constructor(kind: DatasetError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

export class DatasetClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, Pending>()

  constructor() {
    this.worker = new Worker(new URL('./worker/dataset.worker.ts', import.meta.url))
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data)
    this.worker.onerror = (ev) => {
      for (const p of this.pending.values()) p.reject(new DatasetError('worker', ev.message || 'worker crashed'))
      this.pending.clear()
    }
  }

  private send(req: WorkerRequest) {
    this.worker.postMessage(req)
  }

  private onMessage(msg: WorkerResponse) {
    const p = this.pending.get(msg.id)
    if (!p) return // stale or cancelled
    if (msg.type === 'progress') {
      if (p.type === 'load') p.onProgress?.(msg.progress)
      return
    }
    this.pending.delete(msg.id)
    if (msg.type === 'error') return p.reject(new DatasetError(msg.kind, msg.message))
    if (msg.type === 'loaded' && p.type === 'load') {
      return p.resolve({ year: p.year, manifest: msg.manifest, dict: msg.dict, columns: decodeColumns(msg.columnar, msg.buffer), timings: msg.timings })
    }
    if (msg.type === 'result' && p.type === 'query') return p.resolve(msg.result)
  }

  load(year: number, onProgress?: (p: LoadProgress) => void): Promise<LoadedYearView> {
    // A new load makes every in-flight request stale.
    for (const [id, p] of this.pending) {
      p.reject(new DatasetError('engine', 'superseded'))
      this.pending.delete(id)
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { type: 'load', resolve, reject, onProgress, year })
      this.send({ id, type: 'load', year })
    })
  }

  query(query: Query): Promise<QueryResult> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { type: 'query', resolve, reject })
      this.send({ id, type: 'query', query })
    })
  }

  terminate() {
    this.worker.terminate()
    this.pending.clear()
  }
}
