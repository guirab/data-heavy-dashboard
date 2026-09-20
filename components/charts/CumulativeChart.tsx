'use client'

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { MonthPoint } from '@/lib/data/aggregates'
import { formatBRL, MONTHS_PT } from '@/lib/data/format'
import { ChartFrame } from './ChartFrame'

interface CumulativeChartProps {
  series: MonthPoint[]
  year: number
  partial: boolean
  preview: boolean
  scopeLabel: string
}

const SERIES = [
  { key: 'empenhado', label: 'Committed', color: 'var(--chart-1)' },
  { key: 'liquidado', label: 'Verified', color: 'var(--chart-2)' },
  { key: 'pago', label: 'Paid', color: 'var(--chart-3)' },
] as const

function CumulativeTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as MonthPoint
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">Through {label}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular">
        {SERIES.map((s) => (
          <div key={s.key} className="contents">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
              {s.label}
            </dt>
            <dd className="text-right">{formatBRL(p[s.key], { compact: true })}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Gap</dt>
        <dd className="text-right font-medium">{formatBRL(p.empenhado - p.pago, { compact: true })}</dd>
      </dl>
    </div>
  )
}

export function CumulativeChart({ series, year, partial, preview, scopeLabel }: CumulativeChartProps) {
  const data = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const p = series.find((s) => s.month === m)
    return { month: MONTHS_PT[i], ...(p ? { empenhado: p.empenhado, liquidado: p.liquidado, pago: p.pago } : {}) }
  })
  const last = series[series.length - 1]
  const summary = last
    ? `Cumulative committed, verified and paid amounts by month for ${scopeLabel}, ${year}. By ${MONTHS_PT[last.month - 1]}: committed ${formatBRL(last.empenhado, { compact: true })}, paid ${formatBRL(last.pago, { compact: true })}, gap ${formatBRL(last.empenhado - last.pago, { compact: true })}.${partial ? ' The year is partial.' : ''}`
    : 'No data for the current filters.'

  return (
    <ChartFrame
      title="Does the gap close over the year?"
      description={`Cumulative amounts by month — ${scopeLabel}, ${year}. The distance between the top and bottom lines is the gap.`}
      summary={summary}
      preview={preview}
      table={
        <table className="w-full text-xs tabular">
          <thead className="sticky top-0 bg-card">
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 text-left font-medium">Month</th>
              {SERIES.map((s) => (
                <th key={s.key} scope="col" className="py-1 text-right font-medium">{s.label}</th>
              ))}
              <th scope="col" className="py-1 text-right font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.month} className="border-t border-border/60">
                <th scope="row" className="py-1 text-left font-normal">{MONTHS_PT[p.month - 1]}</th>
                {SERIES.map((s) => (
                  <td key={s.key} className="py-1 text-right">{formatBRL(p[s.key], { compact: true })}</td>
                ))}
                <td className="py-1 text-right">{formatBRL(p.empenhado - p.pago, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {series.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for the current filters.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          {/* See AgencyRanking: the figure's summary + table view are the accessible path. */}
          <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--viz-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--viz-axis)' }} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => formatBRL(v, { compact: true }).replace('R$ ', '')}
              tick={{ fill: 'var(--viz-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip content={CumulativeTooltip} cursor={{ stroke: 'var(--viz-axis)' }} isAnimationActive={false} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}
