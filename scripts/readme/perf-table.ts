/**
 * Copies docs/perf-results.md (written by scripts/perf/measure.ts) into the
 * README between <!-- perf:start --> / <!-- perf:end -->, so the numbers in
 * the README are the numbers the script produced. Run: pnpm readme:perf
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from '../pipeline/config.ts'

const results = fs.readFileSync(path.join(ROOT, 'docs', 'perf-results.md'), 'utf8').trim()
const readmePath = path.join(ROOT, 'README.md')
const readme = fs.readFileSync(readmePath, 'utf8')
const start = '<!-- perf:start -->'
const end = '<!-- perf:end -->'
const a = readme.indexOf(start)
const b = readme.indexOf(end)
if (a < 0 || b < 0 || b < a) throw new Error('README.md is missing the perf markers')
fs.writeFileSync(readmePath, readme.slice(0, a + start.length) + '\n' + results + '\n' + readme.slice(b))
console.log('README perf table updated from docs/perf-results.md')
