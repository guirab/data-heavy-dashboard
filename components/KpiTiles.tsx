import { formatBRL, formatPct } from '@/lib/data/format'
import type { Totals } from '@/lib/data/aggregates'

interface KpiTilesProps {
  totals: Totals
  preview: boolean
}

export function KpiTiles({ totals, preview }: KpiTilesProps) {
  const tiles = [
    { label: 'Committed (empenhado)', value: formatBRL(totals.empenhado, { compact: true }) },
    { label: 'Paid (pago)', value: formatBRL(totals.pago, { compact: true }) },
    { label: 'Gap (committed − paid)', value: formatBRL(totals.gap, { compact: true }) },
    { label: 'Paid share', value: formatPct(totals.pago, totals.empenhado) },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy={preview}>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{t.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight">{t.value}</dd>
        </div>
      ))}
    </dl>
  )
}
