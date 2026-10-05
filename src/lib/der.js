// Leitor mínimo de ASN.1 DER: o suficiente para navegar no Boletim de Urna (BU).

export function readTLV(bytes, offset) {
  let i = offset
  const first = bytes[i++]
  let tagNumber = first & 0x1f
  if (tagNumber === 0x1f) {
    tagNumber = 0
    let b
    do {
      b = bytes[i++]
      tagNumber = (tagNumber << 7) | (b & 0x7f)
    } while (b & 0x80)
  }
  let length = bytes[i++]
  if (length & 0x80) {
    const n = length & 0x7f
    length = 0
    for (let k = 0; k < n; k++) length = length * 256 + bytes[i++]
  }
  if (i + length > bytes.length) throw new Error('DER truncado')
  return {
    tag: first,
    tagClass: first >> 6, // 0 universal, 2 context-specific
    constructed: (first & 0x20) !== 0,
    tagNumber,
    start: i,
    end: i + length,
    next: i + length,
  }
}

export function children(bytes, node) {
  const out = []
  let i = node.start
  while (i < node.end) {
    const child = readTLV(bytes, i)
    out.push(child)
    i = child.next
  }
  return out
}

export function root(bytes) {
  return readTLV(bytes, 0)
}

export function int(bytes, node) {
  // Inteiros do BU são sempre não-negativos e cabem em Number.
  let v = 0
  for (let i = node.start; i < node.end; i++) v = v * 256 + bytes[i]
  return v
}

export function str(bytes, node) {
  let s = ''
  for (let i = node.start; i < node.end; i++) s += String.fromCharCode(bytes[i])
  return s
}

export function slice(bytes, node) {
  return bytes.subarray(node.start, node.end)
}
