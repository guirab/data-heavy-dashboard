'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from 'cn'
import type { TypedColumn } from '@/lib/data/columnar'
import { formatBRL, MONTHS_PT } from '@/lib/data/format'
import { measureCommit } from '@/lib/perf'
import type { Dictionaries, Dimension } from '@/types/dataset'
import type { SortKey } from '@/types/query'

export interface ColumnDef {
  key: SortKey
  label: string
  width: number
  kind: 'month' | 'dim' | 'measure' | 'gap'
}

export const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'month', label: 'Month', width: 64, kind: 'month' },
  { key: 'orgSup', label: 'Agency', width: 220, kind: 'dim' },
  { key: 'orgSub', label: 'Sub-agency', width: 220, kind: 'dim' },
  { key: 'funcao', label: 'Function', width: 140, kind: 'dim' },
  { key: 'programa', label: 'Program', width: 200, kind: 'dim' },
  { key: 'acao', label: 'Action', width: 240, kind: 'dim' },
  { key: 'po', label: 'Budget plan', width: 240, kind: 'dim' },
  { key: 'grupo', label: 'Group', width: 160, kind: 'dim' },
  { key: 'elemento', label: 'Element', width: 190, kind: 'dim' },
  { key: 'modalidade', label: 'Modality', width: 170, kind: 'dim' },
  { key: 'uf', label: 'UF', width: 52, kind: 'dim' },
  { key: 'empenhado', label: 'Committed', width: 140, kind: 'measure' },
  { key: 'liquidado', label: 'Verified', width: 140, kind: 'measure' },
  { key: 'pago', label: 'Paid', width: 140, kind: 'measure' },
  { key: 'gap', label: 'Gap', width: 140, kind: 'gap' },
]

export const ROW_HEIGHT = 36
const TOTAL_WIDTH = TABLE_COLUMNS.reduce((s, c) => s + c.width, 0)

interface BudgetLinesTableProps {
  columns: Record<string, TypedColumn>
  dict: Dictionaries
  ids: Uint32Array
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (key: SortKey) => void
  /** Worker engine time for the result being shown, for the perf log. */
  engineMs?: number
  height?: number
}

export function BudgetLinesTable({ columns, dict, ids, sort, onSort, engineMs, height = 560 }: BudgetLinesTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const focusPending = useRef(false)

  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })
  const items = virtualizer.getVirtualItems()

  // Interaction → commit measurement: the moment the new ids are on screen.
  useLayoutEffect(() => {
    measureCommit({ engineMs, rows: ids.length })
  }, [ids, engineMs])

  // Keep the active cell valid when the result shrinks.
  useEffect(() => {
    if (ids.length && active.r >= ids.length) setActive((a) => ({ ...a, r: ids.length - 1 }))
  }, [ids.length, active.r])

  // Move DOM focus to the active cell once it is rendered — unless the user has
  // meanwhile moved focus elsewhere (a header button, another control).
  useEffect(() => {
    if (!focusPending.current) return
    // Focus falls to <body> when the previously focused cell is virtualized away; that is
    // still "ours". Anything else focused (a header button, a filter) wins.
    const current = document.activeElement
    const ours = !current || current === document.body || (scrollRef.current?.contains(current) && !current.closest('[role="columnheader"]'))
    if (!ours) {
      focusPending.current = false
      return
    }
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-r="${active.r}"][data-c="${active.c}"]`)
    if (el) {
      el.focus({ preventScroll: true })
      focusPending.current = false
    }
  })

  const move = useCallback(
    (r: number, c: number) => {
      const nr = Math.max(0, Math.min(ids.length - 1, r))
      const nc = Math.max(0, Math.min(TABLE_COLUMNS.length - 1, c))
      focusPending.current = true
      setActive({ r: nr, c: nc })
      virtualizer.scrollToIndex(nr, { align: 'auto' })
      const cellLeft = TABLE_COLUMNS.slice(0, nc).reduce((s, col) => s + col.width, 0)
      const el = scrollRef.current
      if (el) {
        if (cellLeft < el.scrollLeft) el.scrollLeft = cellLeft
        else if (cellLeft + TABLE_COLUMNS[nc].width > el.scrollLeft + el.clientWidth) el.scrollLeft = cellLeft + TABLE_COLUMNS[nc].width - el.clientWidth
      }
    },
    [ids.length, virtualizer],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    const page = Math.max(1, Math.floor(height / ROW_HEIGHT) - 1)
    const { r, c } = active
    switch (e.key) {
      case 'ArrowDown': move(r + 1, c); break
      case 'ArrowUp': move(r - 1, c); break
      case 'ArrowRight': move(r, c + 1); break
      case 'ArrowLeft': move(r, c - 1); break
      case 'PageDown': move(r + page, c); break
      case 'PageUp': move(r - page, c); break
      case 'Home':
        if (e.ctrlKey) move(0, 0)
        else move(r, 0)
        break
      case 'End':
        if (e.ctrlKey) move(ids.length - 1, TABLE_COLUMNS.length - 1)
        else move(r, TABLE_COLUMNS.length - 1)
        break
      default: return
    }
    e.preventDefault()
  }

  // Tab lands on the grid; hand focus to the active cell (scrolling it into view first).
  const onGridFocus = (e: React.FocusEvent) => {
    if (e.target === e.currentTarget && ids.length) move(active.r, active.c)
  }

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label="Budget lines"
      aria-rowcount={ids.length + 1}
      aria-colcount={TABLE_COLUMNS.length}
      aria-multiselectable={false}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={onGridFocus}
      className="relative overflow-auto rounded-lg border border-border bg-card text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ height }}
    >
      <div role="rowgroup" className="sticky top-0 z-10 bg-card" style={{ width: TOTAL_WIDTH }}>
        <div role="row" aria-rowindex={1} className="flex border-b border-border">
          {TABLE_COLUMNS.map((col, i) => {
            const sorted = sort.key === col.key
            const numeric = col.kind === 'measure' || col.kind === 'gap'
            return (
              <div
                key={col.key}
                role="columnheader"
                aria-colindex={i + 1}
                aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                style={{ width: col.width }}
                className={cn('shrink-0', numeric && 'text-right')}
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={cn(
                    'flex h-9 w-full items-center gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    numeric && 'flex-row-reverse',
                    sorted && 'text-foreground',
                  )}
                >
                  <span className="truncate">{col.label}</span>
                  {sorted ? (sort.dir === 'asc' ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />) : <ArrowUpDown aria-hidden className="size-3 opacity-40" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), width: TOTAL_WIDTH, position: 'relative' }}>
        {items.map((item) => (
          <Row
            key={item.key}
            index={item.index}
            row={ids[item.index]}
            top={item.start}
            columns={columns}
            dict={dict}
            activeCol={active.r === item.index ? active.c : -1}
            onCellClick={move}
          />
        ))}
      </div>
    </div>
  )
}

interface RowProps {
  index: number
  row: number
  top: number
  columns: Record<string, TypedColumn>
  dict: Dictionaries
  activeCol: number
  onCellClick: (r: number, c: number) => void
}

const Row = memo(function Row({ index, row, top, columns, dict, activeCol, onCellClick }: RowProps) {
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      className={cn('absolute left-0 flex w-full border-b border-border/60', index % 2 === 1 && 'bg-muted/30')}
      style={{ transform: `translateY(${top}px)`, height: ROW_HEIGHT }}
    >
      {TABLE_COLUMNS.map((col, c) => (
        <Cell key={col.key} col={col} c={c} r={index} row={row} columns={columns} dict={dict} active={activeCol === c} onClick={onCellClick} />
      ))}
    </div>
  )
})

interface CellProps {
  col: ColumnDef
  c: number
  r: number
  row: number
  columns: Record<string, TypedColumn>
  dict: Dictionaries
  active: boolean
  onClick: (r: number, c: number) => void
}

function Cell({ col, c, r, row, columns, dict, active, onClick }: CellProps) {
  let text: string
  let title: string | undefined
  let numeric = false
  let negative = false
  if (col.kind === 'month') {
    text = MONTHS_PT[columns.month[row] - 1]
  } else if (col.kind === 'dim') {
    const id = columns[col.key][row]
    const e = dict[col.key as Dimension][id]
    if (id === 0) {
      text = '—'
      title = 'No value in the source'
    } else {
      text = e.displayName ?? e.name
      const notes: string[] = []
      if (e.truncated === 'suspected') notes.push('Name is cut at 45 bytes in the source (DEF-10)')
      if (e.truncated === 'confirmed') notes.push(`Source publishes it truncated as “${e.name}” (DEF-10)`)
      if (e.aliases?.length) notes.push(`Also published as: ${e.aliases.join(' · ')} (DEF-13)`)
      title = notes.length ? `${text}\n${notes.join('\n')}` : text
      if (e.truncated === 'suspected') text += ' ‡'
    }
  } else {
    numeric = true
    const v = col.kind === 'gap' ? columns.empenhado[row] - columns.pago[row] : columns[col.key][row]
    negative = v < 0
    text = formatBRL(v)
  }
  return (
    <div
      role="gridcell"
      aria-colindex={c + 1}
      data-r={r}
      data-c={c}
      tabIndex={active ? 0 : -1}
      onClick={() => onClick(r, c)}
      title={title}
      style={{ width: col.width }}
      className={cn(
        'flex h-full shrink-0 items-center truncate px-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        numeric && 'tabular justify-end',
        negative && 'text-status-critical',
      )}
    >
      <span className="truncate">{text}</span>
    </div>
  )
}
