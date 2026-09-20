import type { ColumnarManifest } from '../columnar.ts'
import type { Dictionaries, YearManifest } from '../../../types/dataset.ts'
import type { LoadProgress, Query, QueryResult } from '../../../types/query.ts'

export type WorkerRequest = { id: number; type: 'load'; year: number; reload?: boolean; version?: string } | { id: number; type: 'query'; query: Query }

export type WorkerResponse =
  | { id: number; type: 'progress'; progress: LoadProgress }
  | {
      id: number
      type: 'loaded'
      manifest: YearManifest
      dict: Dictionaries
      /** A copy of the decoded columns for zero-latency cell reads on the main thread. */
      buffer: ArrayBuffer
      columnar: ColumnarManifest
      timings: Record<string, number>
    }
  | { id: number; type: 'result'; result: QueryResult }
  | { id: number; type: 'error'; kind: 'network' | 'integrity' | 'format' | 'engine'; message: string }
