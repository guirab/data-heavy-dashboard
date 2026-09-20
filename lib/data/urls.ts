/**
 * URLs of the served data files. Kept dependency-free so the preload hint in the
 * HTML head does not pull the loader (and fflate) into the first-load bundle.
 *
 * `version` is a hash of the year's files computed at build time (app/page.tsx);
 * next.config.ts serves `?v=` URLs as immutable and bare URLs as must-revalidate.
 */
export const dataUrl = (year: number, file: string, version?: string) => `/data/v1/${year}/${file}${version ? `?v=${version}` : ''}`

/** The three files the worker needs before the first row can render, in fetch order. */
export const YEAR_FILES = ['manifest.json', 'dict.json', 'columns.bin.gz'] as const
