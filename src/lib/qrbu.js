// Leitor do "BU digital": o texto dos QR Codes impressos no boletim de urna.
//
// Formato (especificação QRBU do TSE): pares CHAVE:VALOR separados por espaço.
//   QRBU:1:2 VRQR:1.5 ... UNFE:AC MUNI:1066 ZONA:4 SECA:77 IDUE:2293919
//   IDCA:093853352215815221270154 ... APTO:289 COMP:234 FALT:55 ...
//   IDEL:6257 CARG:1 TIPO:0 VERC:... 13:99 22:103 ... APTA:289 NOMI:217
//   BRAN:4 NULO:13 TOTC:234 HASH:... [ASSI:...]
// O boletim pode ter vários QR Codes (QRBU:i:n); cole todos, na ordem impressa.

import { CARGO_PRESIDENTE } from './bu.js'

const num = (v) => (v == null || v === '' ? null : Number(v))

// Alguns apps leitores de QR devolvem o texto codificado como URL
// ("QRBU:1:1%20VRQR:...") ou com algo antes do conteúdo (um link, por exemplo).
export function normalizarTextoQR(texto) {
  let t = String(texto).trim()
  if (/%[0-9A-Fa-f]{2}/.test(t)) {
    try {
      t = decodeURIComponent(t)
    } catch {
      t = t.replace(/%20/gi, ' ')
    }
  }
  if (!/\s/.test(t) && t.includes('+')) t = t.replace(/\+/g, ' ')
  const i = t.indexOf('QRBU:')
  return i > 0 ? t.slice(i) : t
}

export function parseQRBU(texto) {
  const tokens = normalizarTextoQR(texto)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const i = t.indexOf(':')
      return i < 0 ? [t, ''] : [t.slice(0, i).toUpperCase(), t.slice(i + 1)]
    })

  const cab = {}
  const partes = new Set()
  let totalPartes = 0
  let cargoAtual = null
  let pres = null
  const avisos = []

  for (const [k, v] of tokens) {
    if (k === 'QRBU') {
      const [i, n] = v.split(':').map(Number)
      if (i) partes.add(i)
      if (n) totalPartes = Math.max(totalPartes, n)
      continue
    }
    if (k === 'CARG') {
      cargoAtual = Number(v)
      if (cargoAtual === CARGO_PRESIDENTE && !pres) {
        pres = { candidatos: {}, aptos: null, nominais: null, brancos: 0, nulos: 0, total: null }
      }
      continue
    }
    if (k === 'IDEL') {
      cargoAtual = null
      continue
    }
    if (cargoAtual === CARGO_PRESIDENTE) {
      if (/^\d+$/.test(k)) pres.candidatos[Number(k)] = Number(v)
      else if (k === 'APTA') pres.aptos = num(v)
      else if (k === 'NOMI') pres.nominais = num(v)
      else if (k === 'BRAN') pres.brancos = num(v)
      else if (k === 'NULO') pres.nulos = num(v)
      else if (k === 'TOTC') pres.total = num(v)
      continue
    }
    if (!(k in cab)) cab[k] = v
  }

  if (!tokens.some(([k]) => k === 'QRBU' || k === 'UNFE' || k === 'SECA')) {
    throw new Error('O texto não parece ser o QR Code de um boletim de urna (esperado algo como "QRBU:1:1 ... UNFE:..")')
  }
  const faltando = []
  for (let i = 1; i <= totalPartes; i++) if (!partes.has(i)) faltando.push(i)
  if (faltando.length) avisos.push(`Faltam QR Code(s) do boletim: parte(s) ${faltando.join(', ')} de ${totalPartes}`)
  if (!pres) avisos.push('Nenhum voto para Presidente encontrado no QR Code (CARG:1)')

  return {
    secao: {
      uf: cab.UNFE?.toLowerCase() ?? null,
      municipio: num(cab.MUNI),
      zona: num(cab.ZONA),
      secao: num(cab.SECA),
    },
    pleito: cab.PLEI ?? cab.PROC ?? null,
    turno: cab.TURN ?? null,
    // AGRE: seções agregadas a esta urna (os votos delas estão neste boletim)
    agregadas: cab.AGRE ? cab.AGRE.split(/[,;]/).map(Number).filter(Boolean) : [],
    urna: { idue: cab.IDUE ?? null, codigoCarga: cab.IDCA ?? null },
    aptos: num(cab.APTO),
    comparecimento: num(cab.COMP),
    presidente: pres,
    partes: { lidas: [...partes].sort((a, b) => a - b), total: totalPartes },
    avisos,
  }
}

// Converte o QR lido para os campos da tabela de conferência.
export function qrParaDigitado(qr) {
  const d = {}
  const p = qr.presidente
  // O QR só lista candidatos com votos: os ausentes valem 0
  if (p) d.ausentesZero = true
  if (p) {
    for (const [n, v] of Object.entries(p.candidatos)) d[`c${n}`] = String(v)
    d.brancos = String(p.brancos ?? 0)
    d.nulos = String(p.nulos ?? 0)
  }
  const comp = qr.comparecimento ?? p?.total
  const aptos = qr.aptos ?? p?.aptos
  if (comp != null) d.comparecimento = String(comp)
  if (aptos != null) d.aptos = String(aptos)
  return d
}
