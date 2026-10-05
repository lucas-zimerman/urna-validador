// Cliente da API pública de resultados do TSE (resultados.tse.jus.br).
// O servidor responde com Access-Control-Allow-Origin, então o navegador
// pode buscar os arquivos diretamente.

import { CARGO_PRESIDENTE } from './bu.js'

export const TSE_BASE = 'https://resultados.tse.jus.br/oficial'

export const UFS = [
  ['ac', 'Acre'], ['al', 'Alagoas'], ['am', 'Amazonas'], ['ap', 'Amapá'],
  ['ba', 'Bahia'], ['ce', 'Ceará'], ['df', 'Distrito Federal'], ['es', 'Espírito Santo'],
  ['go', 'Goiás'], ['ma', 'Maranhão'], ['mg', 'Minas Gerais'], ['ms', 'Mato Grosso do Sul'],
  ['mt', 'Mato Grosso'], ['pa', 'Pará'], ['pb', 'Paraíba'], ['pe', 'Pernambuco'],
  ['pi', 'Piauí'], ['pr', 'Paraná'], ['rj', 'Rio de Janeiro'], ['rn', 'Rio Grande do Norte'],
  ['ro', 'Rondônia'], ['rr', 'Roraima'], ['rs', 'Rio Grande do Sul'], ['sc', 'Santa Catarina'],
  ['se', 'Sergipe'], ['sp', 'São Paulo'], ['to', 'Tocantins'], ['zz', 'Exterior'],
]

const pad = (v, n) => String(v).padStart(n, '0')

export class HttpError extends Error {
  constructor(status, url, retryAfter) {
    super(
      status === 404
        ? 'Arquivo não encontrado no TSE'
        : status === 429
          ? 'TSE limitou as requisições (HTTP 429), tente de novo em instantes'
          : `HTTP ${status}`,
    )
    this.status = status
    this.url = url
    this.retryAfter = retryAfter
  }
}

const esperar = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Abortado', 'AbortError'))
    }, { once: true })
  })

export async function fetchRetry(url, { signal, as = 'json', tries = 7 } = {}) {
  let lastErr
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, { signal })
      if (res.ok) return as === 'json' ? await res.json() : new Uint8Array(await res.arrayBuffer())
      // 4xx é definitivo (exceto 429); 429/5xx vale tentar de novo
      const retryAfter = Number(res.headers.get('retry-after')) || 0
      throw new HttpError(res.status, url, retryAfter)
    } catch (err) {
      const definitivo = err instanceof HttpError && err.status < 500 && err.status !== 429
      if (err.name === 'AbortError' || definitivo) throw err
      lastErr = err
    }
    if (attempt === tries - 1) break
    // backoff exponencial com jitter (máx. ~15s), respeitando Retry-After
    const base = Math.min(15000, 500 * 2 ** attempt)
    const ms = Math.max((lastErr.retryAfter ?? 0) * 1000, base / 2 + Math.random() * (base / 2))
    await esperar(ms, signal)
  }
  throw lastErr
}

// Lista as eleições com cargo de Presidente publicadas no TSE.
export async function listarEleicoesPresidente(opts) {
  const cfg = await fetchRetry(`${TSE_BASE}/comum/config/ele-c.json`, opts)
  const out = []
  for (const pl of cfg.pl ?? []) {
    for (const e of pl.e ?? []) {
      const temPresidente = (e.abr ?? []).some((a) =>
        (a.cp ?? []).some((c) => Number(c.cd) === CARGO_PRESIDENTE),
      )
      if (!temPresidente) continue
      out.push({
        ciclo: pl.c,
        pleito: pl.cd,
        data: pl.dt,
        eleicao: e.cd,
        turno: e.t,
        nome: e.nm,
      })
    }
  }
  return out.sort((a, b) => Number(b.pleito) - Number(a.pleito))
}

// Municípios → zonas → seções de uma UF para o pleito.
export async function carregarSecoes(el, uf, opts) {
  const url = `${TSE_BASE}/${el.ciclo}/arquivo-urna/${el.pleito}/config/${uf}/${uf}-p${pad(el.pleito, 6)}-cs.json`
  const cfg = await fetchRetry(url, opts)
  const abr = cfg.abr?.find((a) => a.cd === uf) ?? cfg.abr?.[0]
  return (abr?.mu ?? []).map((m) => ({
    cd: m.cd,
    nome: m.nm,
    zonas: (m.zon ?? []).map((z) => ({ cd: z.cd, secoes: (z.sec ?? []).map((s) => s.ns) })),
  }))
}

function dirSecao(el, uf, mun, zona, secao) {
  return `${TSE_BASE}/${el.ciclo}/arquivo-urna/${el.pleito}/dados/${uf}/${pad(mun, 5)}/${pad(zona, 4)}/${pad(secao, 4)}`
}

// Busca o arquivo auxiliar da seção e baixa o BU correspondente.
export async function baixarBU(el, uf, mun, zona, secao, opts) {
  const dir = dirSecao(el, uf, mun, zona, secao)
  const auxUrl = `${dir}/p${pad(el.pleito, 6)}-${uf}-m${pad(mun, 5)}-z${pad(zona, 4)}-s${pad(secao, 4)}-aux.json`
  const aux = await fetchRetry(auxUrl, opts)
  const hashes = aux.hashes ?? []
  const escolhido =
    [...hashes].reverse().find((h) => /totaliz/i.test(h.st ?? '')) ?? hashes[hashes.length - 1]
  const arq = escolhido?.arq?.find((a) => a.tp === 'bu') ?? escolhido?.arq?.find((a) => a.tp === 'busa')
  if (!arq) return { situacao: aux.st ?? 'Sem BU', bytes: null, url: null }
  const url = `${dir}/${escolhido.hash}/${arq.nm}`
  const bytes = await fetchRetry(url, { ...opts, as: 'bytes' })
  return { situacao: aux.st, hashSituacao: escolhido.st, bytes, url, arquivo: arq.nm }
}

// Resultado oficial consolidado do TSE para Brasil, UF ou município.
export async function resultadoOficial(el, uf, mun, opts) {
  const abr = !uf || uf === 'br' ? 'br' : mun ? `${uf}${pad(mun, 5)}` : uf
  const dirUf = !uf || uf === 'br' ? 'br' : uf
  const url = `${TSE_BASE}/${el.ciclo}/${el.eleicao}/dados/${dirUf}/${abr}-c${pad(CARGO_PRESIDENTE, 4)}-e${pad(el.eleicao, 6)}-u.json`
  const d = await fetchRetry(url, opts)
  const cargo = d.carg?.find((c) => Number(c.cd) === CARGO_PRESIDENTE) ?? d.carg?.[0]
  const candidatos = []
  for (const agr of cargo?.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const c of par.cand ?? []) {
        candidatos.push({
          numero: Number(c.n),
          nome: c.nmu || c.nm,
          partido: par.sg,
          votos: Number(c.vap ?? 0),
        })
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos)
  const v = d.v ?? {}
  return {
    atualizado: `${d.dg} ${d.hg}`,
    secoesTotalizadas: Number(d.s?.st ?? 0),
    secoesTotal: Number(d.s?.ts ?? 0),
    aptos: Number(d.e?.te ?? 0),
    comparecimento: Number(d.e?.c ?? 0),
    nominais: Number(v.vnom ?? 0),
    brancos: Number(v.vb ?? 0),
    nulos: Number(v.tvn ?? 0),
    totalVotos: Number(v.tv ?? 0),
    candidatos,
  }
}
