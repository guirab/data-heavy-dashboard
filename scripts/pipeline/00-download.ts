/**
 * Fetch the monthly zips into data/raw/ and record what was fetched in
 * data/manifest.json (size, Last-Modified, sha256). Idempotent: an existing
 * file with a matching size is kept. The zips themselves are git-ignored.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { MANIFEST_PATH, RAW_DIR, SOURCE, YEARS, monthsOf, period, rawZipPath } from './config.ts'

export interface ManifestEntry {
  period: string
  url: string
  file: string
  bytes: number
  sha256: string
  sourceLastModified: string | null
}

export interface SourceManifest {
  source: typeof SOURCE.name
  publisher: string
  page: string
  files: ManifestEntry[]
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The portal occasionally answers a burst of downloads with 405/429/5xx (observed
 * on a GitHub runner after 28 files). Back off and retry instead of failing the run.
 */
async function fetchWithRetry(url: string, label: string, attempts = 4): Promise<{ buf: Buffer; lastModified: string | null }> {
  let lastError: Error | null = null
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      const wait = 5_000 * 3 ** (i - 1)
      console.log(`  ${label}  retry ${i}/${attempts - 1} in ${wait / 1000}s (${lastError?.message})`)
      await sleep(wait)
    }
    try {
      const res = await fetch(url, { headers: { 'User-Agent': SOURCE.userAgent }, redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { buf: Buffer.from(await res.arrayBuffer()), lastModified: res.headers.get('last-modified') }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw new Error(`${label}: ${lastError?.message} from ${url} after ${attempts} attempts`)
}

export function readManifest(): SourceManifest {
  if (!fs.existsSync(MANIFEST_PATH)) return { source: SOURCE.name, publisher: SOURCE.publisher, page: SOURCE.page, files: [] }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as SourceManifest
}

function writeManifest(m: SourceManifest) {
  m.files.sort((a, b) => a.period.localeCompare(b.period))
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n')
}

async function fetchMonth(year: number, month: number, manifest: SourceManifest) {
  const p = period(year, month)
  const url = SOURCE.downloadUrl(year, month)
  const file = rawZipPath(year, month)
  const existing = manifest.files.find((f) => f.period === p)
  if (existing && fs.existsSync(file) && fs.statSync(file).size === existing.bytes) {
    console.log(`  ${p}  cached  ${existing.bytes.toLocaleString()} bytes`)
    return
  }
  // A zip already on disk (e.g. copied from another checkout) is registered
  // without re-downloading when its size matches what the portal reports.
  if (fs.existsSync(file) && !existing) {
    const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': SOURCE.userAgent }, redirect: 'follow' })
    const size = Number(head.headers.get('content-length'))
    const local = fs.readFileSync(file)
    if (head.ok && size === local.length) {
      manifest.files.push({
        period: p,
        url,
        file: `data/raw/${file.split('/').pop()}`,
        bytes: local.length,
        sha256: sha256(local),
        sourceLastModified: head.headers.get('last-modified'),
      })
      writeManifest(manifest)
      console.log(`  ${p}  registered existing file  ${local.length.toLocaleString()} bytes`)
      return
    }
  }
  const { buf, lastModified } = await fetchWithRetry(url, p)
  if (buf.length < 1000 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`${p}: response is not a zip (${buf.length} bytes)`)
  fs.writeFileSync(file, buf)
  const entry: ManifestEntry = {
    period: p,
    url,
    file: `data/raw/${file.split('/').pop()}`,
    bytes: buf.length,
    sha256: sha256(buf),
    sourceLastModified: lastModified,
  }
  manifest.files = manifest.files.filter((f) => f.period !== p).concat(entry)
  writeManifest(manifest)
  console.log(`  ${p}  fetched ${buf.length.toLocaleString()} bytes  (${entry.sourceLastModified ?? 'no Last-Modified'})`)
  // Be polite to the portal between consecutive downloads.
  await sleep(1_000)
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true })
  const manifest = readManifest()
  for (const year of YEARS) {
    console.log(`${year}`)
    for (const month of monthsOf(year)) {
      await fetchMonth(year, month, manifest)
    }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
