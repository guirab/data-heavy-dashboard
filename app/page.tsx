import fs from 'node:fs'
import path from 'node:path'
import type { DataIndex, YearlyRow } from '@/components/Dashboard'
import { DashboardLoader } from '@/components/DashboardLoader'
import type { AgencyMonthRow } from '@/lib/data/aggregates'

const DATA_DIR = path.join(process.cwd(), 'public', 'data', 'v1')
const read = <T,>(...p: string[]) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...p), 'utf8')) as T

/**
 * Statically prerendered: the pre-aggregates for the default year are baked
 * into the HTML, so the question is answered before any JavaScript runs.
 */
export default function Page() {
  const index = read<DataIndex>('index.json')
  const defaultYear = [...index.years].reverse().find((y) => !y.partial)?.year ?? index.years[0].year
  const agencyMonth = read<AgencyMonthRow[]>(String(defaultYear), 'agg', 'agency-month.json')
  const yearly = read<YearlyRow[]>('agg', 'yearly.json')
  return <DashboardLoader index={index} initialYear={defaultYear} initialAgencyMonth={agencyMonth} yearly={yearly} />
}
