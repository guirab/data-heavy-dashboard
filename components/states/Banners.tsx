'use client'

import { AlertTriangle, CalendarClock, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatInt } from '@/lib/data/format'

interface PartialDataBannerProps {
  year: number
  months: number[]
}

/** Partial-data state #1: the year is not closed, so cumulative gaps are not comparable to a closed year. */
export function PartialDataBanner({ year, months }: PartialDataBannerProps) {
  const last = months[months.length - 1]
  return (
    <div role="note" className="flex items-start gap-2 rounded-md border border-status-warning/50 bg-status-warning/10 px-3 py-2 text-sm">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>{year} is a partial year</strong> — {months.length} of 12 months published (through month {last}). Commitments front-load in
        January and payments catch up over the year, so its gap is not comparable to a closed year&apos;s.
      </p>
    </div>
  )
}

interface NoAgencyNoticeProps {
  rows: number
  included: boolean
  onToggle: (value: boolean) => void
}

/** Partial-data state #2: rows the source publishes without an agency (DEF-05). */
export function NoAgencyNotice({ rows, included, onToggle }: NoAgencyNoticeProps) {
  if (rows === 0 && !included) return null
  return (
    <p className="text-xs text-muted-foreground">
      {included ? (
        <>Lines without an agency are included in totals and listed under “No agency”. </>
      ) : (
        <>{formatInt(rows)} lines match but have no agency in the source (DEF-05); they are excluded from rankings. </>
      )}
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onToggle(!included)}>
        {included ? 'Exclude them' : 'Include them'}
      </button>
    </p>
  )
}

interface StaleBadgeProps {
  sourceLastModified: string | null
  lastPublished: { year: number; month: number }
  now?: Date
}

/** Stale-data state: the badge turns when the source is older than 45 days or the next expected month is late. */
export function StaleBadge({ sourceLastModified, lastPublished, now = new Date() }: StaleBadgeProps) {
  const modified = sourceLastModified ? new Date(sourceLastModified) : null
  const ageDays = modified ? Math.floor((now.getTime() - modified.getTime()) / 86_400_000) : null
  // The portal publishes month M during M+1; expect it by the end of M+1.
  const expectedBy = new Date(Date.UTC(lastPublished.year, lastPublished.month + 1, 0))
  const nextMonthLate = now.getTime() > expectedBy.getTime() + 45 * 86_400_000
  const stale = (ageDays !== null && ageDays > 45) || nextMonthLate
  const label = modified ? `Source files dated ${modified.toISOString().slice(0, 10)}` : 'Source date unknown'
  return (
    <Badge
      variant="outline"
      // Status is carried by icon + label in foreground ink; the tinted border is decoration (contrast-safe in both modes).
      className={stale ? 'gap-1 border-status-critical/60 bg-status-critical/10 font-normal text-foreground' : 'gap-1 font-normal text-foreground'}
      title={stale ? 'A newer monthly file is probably available on the portal; regenerate with pnpm data:download && pnpm data:build' : undefined}
    >
      {stale ? <AlertTriangle aria-hidden className="size-3" /> : <CalendarClock aria-hidden className="size-3" />}
      {label}
      {stale ? ' — may be stale' : ''}
    </Badge>
  )
}
