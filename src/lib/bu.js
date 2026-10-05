// Decodificador do Boletim de Urna (arquivo *-bu.dat publicado pelo TSE).
// O projeto trabalha apenas com o cargo de Presidente: os demais cargos do BU
// são percorridos mas ignorados (ver presidenteDoBU).
//
// O arquivo é um EntidadeEnvelopeGenerico (ASN.1 DER) cujo campo `conteudo`
// (OCTET STRING) contém a EntidadeBoletimUrna. Estrutura usada aqui:
//
// EntidadeBoletimUrna ::= SEQUENCE {
//   cabecalho, fase, urna,
//   identificacaoSecao SEQUENCE { SEQUENCE { municipio, zona }, local, secao },
//   ...,
//   resultadosVotacaoPorEleicao SEQUENCE OF SEQUENCE {
//     idEleicao INTEGER, qtdEleitoresAptos INTEGER, ...,
//     resultadosVotacao SEQUENCE OF SEQUENCE {
//       tipoCargo ENUMERATED, qtdComparecimento INTEGER,
//       totaisVotosCargo SEQUENCE OF SEQUENCE {
//         codigoCargo CHOICE { [1] cargoConstitucional, [2] numeroConsulta },
//         ordemImpressao INTEGER,
//         votosVotaveis SEQUENCE OF SEQUENCE {
//           [1] tipoVoto, [2] quantidadeVotos,
//           [3] identificacaoVotavel { partido, codigo } OPTIONAL, ...
//         }
//       }
//     }
//   },
//   ...
// }

import { root, children, int, str, slice } from './der.js'

export const TIPO_VOTO = { 1: 'nominal', 2: 'branco', 3: 'nulo', 4: 'legenda' }
export const CARGO_PRESIDENTE = 1

const UNIVERSAL_INTEGER = 0x02
const UNIVERSAL_ENUM = 0x0a
const UNIVERSAL_OCTETS = 0x04
const UNIVERSAL_SEQUENCE = 0x30
const UNIVERSAL_GENERALSTRING = 0x1b

function unwrapEnvelope(bytes) {
  const env = root(bytes)
  const octets = children(bytes, env).find((c) => c.tag === UNIVERSAL_OCTETS)
  if (!octets) throw new Error('Envelope do BU sem conteúdo')
  return slice(bytes, octets)
}

function decodeVotavel(b, node) {
  const v = { tipo: 0, votos: 0, partido: null, codigo: null }
  for (const c of children(b, node)) {
    if (c.tagClass !== 2) continue
    if (c.tagNumber === 1) v.tipo = int(b, c)
    else if (c.tagNumber === 2) v.votos = int(b, c)
    else if (c.tagNumber === 3) {
      const ints = children(b, c).filter((x) => x.tag === UNIVERSAL_INTEGER)
      v.partido = ints[0] ? int(b, ints[0]) : null
      v.codigo = ints[1] ? int(b, ints[1]) : null
    }
  }
  v.tipoNome = TIPO_VOTO[v.tipo] ?? `tipo ${v.tipo}`
  return v
}

function decodeCargo(b, node, comparecimento) {
  const ch = children(b, node)
  const codigoNode = ch.find((c) => c.tagClass === 2)
  const lista = ch.find((c) => c.tag === UNIVERSAL_SEQUENCE)
  const constitucional = codigoNode?.tagNumber === 1
  const codigo = codigoNode ? int(b, codigoNode) : null
  const votaveis = lista ? children(b, lista).map((v) => decodeVotavel(b, v)) : []

  const totais = { nominal: 0, branco: 0, nulo: 0, legenda: 0, outros: 0 }
  const candidatos = {}
  for (const v of votaveis) {
    if (v.tipo === 1) {
      totais.nominal += v.votos
      candidatos[v.codigo] = (candidatos[v.codigo] ?? 0) + v.votos
    } else if (v.tipo === 2) totais.branco += v.votos
    else if (v.tipo === 3) totais.nulo += v.votos
    else if (v.tipo === 4) totais.legenda += v.votos
    else totais.outros += v.votos
  }
  const soma = totais.nominal + totais.branco + totais.nulo + totais.legenda + totais.outros
  return {
    codigo,
    constitucional,
    comparecimento,
    votaveis,
    candidatos,
    totais,
    soma,
  }
}

export function decodeBU(input) {
  const raw = input instanceof Uint8Array ? input : new Uint8Array(input)
  const b = unwrapEnvelope(raw)
  const top = root(b)
  const ch = children(b, top)

  // identificacaoSecao: primeiro SEQUENCE no formato { SEQ{mun,zona}, local, secao }
  let secao = null
  for (const c of ch) {
    if (c.tag !== UNIVERSAL_SEQUENCE) continue
    const s = children(b, c)
    if (
      s.length === 3 &&
      s[0].tag === UNIVERSAL_SEQUENCE &&
      s[1].tag === UNIVERSAL_INTEGER &&
      s[2].tag === UNIVERSAL_INTEGER
    ) {
      const mz = children(b, s[0])
      secao = {
        municipio: int(b, mz[0]),
        zona: int(b, mz[1]),
        local: int(b, s[1]),
        secao: int(b, s[2]),
      }
      break
    }
  }

  const emissao = ch.find((c) => c.tag === UNIVERSAL_GENERALSTRING)
  const urnaNode = ch.find((c) => {
    if (c.tag !== UNIVERSAL_SEQUENCE) return false
    const u = children(b, c)
    return u[0]?.tag === UNIVERSAL_ENUM && u[1]?.tag === UNIVERSAL_GENERALSTRING
  })
  const urna = urnaNode ? decodeUrna(b, urnaNode) : null
  const fase = ch.find((c) => c.tag === UNIVERSAL_ENUM)

  // resultadosVotacaoPorEleicao: SEQUENCE OF SEQUENCE { idEleicao INTEGER, aptos INTEGER, ... }
  const resultadosNode = ch.find((c) => {
    if (c.tag !== UNIVERSAL_SEQUENCE) return false
    const itens = children(b, c)
    return (
      itens.length > 0 &&
      itens.every((it) => {
        if (it.tag !== UNIVERSAL_SEQUENCE) return false
        const f = children(b, it)
        return f.length >= 3 && f[0].tag === UNIVERSAL_INTEGER && f[1].tag === UNIVERSAL_INTEGER
      })
    )
  })
  if (!resultadosNode) throw new Error('BU sem resultados de votação')
  const eleicoes = children(b, resultadosNode).map((e) => {
    const ec = children(b, e)
    const ints = ec.filter((c) => c.tag === UNIVERSAL_INTEGER)
    const resultados = ec.find((c) => c.tag === UNIVERSAL_SEQUENCE)
    const cargos = []
    for (const r of children(b, resultados)) {
      const rc = children(b, r)
      const comparecimento = int(b, rc.find((c) => c.tag === UNIVERSAL_INTEGER))
      const tipoCargo = int(b, rc.find((c) => c.tag === UNIVERSAL_ENUM))
      const lista = rc.find((c) => c.tag === UNIVERSAL_SEQUENCE)
      for (const cargo of children(b, lista)) {
        cargos.push({ tipoCargo, ...decodeCargo(b, cargo, comparecimento) })
      }
    }
    return { idEleicao: int(b, ints[0]), aptos: int(b, ints[1]), cargos }
  })

  return {
    secao,
    urna,
    fase: fase ? int(b, fase) : null,
    emissao: emissao ? formatDataHora(str(b, emissao)) : null,
    eleicoes,
  }
}

// Urna ::= SEQUENCE { tipoUrna, versaoVotacao, correspondenciaEfetivada SEQUENCE {
//   identificacao, carga SEQUENCE { numeroInternoUrna, numeroSerieFC, ..., dataHoraCarga, codigoCarga } }, ... }
// Lido de forma tolerante: guarda todos os códigos encontrados para conferência.
function decodeUrna(b, node) {
  const urna = { versao: null, idue: null, codigoCarga: null, dataHoraCarga: null, outrosCodigos: [] }
  const hex = (n) => [...slice(b, n)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
  const visitar = (n, prof) => {
    for (const c of children(b, n)) {
      if (c.tag === UNIVERSAL_GENERALSTRING) {
        const v = str(b, c)
        if (prof === 0 && !urna.versao) urna.versao = v
        else if (/^\d{8}T\d{6}$/.test(v)) urna.dataHoraCarga ??= formatDataHora(v)
        else if (/^\d{24}$/.test(v)) urna.codigoCarga ??= v
        else urna.outrosCodigos.push(v)
      } else if (c.tag === UNIVERSAL_INTEGER && prof === 2 && urna.idue == null) {
        urna.idue = int(b, c)
      } else if (c.tag === UNIVERSAL_OCTETS && prof >= 2) {
        urna.outrosCodigos.push(hex(c))
      } else if (c.constructed && c.tag !== 0xa0) {
        visitar(c, prof + 1)
      }
    }
  }
  visitar(node, 0)
  return urna
}

const normalizarCodigo = (s) => String(s).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^0+(?=.)/, '')

// Confere um código impresso no boletim contra os códigos da urna gravados no BU.
// Devolve o nome do campo que bateu, ou null.
export function conferirCodigo(bu, codigo) {
  const alvo = normalizarCodigo(codigo)
  if (!alvo || !bu?.urna) return null
  const u = bu.urna
  const campos = [
    ['Código de identificação da urna', u.idue],
    ['Código de carga', u.codigoCarga],
    ...u.outrosCodigos.map((c) => ['Código de verificação da urna', c]),
  ]
  const achado = campos.find(([, v]) => v != null && normalizarCodigo(v) === alvo)
  return achado ? achado[0] : null
}

function formatDataHora(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : s
}

// Resultado para presidente de um BU decodificado (ou null se a urna não tem).
export function presidenteDoBU(bu) {
  for (const e of bu.eleicoes) {
    const cargo = e.cargos.find((c) => c.constitucional && c.codigo === CARGO_PRESIDENTE)
    if (cargo) return { idEleicao: e.idEleicao, aptos: e.aptos, ...cargo }
  }
  return null
}
