import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DataIndex, YearlyRow } from '@/components/Dashboard'
import { DashboardLoader } from '@/components/DashboardLoader'
import { PreloadData } from '@/components/PreloadData'
import type { AgencyMonthRow } from '@/lib/data/aggregates'

const DATA_DIR = path.join(process.cwd(), 'public', 'data', 'v1')
const read = <T,>(...p: string[]) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...p), 'utf8')) as T

/** Content hash of every file served for a year: the ?v= that makes its URLs immutable. */
function yearVersion(year: number): string {
  const dir = path.join(DATA_DIR, String(year))
  const h = createHash('sha256')
  for (const f of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort()) {
    const full = path.join(dir, f)
    if (!fs.statSync(full).isFile()) continue
    h.update(f).update('\0').update(fs.readFileSync(full))
  }
  return h.digest('hex').slice(0, 12)
}

/**
 * Statically prerendered: the pre-aggregates for the default year are baked
 * into the HTML, so the question is answered before any JavaScript runs.
 */
export default function Page() {
  const raw = read<Omit<DataIndex, 'years'> & { years: Array<Omit<DataIndex['years'][number], 'version'>> }>('index.json')
  const index: DataIndex = { ...raw, years: raw.years.map((y) => ({ ...y, version: yearVersion(y.year) })) }
  const defaultYear = [...index.years].reverse().find((y) => !y.partial)?.year ?? index.years[0].year
  const agencyMonth = read<AgencyMonthRow[]>(String(defaultYear), 'agg', 'agency-month.json')
  const yearly = read<YearlyRow[]>('agg', 'yearly.json')
  return (
    <>
      <PreloadData year={defaultYear} version={index.years.find((y) => y.year === defaultYear)!.version} />
      <DashboardLoader index={index} initialYear={defaultYear} initialAgencyMonth={agencyMonth} yearly={yearly} />
    </>
  )
}
