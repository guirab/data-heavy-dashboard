'use client'

import { createContext, useContext, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import type { DashboardProps } from '@/components/Dashboard'
import { KpiTiles } from '@/components/KpiTiles'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { fromPreAggregates } from '@/lib/data/aggregates'

const PreviewContext = createContext<DashboardProps | null>(null)

/**
 * Server-rendered first paint: the headline numbers for the default year come
 * from the pre-aggregates baked into the HTML, so the question is answered
 * before any JavaScript runs. The interactive dashboard replaces it on mount.
 */
function StaticPreview() {
  const p = useContext(PreviewContext)
  if (!p) return null
  const yearInfo = p.index.years.find((y) => y.year === p.initialYear)!
  const view = fromPreAggregates(p.initialAgencyMonth, [1, 12], yearInfo.months, undefined, false)
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6" aria-busy="true">
      <PageHeader source={p.index.source} sourceLastModified={yearInfo.sourceLastModified} lastPublished={p.index.lastPublished} />
      <p className="text-sm text-muted-foreground">Fiscal year {p.initialYear}, all agencies. Loading the interactive view…</p>
      <KpiTiles totals={view.totals} preview />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-[420px] rounded-lg" />
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
      <Skeleton className="h-[560px] rounded-lg" />
    </main>
  )
}

const DashboardDynamic = dynamic(() => import('@/components/Dashboard').then((m) => m.Dashboard), { ssr: false, loading: StaticPreview })
const NaiveDynamic = dynamic(() => import('@/components/naive/NaiveDashboard').then((m) => m.NaiveDashboard), { ssr: false, loading: StaticPreview })

/** ?mode=naive renders the documented baseline instead of the real dashboard. */
function ModeSwitch(props: DashboardProps) {
  const naive = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get('mode') === 'naive',
    () => false,
  )
  return naive ? <NaiveDynamic {...props} /> : <DashboardDynamic {...props} />
}

export function DashboardLoader(props: DashboardProps) {
  return (
    <PreviewContext value={props}>
      <ModeSwitch {...props} />
    </PreviewContext>
  )
}
