/**
 * Fetches one fiscal year's artifacts with byte progress, verifies the
 * columns file against the manifest's SHA-256, inflates it and decodes the
 * columns. Runs inside the worker (default) or on the main thread (naive mode).
 */
import { gunzipSync } from 'fflate'
import type { Dictionaries, YearManifest } from '../../types/dataset.ts'
import type { LoadProgress } from '../../types/query.ts'
import { decodeColumns, type TypedColumn } from './columnar.ts'
import { dataUrl } from './urls.ts'

export class DatasetLoadError extends Error {
  readonly kind: 'network' | 'integrity' | 'format'
  constructor(kind: 'network' | 'integrity' | 'format', message: string) {
    super(message)
    this.kind = kind
  }
}

/** fetch() rejects with a bare TypeError when the network is down; give it a kind. */
async function get(url: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    throw new DatasetLoadError('network', `${url}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!res.ok) throw new DatasetLoadError('network', `${url}: HTTP ${res.status}`)
  return res
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await get(url, init)
  try {
    return (await res.json()) as T
  } catch (e) {
    throw new DatasetLoadError('format', `${url}: ${e instanceof Error ? e.message : 'invalid JSON'}`)
  }
}

async function fetchBytes(url: string, total: number, onProgress: (loaded: number) => void, init?: RequestInit): Promise<Uint8Array> {
  const res = await get(url, init)
  if (!res.body) throw new DatasetLoadError('network', `${url}: empty body`)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>
    try {
      step = await reader.read()
    } catch (e) {
      throw new DatasetLoadError('network', `${url}: connection lost after ${loaded} bytes (${e instanceof Error ? e.message : String(e)})`)
    }
    if (step.done) break
    chunks.push(step.value)
    loaded += step.value.byteLength
    onProgress(Math.min(loaded, total))
  }
  const out = new Uint8Array(loaded)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  // A CDN that transparently decoded Content-Encoding hands us raw bytes already.
  if (!isGzip) return bytes
  if (typeof DecompressionStream === 'function') {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return gunzipSync(bytes)
}

export interface LoadedYear {
  manifest: YearManifest
  dict: Dictionaries
  columns: Record<string, TypedColumn>
  /** The single ArrayBuffer every column views into (transferable to another thread). */
  buffer: ArrayBuffer
  timings: Partial<Record<LoadProgress['phase'], number>>
}

export interface LoadYearOptions {
  verify?: boolean
  /** Bypass the HTTP cache: a Retry after a checksum mismatch must not get the same bytes back. */
  reload?: boolean
  /** Content hash for immutable URLs; without it the files are revalidated on every load. */
  version?: string
}

export async function loadYear(year: number, onProgress: (p: LoadProgress) => void, opts: LoadYearOptions = {}): Promise<LoadedYear> {
  const timings: LoadedYear['timings'] = {}
  const init: RequestInit | undefined = opts.reload ? { cache: 'reload' } : undefined
  const url = (file: string) => dataUrl(year, file, opts.version)
  const mark = async <T>(phase: LoadProgress['phase'], loaded: number, total: number, fn: () => Promise<T> | T): Promise<T> => {
    onProgress({ phase, loaded, total })
    const t = performance.now()
    const v = await fn()
    timings[phase] = performance.now() - t
    return v
  }

  // The manifest goes first (it carries the byte total for the progress bar and the checksum);
  // the dictionary and the columns file are independent, so they download together.
  const manifest = await mark('manifest', 0, 0, () => fetchJson<YearManifest>(url('manifest.json'), init))
  const total = manifest.columnsGzipBytes
  const [dict, gz] = await Promise.all([
    mark('dictionary', 0, total, () => fetchJson<Dictionaries>(url('dict.json'), init)),
    mark('columns', 0, total, () => fetchBytes(url('columns.bin.gz'), total, (loaded) => onProgress({ phase: 'columns', loaded, total }), init)),
  ])
  if (opts.verify !== false && gz[0] === 0x1f && gz[1] === 0x8b) {
    const digest = await mark('verify', total, total, async () => hex(await crypto.subtle.digest('SHA-256', gz as BufferSource)))
    if (digest !== manifest.columnsSha256) {
      throw new DatasetLoadError('integrity', `columns.bin.gz hash mismatch (got ${digest.slice(0, 12)}…, manifest says ${manifest.columnsSha256.slice(0, 12)}…)`)
    }
  }
  const raw = await mark('inflate', total, total, () => inflate(gz))
  if (raw.byteLength !== manifest.columnar.byteLength) {
    throw new DatasetLoadError('format', `columns.bin is ${raw.byteLength} bytes, manifest says ${manifest.columnar.byteLength}`)
  }
  // Own a tightly-sized ArrayBuffer so it can be transferred without dragging extra bytes.
  const buffer = raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength ? (raw.buffer as ArrayBuffer) : raw.slice().buffer
  const columns = await mark('decode', total, total, () => decodeColumns(manifest.columnar, buffer))
  return { manifest, dict, columns, buffer, timings }
}
