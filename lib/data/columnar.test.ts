import { describe, it, expect } from 'vitest'
import { encodeColumns, decodeColumns, unsignedTypeFor } from './columnar'

describe('columnar codec', () => {
  it('round-trips mixed column types with 8-byte alignment', () => {
    const { manifest, buffer } = encodeColumns([
      { name: 'month', type: 'u8', data: Uint8Array.from([1, 2, 3]) },
      { name: 'agency', type: 'u16', data: Uint16Array.from([10, 20, 65535]) },
      { name: 'paid', type: 'f64', data: Float64Array.from([0.5, -2, 9e15]) },
    ])
    expect(manifest.rows).toBe(3)
    expect(manifest.columns.map((c) => c.offset)).toEqual([0, 8, 16])
    expect(buffer.byteLength).toBe(40)
    const cols = decodeColumns(manifest, buffer)
    expect(Array.from(cols.month)).toEqual([1, 2, 3])
    expect(Array.from(cols.agency)).toEqual([10, 20, 65535])
    expect(Array.from(cols.paid)).toEqual([0.5, -2, 9e15])
  })

  it('rejects ragged columns and size mismatches', () => {
    expect(() =>
      encodeColumns([
        { name: 'a', type: 'u8', data: new Uint8Array(2) },
        { name: 'b', type: 'u8', data: new Uint8Array(3) },
      ]),
    ).toThrow(/rows/)
    const { manifest } = encodeColumns([{ name: 'a', type: 'u8', data: new Uint8Array(2) }])
    expect(() => decodeColumns(manifest, new Uint8Array(3))).toThrow(/manifest says/)
  })

  it('picks the smallest unsigned type', () => {
    expect(unsignedTypeFor(255)).toBe('u8')
    expect(unsignedTypeFor(256)).toBe('u16')
    expect(unsignedTypeFor(70000)).toBe('u32')
  })
})
