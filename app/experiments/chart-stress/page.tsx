import type { Metadata } from 'next'
import { ChartStress } from './ChartStress'

export const metadata: Metadata = { title: 'Experiment — Recharts under load', robots: { index: false } }

export default function Page() {
  return <ChartStress />
}
