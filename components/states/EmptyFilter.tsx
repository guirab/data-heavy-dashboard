'use client'

import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatInt } from '@/lib/data/format'

interface EmptyFilterProps {
  total: number
  chips: string[]
  onClearLast: () => void
  onClearAll: () => void
}

export function EmptyFilter({ total, chips, onClearLast, onClearAll }: EmptyFilterProps) {
  return (
    <div role="status" className="rounded-lg border border-dashed border-border p-8 text-center">
      <SearchX aria-hidden className="mx-auto size-6 text-muted-foreground" />
      <h3 className="mt-3 font-medium">
        0 of {formatInt(total)} budget lines match
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        The filters below are combined with AND. The last one added is usually the one that emptied the result.
      </p>
      {chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap justify-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <li key={c} className="rounded-md bg-muted px-2 py-0.5 text-xs">
              {c}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="default" onClick={onClearLast}>
          Remove last filter
        </Button>
        <Button variant="outline" onClick={onClearAll}>
          Clear all
        </Button>
      </div>
    </div>
  )
}
