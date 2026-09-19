'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30'

export function FilterBar({ filters, dispatch, years, dict, activeCount }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Year</span>
        <select className={selectClass} value={filters.year} onChange={(e) => dispatch({ type: 'year', year: Number(e.target.value) })}>
          {years.map((y) => (
            <option key={y.year} value={y.year}>
              {y.year}
              {y.partial ? ' (partial)' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1.5 text-sm" role="group" aria-label="Month range">
        <span className="text-muted-foreground">Months</span>
        <select
          className={selectClass}
          aria-label="From month"
          value={filters.months[0]}
          onChange={(e) => dispatch({ type: 'months', months: [Number(e.target.value), Math.max(Number(e.target.value), filters.months[1])] })}
        >
          {MONTHS_PT.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <span aria-hidden>–</span>
        <select
          className={selectClass}
          aria-label="To month"
          value={filters.months[1]}
          onChange={(e) => dispatch({ type: 'months', months: [Math.min(filters.months[0], Number(e.target.value)), Number(e.target.value)] })}
        >
          {MONTHS_PT.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
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
      <input
        type="search"
        aria-label="Search budget lines by agency, program, action or element"
        placeholder="Search names… (accent-insensitive)"
        value={filters.search}
        onChange={(e) => dispatch({ type: 'search', search: e.target.value })}
        className="h-8 min-w-56 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
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
