import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from './worker/protocol'

/** Stand-in for the browser Worker: records what was posted and lets a test answer. */
class FakeWorker {
  static instances: FakeWorker[] = []
  posted: WorkerRequest[] = []
  terminated = false
  onmessage: ((ev: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  constructor(public url: URL) {
    FakeWorker.instances.push(this)
  }
  postMessage(req: WorkerRequest) {
    this.posted.push(req)
  }
  terminate() {
    this.terminated = true
  }
  answer(msg: WorkerResponse) {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>)
  }
  crash(message: string) {
    this.onerror?.({ message } as ErrorEvent)
  }
}

const latest = () => FakeWorker.instances[FakeWorker.instances.length - 1]

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => vi.unstubAllGlobals())

// Imported after the stub so the module sees the fake at construction time.
const client = async () => new (await import('./client')).DatasetClient()

describe('DatasetClient', () => {
  it('routes answers by request id and maps error kinds', async () => {
    const { DatasetError } = await import('./client')
    const c = await client()
    const q = c.query({ filters: {}, months: [1, 12], search: '', includeNoAgency: false, sort: { key: 'gap', dir: 'desc' } })
    const w = latest()
    expect(w.posted).toHaveLength(1)
    const id = w.posted[0].id
    w.answer({ id: 999, type: 'error', kind: 'engine', message: 'stale answer, ignored' })
    w.answer({ id, type: 'error', kind: 'engine', message: 'unknown sort key "nope"' })
    await expect(q).rejects.toMatchObject({ kind: 'engine', message: 'unknown sort key "nope"' })
    await expect(q).rejects.toBeInstanceOf(DatasetError)
  })

  it('rejects in-flight requests with kind "worker" when the worker crashes', async () => {
    const c = await client()
    const load = c.load(2025)
    latest().crash('out of memory')
    await expect(load).rejects.toMatchObject({ kind: 'worker', message: 'out of memory' })
  })

  it('restart() terminates the worker, supersedes pending requests and posts to a fresh one', async () => {
    const { SUPERSEDED } = await import('./client')
    const c = await client()
    const first = latest()
    const stale = c.load(2025)
    c.restart()
    expect(first.terminated).toBe(true)
    await expect(stale).rejects.toMatchObject({ message: SUPERSEDED })
    expect(FakeWorker.instances).toHaveLength(2)
    const fresh = latest()
    expect(fresh).not.toBe(first)
    // The retry reload goes to the new worker and bypasses the HTTP cache.
    void c.load(2025, undefined, { reload: true })
    expect(first.posted).toHaveLength(1)
    expect(fresh.posted).toEqual([{ id: expect.any(Number), type: 'load', year: 2025, reload: true }])
  })

  it('a newer load supersedes the previous one', async () => {
    const { SUPERSEDED } = await import('./client')
    const c = await client()
    const old = c.load(2024)
    void c.load(2025)
    await expect(old).rejects.toMatchObject({ message: SUPERSEDED })
    expect(latest().posted.map((r) => (r.type === 'load' ? r.year : null))).toEqual([2024, 2025])
  })
})
