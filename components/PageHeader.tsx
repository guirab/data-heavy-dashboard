import { StaleBadge } from '@/components/states/Banners'

interface PageHeaderProps {
  source: { name: string; publisher: string; page: string }
  sourceLastModified: string | null
  lastPublished: { year: number; month: number }
}

export function PageHeader({ source, sourceLastModified, lastPublished }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Federal spending gap — commitments vs. payments</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Which Brazilian federal agencies commit money they don&apos;t end up paying, and does the gap close over the fiscal year? Source:{' '}
          <a className="underline underline-offset-2" href={source.page} target="_blank" rel="noreferrer">
            {source.name}
          </a>{' '}
          ({source.publisher}).
        </p>
      </div>
      <StaleBadge sourceLastModified={sourceLastModified} lastPublished={lastPublished} />
    </header>
  )
}
