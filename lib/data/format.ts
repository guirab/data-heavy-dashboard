/** Integer centavos -> "R$ 1,23 bi" style compact BRL, for tiles and axes. */
export function formatBRL(centavos: number, opts: { compact?: boolean } = {}): string {
  const reais = centavos / 100
  if (opts.compact) {
    const abs = Math.abs(reais)
    const [div, suffix] = abs >= 1e12 ? [1e12, ' tri'] : abs >= 1e9 ? [1e9, ' bi'] : abs >= 1e6 ? [1e6, ' mi'] : abs >= 1e3 ? [1e3, ' mil'] : [1, '']
    const n = reais / div
    return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: n >= 100 ? 0 : n >= 10 ? 1 : 2 })}${suffix}`
  }
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
}

export const formatInt = (n: number) => n.toLocaleString('en-US')

export const formatPct = (part: number, whole: number, digits = 1) => (whole === 0 ? '—' : `${((100 * part) / whole).toFixed(digits)}%`)

export const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const
