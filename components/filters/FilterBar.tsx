'use client'

import { useId, useMemo } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MONTHS_PT } from '@/lib/data/format'
import { FILTERABLE, type FilterAction, type FilterState } from '@/lib/filters/filters'
import type { Dictionaries, Dimension } from '@/types/dataset'
import { DimensionFilter } from './DimensionFilter'

const DIM_LABEL: Record<Dimension, string> = {
  orgSup: 'Agency',
  orgSub: 'Sub-agency',
  funcao: 'Function',
  subfuncao: 'Sub-function',
  programa: 'Program',
  acao: 'Action',
  po: 'Budget plan',
  grupo: 'Expense group',
  elemento: 'Element',
  modalidade: 'Modality',
  uf: 'State (UF)',
}

interface FilterBarProps {
  filters: FilterState
  dispatch: (a: FilterAction) => void
  years: Array<{ year: number; partial: boolean }>
  dict: Dictionaries | null
  activeCount: number
}

/** `items` lets SelectValue show the label ("jun") instead of the raw value (6). */
const MONTH_ITEMS = MONTHS_PT.map((label, i) => ({ value: i + 1, label }))

function MonthSelect({ name, value, onChange }: { name: string; value: number; onChange: (m: number) => void }) {
  return (
    <Select items={MONTH_ITEMS} value={value} onValueChange={(m) => m !== null && onChange(m)}>
      <SelectTrigger aria-label={name}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent aria-label={name} align="start" alignItemWithTrigger={false}>
        {MONTH_ITEMS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function FilterBar({ filters, dispatch, years, dict, activeCount }: FilterBarProps) {
  const id = useId()
  const yearItems = useMemo(() => years.map((y) => ({ value: y.year, label: y.partial ? `${y.year} (partial)` : String(y.year) })), [years])
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      <div className="flex items-center gap-1.5 text-sm">
        {/* The Select's id lands on its trigger button, so a plain <label for> names it. */}
        <label htmlFor={`${id}-year`} className="text-muted-foreground">
          Year
        </label>
        <Select id={`${id}-year`} items={yearItems} value={filters.year} onValueChange={(y) => y !== null && dispatch({ type: 'year', year: y })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent aria-label="Year" align="start" alignItemWithTrigger={false}>
            {yearItems.map((y) => (
              <SelectItem key={y.value} value={y.value}>
                {y.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5 text-sm" role="group" aria-label="Month range">
        <span className="text-muted-foreground">Months</span>
        <MonthSelect name="From month" value={filters.months[0]} onChange={(m) => dispatch({ type: 'months', months: [m, Math.max(m, filters.months[1])] })} />
        <span aria-hidden>–</span>
        <MonthSelect name="To month" value={filters.months[1]} onChange={(m) => dispatch({ type: 'months', months: [Math.min(filters.months[0], m), m] })} />
      </div>
      {FILTERABLE.map((d) => (
        <DimensionFilter
          key={d}
          label={DIM_LABEL[d]}
          entries={dict ? dict[d] : null}
          selected={filters.codes[d] ?? []}
          onToggle={(code) => dispatch({ type: 'toggleCode', dim: d, code })}
          onClear={() => dispatch({ type: 'setCodes', dim: d, codes: [] })}
        />
      ))}
      <Input
        type="search"
        aria-label="Search budget lines by agency, program, action or element"
        placeholder="Search names… (accent-insensitive)"
        value={filters.search}
        onChange={(e) => dispatch({ type: 'search', search: e.target.value })}
        className="w-auto min-w-56 flex-1"
      />
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'clearAll' })} className="gap-1">
          <X aria-hidden className="size-3.5" /> Clear {activeCount}
        </Button>
      )}
    </div>
  )
}

export { DIM_LABEL }
