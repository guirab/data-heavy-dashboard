/**
 * Determinism check: hash every artifact in public/data/v1, rebuild, hash
 * again, and fail if anything differs. CI runs this on every push so the
 * committed artifacts are provably what the pipeline produces from the
 * manifest's source files.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { OUT_DIR, ROOT } from './config.ts'

function hashTree(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name)
      if (fs.statSync(p).isDirectory()) walk(p)
      else out.set(path.relative(dir, p), createHash('sha256').update(fs.readFileSync(p)).digest('hex'))
    }
  }
  walk(dir)
  return out
}

const before = hashTree(OUT_DIR)
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'pipeline', 'index.ts')], { stdio: 'inherit' })
const after = hashTree(OUT_DIR)

const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k))
if (changed.length) {
  console.error(`\nNOT DETERMINISTIC — ${changed.length} file(s) differ from the committed artifacts:\n  ${changed.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nOK — ${after.size} artifacts byte-identical after rebuild`)
