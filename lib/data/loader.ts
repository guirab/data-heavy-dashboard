/**
 * Fetches one fiscal year's artifacts with byte progress, verifies the
 * columns file against the manifest's SHA-256, inflates it and decodes the
 * columns. Runs inside the worker (default) or on the main thread (naive mode).
 */
import { gunzipSync } from 'fflate'
import type { Dictionaries, YearManifest } from '../../types/dataset.ts'
import type { LoadProgress } from '../../types/query.ts'
import { decodeColumns, type TypedColumn } from './columnar.ts'

export class DatasetLoadError extends Error {
  readonly kind: 'network' | 'integrity' | 'format'
  constructor(kind: 'network' | 'integrity' | 'format', message: string) {
    super(message)
    this.kind = kind
  }
}

export const dataUrl = (year: number, file: string) => `/data/v1/${year}/${file}`

/** fetch() rejects with a bare TypeError when the network is down; give it a kind. */
async function get(url: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw new DatasetLoadError('network', `${url}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!res.ok) throw new DatasetLoadError('network', `${url}: HTTP ${res.status}`)
  return res
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await get(url)
  try {
    return (await res.json()) as T
  } catch (e) {
    throw new DatasetLoadError('format', `${url}: ${e instanceof Error ? e.message : 'invalid JSON'}`)
  }
}

async function fetchBytes(url: string, total: number, onProgress: (loaded: number) => void): Promise<Uint8Array> {
  const res = await get(url)
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

export async function loadYear(year: number, onProgress: (p: LoadProgress) => void, opts: { verify?: boolean } = {}): Promise<LoadedYear> {
  const timings: LoadedYear['timings'] = {}
  const mark = async <T>(phase: LoadProgress['phase'], loaded: number, total: number, fn: () => Promise<T> | T): Promise<T> => {
    onProgress({ phase, loaded, total })
    const t = performance.now()
    const v = await fn()
    timings[phase] = performance.now() - t
    return v
  }

  const manifest = await mark('manifest', 0, 0, () => fetchJson<YearManifest>(dataUrl(year, 'manifest.json')))
  const total = manifest.columnsGzipBytes
  const dict = await mark('dictionary', 0, total, () => fetchJson<Dictionaries>(dataUrl(year, 'dict.json')))
  const gz = await mark('columns', 0, total, () => fetchBytes(dataUrl(year, 'columns.bin.gz'), total, (loaded) => onProgress({ phase: 'columns', loaded, total })))
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
