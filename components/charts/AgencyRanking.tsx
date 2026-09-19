'use client'

import { useMemo, useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { AgencyStat } from '@/lib/data/aggregates'
import { formatBRL, formatPct } from '@/lib/data/format'
import { ChartFrame } from './ChartFrame'

interface AgencyRankingProps {
  agencies: AgencyStat[]
  /** Previous closed year's stats, keyed by agency code, for the comparison column. */
  previous?: Map<string, AgencyStat> | null
  previousYear?: number
  selectedCodes: string[]
  onToggleAgency: (code: string) => void
  preview: boolean
  year: number
}

const BAR = 20
const shortName = (name: string) => name.replace(/^Ministério (da|do|de|das|dos) /, '').replace(/^Ministério /, '')

type Datum = AgencyStat & { short: string; gapPctValue: number; gapAbs: number; prev?: AgencyStat; prevYear?: number }

function RankingTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const a = payload[0].payload as Datum
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{a.name}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular">
        <dt className="text-muted-foreground">Gap</dt>
        <dd className="text-right font-medium">
          {formatBRL(a.gap, { compact: true })} ({formatPct(a.gap, a.empenhado)})
        </dd>
        <dt className="text-muted-foreground">Committed</dt>
        <dd className="text-right">{formatBRL(a.empenhado, { compact: true })}</dd>
        <dt className="text-muted-foreground">Paid</dt>
        <dd className="text-right">{formatBRL(a.pago, { compact: true })}</dd>
        {a.prev && (
          <>
            <dt className="text-muted-foreground">Gap in {a.prevYear}</dt>
            <dd className="text-right">{formatPct(a.prev.gap, a.prev.empenhado)}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

export function AgencyRanking({ agencies, previous, previousYear, selectedCodes, onToggleAgency, preview, year }: AgencyRankingProps) {
  const [metric, setMetric] = useState<'pct' | 'abs'>('pct')
  const data = useMemo<Datum[]>(() => {
    const rows = agencies
      .filter((a) => a.code !== null)
      .map((a) => ({ ...a, short: shortName(a.name), gapPctValue: Number.isNaN(a.gapPct) ? 0 : Math.round(a.gapPct * 1000) / 10, gapAbs: a.gap / 1e11, prev: a.code ? previous?.get(a.code) : undefined, prevYear: previousYear }))
    // Rank by the metric on screen: share of commitments (discipline) or reais (size).
    return metric === 'pct' ? rows.sort((a, b) => b.gapPctValue - a.gapPctValue) : rows.sort((a, b) => b.gap - a.gap)
  }, [agencies, previous, previousYear, metric])
  const emphasis = selectedCodes.length > 0
  const height = Math.max(160, data.length * (BAR + 8) + 24)
  const top = data[0]
  const summary = top
    ? `${data.length} agencies ranked by ${metric === 'pct' ? 'the share of' : 'the amount of'} ${year} commitments not yet paid. Largest: ${top.name} at ${formatPct(top.gap, top.empenhado)} (${formatBRL(top.gap, { compact: true })}).`
    : 'No agencies match the current filters.'

  return (
    <ChartFrame
      title="Which agencies commit money they don't pay?"
      description={`Gap between committed and paid${metric === 'pct' ? ' as a share of commitments' : ' in reais'}, ${year}. Click a bar to filter the rest of the page by that agency${emphasis ? ' (selected agencies are highlighted; the others stay for comparison)' : ''}${previousYear ? `; the table view adds ${previousYear}` : ''}.`}
      summary={summary}
      preview={preview}
      aside={
        <ToggleGroup value={[metric]} onValueChange={(v) => v[0] && setMetric(v[0] as 'pct' | 'abs')} aria-label="Ranking metric" variant="outline" size="sm">
          <ToggleGroupItem value="pct" aria-label="Rank by share of commitments">
            %
          </ToggleGroupItem>
          <ToggleGroupItem value="abs" aria-label="Rank by amount in reais">
            R$
          </ToggleGroupItem>
        </ToggleGroup>
      }
      table={
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-1 pr-2 font-medium">Agency</th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">Committed</th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">Paid</th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">Gap</th>
              <th scope="col" className="py-1 text-right font-medium">Gap %</th>
              {previousYear && <th scope="col" className="py-1 pl-2 text-right font-medium">Gap % {previousYear}</th>}
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((a) => (
              <tr key={a.code} className="border-t border-border/60">
                <th scope="row" className="py-1 pr-2 text-left font-normal">{a.name}</th>
                <td className="py-1 pr-2 text-right">{formatBRL(a.empenhado, { compact: true })}</td>
                <td className="py-1 pr-2 text-right">{formatBRL(a.pago, { compact: true })}</td>
                <td className="py-1 pr-2 text-right">{formatBRL(a.gap, { compact: true })}</td>
                <td className="py-1 text-right">{formatPct(a.gap, a.empenhado)}</td>
                {previousYear && <td className="py-1 pl-2 text-right">{a.prev ? formatPct(a.prev.gap, a.prev.empenhado) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No agencies match the current filters.</p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={8}>
            <XAxis
              type="number"
              domain={metric === 'pct' ? [0, (max: number) => Math.min(100, Math.ceil(max / 10) * 10)] : [0, 'auto']}
              tickFormatter={(v: number) => (metric === 'pct' ? `${v}%` : `${v} bi`)}
              tick={{ fill: 'var(--viz-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--viz-axis)' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="short"
              width={170}
              tick={{ fill: 'var(--foreground)', fontSize: 11 }}
              tickFormatter={(v: string) => (v.length > 26 ? v.slice(0, 25) + '…' : v)}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <ReferenceLine x={0} stroke="var(--viz-axis)" />
            <Tooltip content={RankingTooltip} cursor={{ fill: 'var(--muted)' }} isAnimationActive={false} />
            <Bar
              dataKey={metric === 'pct' ? 'gapPctValue' : 'gapAbs'}
              barSize={BAR}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              onClick={(entry) => {
                const code = (entry as unknown as Datum | undefined)?.code
                if (code) onToggleAgency(code)
              }}
              className="cursor-pointer"
            >
              {data.map((a) => (
                <Cell key={a.code} fill={!emphasis || selectedCodes.includes(a.code!) ? 'var(--chart-1)' : 'var(--viz-gray)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}
