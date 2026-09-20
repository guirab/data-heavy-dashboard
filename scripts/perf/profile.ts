/**
 * Device profiles for the perf scripts. "mobile" is Lighthouse's mobile preset:
 * 4× CPU slowdown and slow 4G (150 ms RTT, 1.6 Mbps down, 750 Kbps up).
 */
import type { Page } from '@playwright/test'

export type ProfileId = 'desktop' | 'mobile'

export interface Profile {
  id: ProfileId
  label: string
  viewport: { width: number; height: number }
  cpuRate: number
  network: { latency: number; downloadThroughput: number; uploadThroughput: number } | null
}

export const PROFILES: Record<ProfileId, Profile> = {
  desktop: { id: 'desktop', label: 'Desktop, no throttling', viewport: { width: 1400, height: 1000 }, cpuRate: 1, network: null },
  mobile: {
    id: 'mobile',
    label: 'Mobile, 4× CPU slowdown, slow 4G',
    viewport: { width: 390, height: 844 },
    cpuRate: 4,
    network: { latency: 150, downloadThroughput: (1.6e6) / 8, uploadThroughput: 750e3 / 8 },
  },
}

export function profileFromEnv(): Profile {
  const id = (process.env.PERF_PROFILE ?? 'desktop') as ProfileId
  const p = PROFILES[id]
  if (!p) throw new Error(`PERF_PROFILE must be one of ${Object.keys(PROFILES).join(', ')}, got "${id}"`)
  return p
}

/** Throttle CPU and network through CDP; call before the first navigation. */
export async function applyProfile(page: Page, profile: Profile) {
  if (profile.cpuRate === 1 && !profile.network) return
  const cdp = await page.context().newCDPSession(page)
  if (profile.cpuRate !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate })
  if (profile.network) {
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network })
  }
}
