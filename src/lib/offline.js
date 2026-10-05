// Leitura de boletins de urna a partir de arquivos locais (sem rede).

import { unzipSync } from 'fflate'
import { decodeBU, presidenteDoBU } from './bu.js'

// Nomes de arquivo de BU: "o03220ac0106600040077-bu.dat" (portal do TSE),
// "o00406-0106600040077.bu" (pen drive / dados abertos), BU do Sistema de Apuração.
export const EH_BU = /(\.bu|-bu\.dat|\.busa|-busa\.dat)$/i
export const EH_ZIP = /\.zip$/i

// Expande zips (inclusive zips dentro de zips) e devolve só os arquivos de BU.
export function extrairBUs(nome, bytes, forcar) {
  if (EH_ZIP.test(nome)) {
    const entradas = unzipSync(bytes, { filter: (f) => EH_BU.test(f.name) || EH_ZIP.test(f.name) })
    return Object.entries(entradas).flatMap(([n, b]) => extrairBUs(`${nome}/${n}`, b, false))
  }
  return EH_BU.test(nome) || forcar ? [{ nome, bytes }] : []
}

export function processarBU(nome, bytes) {
  try {
    const info = decodeBU(bytes)
    const pres = presidenteDoBU(info)
    if (!pres) return { nome, info, status: 'sem-presidente' }
    return { nome, info, pres, status: pres.soma === pres.comparecimento && pres.comparecimento <= pres.aptos ? 'ok' : 'inconsistente' }
  } catch (e) {
    return { nome, status: 'erro', erro: e.message }
  }
}
