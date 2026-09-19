'use client'

import { useId, useState } from 'react'
import { Table2, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChartFrameProps {
  title: string
  description: string
  /** Text alternative announced to assistive tech (a sentence summarizing the chart). */
  summary: string
  table: React.ReactNode
  children: React.ReactNode
  preview?: boolean
  aside?: React.ReactNode
}

/** Every chart ships with a "view as table" toggle: identity and values are never color-alone. */
export function ChartFrame({ title, description, summary, table, children, preview, aside }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)
  const id = useId()
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-border bg-card p-4" aria-busy={preview}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`${id}-title`} className="font-medium">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {aside}
          <Button variant="ghost" size="sm" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)} className="gap-1.5">
            {showTable ? <BarChart3 aria-hidden className="size-3.5" /> : <Table2 aria-hidden className="size-3.5" />}
            {showTable ? 'View as chart' : 'View as table'}
          </Button>
        </div>
      </div>
      {showTable ? (
        <div className="mt-3 max-h-[480px] overflow-auto">{table}</div>
      ) : (
        <figure className="mt-3" role="img" aria-label={summary}>
          {children}
        </figure>
      )}
      {preview && <p className="mt-2 text-xs text-muted-foreground">Preview from pre-aggregated data — live filters apply once the budget lines finish loading.</p>}
    </section>
  )
}
