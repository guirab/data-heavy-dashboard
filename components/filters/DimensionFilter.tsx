'use client'

import { useDeferredValue, useId, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fold } from '@/lib/data/fold'
import type { DictEntry } from '@/types/dataset'

interface DimensionFilterProps {
  label: string
  entries: DictEntry[] | null
  selected: string[]
  onToggle: (code: string) => void
  onClear: () => void
  /** Optional row count per code for the "(n)" hint. */
  counts?: Map<string, number>
}

/** Multi-select over a dictionary: a popover with a search box and native checkboxes (keyboard-complete). */
export function DimensionFilter({ label, entries, selected, onToggle, onClear, counts }: DimensionFilterProps) {
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const id = useId()
  const options = useMemo(() => {
    if (!entries) return []
    const list = entries
      .map((e, i) => ({ code: e.code, name: e.displayName ?? e.name, id: i }))
      .filter((o) => o.code !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    const f = fold(dq)
    return f ? list.filter((o) => fold(o.name).includes(f) || o.code!.includes(f)) : list
  }, [entries, dq])
  const n = selected.length
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5" aria-label={`${label}${n ? `, ${n} selected` : ''}`} disabled={!entries} />
        }
      >
        {label}
        {n > 0 && <span className="rounded-sm bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">{n}</span>}
        <ChevronDown aria-hidden className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-border p-2">
          <input
            type="search"
            aria-label={`Search ${label}`}
            placeholder={`Search ${label.toLowerCase()}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <ul role="group" aria-labelledby={`${id}-legend`} className="max-h-72 overflow-y-auto p-1">
          <li id={`${id}-legend`} className="sr-only">
            {label} options
          </li>
          {options.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">No match</li>}
          {options.map((o) => {
            const checked = selected.includes(o.code!)
            return (
              <li key={o.code}>
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <input type="checkbox" className="size-3.5 accent-primary" checked={checked} onChange={() => onToggle(o.code!)} />
                  <span className="min-w-0 flex-1 truncate" title={o.name}>
                    {o.name}
                  </span>
                  {counts?.has(o.code!) && <span className="tabular text-xs text-muted-foreground">{counts.get(o.code!)!.toLocaleString('en-US')}</span>}
                </label>
              </li>
            )
          })}
        </ul>
        {n > 0 && (
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
