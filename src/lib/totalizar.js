// Totalização independente: baixa o BU de cada seção, extrai só o cargo de
// Presidente e soma tudo. Usado pelo site e pelo script de linha de comando.

import { baixarBU, carregarSecoes } from './tse.js'
import { decodeBU, presidenteDoBU } from './bu.js'

export async function listarSecoes(el, ufs, { municipio, zona, signal } = {}) {
  const lista = []
  for (const uf of ufs) {
    const muns = await carregarSecoes(el, uf, { signal })
    for (const m of muns) {
      if (municipio && m.cd !== municipio) continue
      for (const z of m.zonas) {
        if (zona && z.cd !== zona) continue
        for (const s of z.secoes) lista.push({ uf, mun: m.cd, zona: z.cd, secao: s })
      }
    }
  }
  return lista
}

export function novoTotal() {
  return {
    secoesProcessadas: 0,
    urnasContadas: 0, // BUs distintos (seções agregadas compartilham o mesmo BU)
    semBU: 0,
    erros: 0,
    aptos: 0,
    comparecimento: 0,
    nominais: 0,
    brancos: 0,
    nulos: 0,
    outros: 0,
    candidatos: {},
    inconsistentes: [], // BUs em que a soma dos votos != comparecimento
    falhas: [], // seções que não puderam ser processadas
  }
}

export function somarBU(total, pres) {
  total.urnasContadas++
  total.aptos += pres.aptos
  total.comparecimento += pres.comparecimento
  total.nominais += pres.totais.nominal
  total.brancos += pres.totais.branco
  total.nulos += pres.totais.nulo
  total.outros += pres.totais.legenda + pres.totais.outros
  for (const [num, votos] of Object.entries(pres.candidatos)) {
    total.candidatos[num] = (total.candidatos[num] ?? 0) + votos
  }
}

export async function totalizar(el, secoes, { concorrencia = 8, signal, onProgress } = {}) {
  const total = novoTotal()
  const vistos = new Set()
  let idx = 0
  let ultimoAviso = 0

  const aviso = (forcar) => {
    const agora = Date.now()
    if (onProgress && (forcar || agora - ultimoAviso > 250)) {
      ultimoAviso = agora
      onProgress(total, secoes.length)
    }
  }

  async function worker() {
    while (idx < secoes.length) {
      if (signal?.aborted) return
      const s = secoes[idx++]
      try {
        const r = await baixarBU(el, s.uf, s.mun, s.zona, s.secao, { signal })
        if (!r.bytes) {
          total.semBU++
          total.falhas.push({ ...s, motivo: r.situacao })
        } else {
          const bu = decodeBU(r.bytes)
          const pres = presidenteDoBU(bu)
          // Seções agregadas apontam para o BU da seção principal: conta uma vez só.
          const chave = bu.secao
            ? `${s.uf}-${bu.secao.municipio}-${bu.secao.zona}-${bu.secao.secao}`
            : r.url
          if (!pres) {
            total.semBU++
            total.falhas.push({ ...s, motivo: 'BU sem votação para Presidente' })
          } else if (!vistos.has(chave)) {
            vistos.add(chave)
            somarBU(total, pres)
            if (pres.soma !== pres.comparecimento) {
              total.inconsistentes.push({ ...s, soma: pres.soma, comparecimento: pres.comparecimento })
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        total.erros++
        total.falhas.push({ ...s, motivo: err.message })
      }
      total.secoesProcessadas++
      aviso(false)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concorrencia) }, worker))
  aviso(true)
  return total
}
