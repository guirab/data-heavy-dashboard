/**
 * Minimal columnar container shared by the ingestion pipeline (writer) and the
 * browser worker (reader). Deliberately hand-rolled instead of Parquet/Arrow:
 * ~100 lines, no dependencies, and every byte is explainable in the README.
 *
 * Layout: one contiguous buffer; each column is a typed array placed at an
 * 8-byte-aligned offset. The manifest (JSON) carries the offsets, so the reader
 * can create views over the buffer without copying.
 */

export type ColumnType = 'u8' | 'u16' | 'u32' | 'f64'

export interface ColumnSpec {
  name: string
  type: ColumnType
  /** byte offset into the buffer */
  offset: number
  /** number of elements (== rows) */
  length: number
}

export interface ColumnarManifest {
  format: 'columnar-v1'
  rows: number
  byteLength: number
  columns: ColumnSpec[]
}

export type TypedColumn = Uint8Array | Uint16Array | Uint32Array | Float64Array

export type ColumnInput = { name: string; type: ColumnType; data: TypedColumn }

const BYTES: Record<ColumnType, number> = { u8: 1, u16: 2, u32: 4, f64: 8 }

const align8 = (n: number) => (n + 7) & ~7

export function typedArrayFor(type: ColumnType, length: number): TypedColumn {
  switch (type) {
    case 'u8':
      return new Uint8Array(length)
    case 'u16':
      return new Uint16Array(length)
    case 'u32':
      return new Uint32Array(length)
    case 'f64':
      return new Float64Array(length)
  }
}

/** Smallest unsigned integer type that can hold `maxValue`. */
export function unsignedTypeFor(maxValue: number): Exclude<ColumnType, 'f64'> {
  if (maxValue < 0x100) return 'u8'
  if (maxValue < 0x10000) return 'u16'
  if (maxValue < 0x100000000) return 'u32'
  throw new Error(`value ${maxValue} does not fit an unsigned 32-bit column`)
}

export function encodeColumns(columns: ColumnInput[]): { manifest: ColumnarManifest; buffer: Uint8Array } {
  const rows = columns[0]?.data.length ?? 0
  for (const c of columns) {
    if (c.data.length !== rows) throw new Error(`column ${c.name} has ${c.data.length} rows, expected ${rows}`)
  }
  let offset = 0
  const specs: ColumnSpec[] = columns.map((c) => {
    const spec: ColumnSpec = { name: c.name, type: c.type, offset, length: rows }
    offset = align8(offset + rows * BYTES[c.type])
    return spec
  })
  const buffer = new Uint8Array(offset)
  columns.forEach((c, i) => {
    buffer.set(new Uint8Array(c.data.buffer, c.data.byteOffset, c.data.byteLength), specs[i].offset)
  })
  return { manifest: { format: 'columnar-v1', rows, byteLength: offset, columns: specs }, buffer }
}

export function decodeColumns(manifest: ColumnarManifest, buffer: ArrayBuffer | Uint8Array): Record<string, TypedColumn> {
  const ab = buffer instanceof Uint8Array ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer
  if (ab.byteLength !== manifest.byteLength) {
    throw new Error(`buffer is ${ab.byteLength} bytes, manifest says ${manifest.byteLength}`)
  }
  const out: Record<string, TypedColumn> = {}
  for (const c of manifest.columns) {
    switch (c.type) {
      case 'u8':
        out[c.name] = new Uint8Array(ab, c.offset, c.length)
        break
      case 'u16':
        out[c.name] = new Uint16Array(ab, c.offset, c.length)
        break
      case 'u32':
        out[c.name] = new Uint32Array(ab, c.offset, c.length)
        break
      case 'f64':
        out[c.name] = new Float64Array(ab, c.offset, c.length)
        break
    }
  }
  return out
}
