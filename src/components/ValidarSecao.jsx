import { useMemo, useState } from 'react'
import { UFS, baixarBU } from '../lib/tse.js'
import { decodeBU, presidenteDoBU } from '../lib/bu.js'
import { useMunicipios } from './useMunicipios.js'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const lerNumero = (s) => (s === '' || s == null ? null : Number(String(s).replace(/\D/g, '')))

export default function ValidarSecao({ eleicao, candidatos }) {
  const [uf, setUf] = useState('')
  const [mun, setMun] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const { municipios, carregando, erro: erroMun } = useMunicipios(eleicao, uf)

  const [bu, setBu] = useState(null) // { pres, info, url }
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState(null)

  // Valores digitados a partir do boletim impresso
  const [digitado, setDigitado] = useState({})

  const municipio = municipios.find((m) => m.cd === mun)
  const zonaObj = municipio?.zonas.find((z) => z.cd === zona)

  function trocar(setter, ...limpar) {
    return (e) => {
      setter(e.target.value)
      limpar.forEach((f) => f(''))
      setBu(null)
      setErro(null)
    }
  }

  async function buscar() {
    setBuscando(true)
    setErro(null)
    setBu(null)
    try {
      const r = await baixarBU(eleicao, uf, mun, zona, secao)
      if (!r.bytes) throw new Error(`Seção sem boletim publicado (situação: ${r.situacao})`)
      const dec = decodeBU(r.bytes)
      const pres = presidenteDoBU(dec)
      if (!pres) throw new Error('O BU desta seção não tem votação para Presidente')
      setBu({ pres, info: dec, url: r.url, situacao: r.situacao })
    } catch (e) {
      setErro(e.message)
    } finally {
      setBuscando(false)
    }
  }

  // Linhas: todos os candidatos + qualquer número que apareça no BU
  const linhas = useMemo(() => {
    const nums = new Set(candidatos.map((c) => c.numero))
    Object.keys(bu?.pres.candidatos ?? {}).forEach((n) => nums.add(Number(n)))
    return [...nums]
      .sort((a, b) => a - b)
      .map((n) => ({
        chave: `c${n}`,
        rotulo: `${n} — ${candidatos.find((c) => c.numero === n)?.nome ?? 'Candidato'}`,
        tse: bu ? (bu.pres.candidatos[n] ?? 0) : null,
      }))
  }, [candidatos, bu])

  const extras = [
    { chave: 'brancos', rotulo: 'Brancos', tse: bu?.pres.totais.branco },
    { chave: 'nulos', rotulo: 'Nulos', tse: bu ? bu.pres.totais.nulo + bu.pres.totais.outros : null },
    { chave: 'comparecimento', rotulo: 'Comparecimento', tse: bu?.pres.comparecimento },
    { chave: 'aptos', rotulo: 'Eleitores aptos', tse: bu?.pres.aptos },
  ]

  const v = (k) => lerNumero(digitado[k])
  const algumDigitado = Object.values(digitado).some((x) => x !== '' && x != null)

  // Checagens de soma
  const checagens = []
  if (algumDigitado) {
    const somaCand = linhas.reduce((s, l) => s + (v(l.chave) ?? 0), 0)
    const somaInf = somaCand + (v('brancos') ?? 0) + (v('nulos') ?? 0)
    if (v('comparecimento') != null) {
      checagens.push({
        ok: somaInf === v('comparecimento'),
        texto: `Boletim informado: candidatos + brancos + nulos = ${fmt(somaInf)}; comparecimento = ${fmt(v('comparecimento'))}`,
      })
    }
    if (v('comparecimento') != null && v('aptos') != null) {
      checagens.push({
        ok: v('comparecimento') <= v('aptos'),
        texto: `Boletim informado: comparecimento (${fmt(v('comparecimento'))}) não excede aptos (${fmt(v('aptos'))})`,
      })
    }
  }
  if (bu) {
    const p = bu.pres
    checagens.push({
      ok: p.soma === p.comparecimento,
      texto: `BU do TSE: soma dos votos = ${fmt(p.soma)}; comparecimento = ${fmt(p.comparecimento)}`,
    })
    checagens.push({
      ok: p.comparecimento <= p.aptos,
      texto: `BU do TSE: comparecimento (${fmt(p.comparecimento)}) não excede aptos (${fmt(p.aptos)})`,
    })
    if (algumDigitado) {
      const diverg = [...linhas, ...extras].filter((l) => v(l.chave) != null && v(l.chave) !== l.tse)
      const vazios = [...linhas, ...extras].filter((l) => v(l.chave) == null)
      checagens.unshift({
        ok: diverg.length === 0,
        texto:
          diverg.length === 0
            ? `Todos os valores informados batem com o BU do TSE${vazios.length ? ` (${vazios.length} campo(s) não preenchido(s))` : ''}`
            : `Valores divergentes do TSE: ${diverg.map((d) => d.rotulo).join(', ')}`,
      })
    }
  }

  function preencherComTSE() {
    const d = {}
    for (const l of [...linhas, ...extras]) d[l.chave] = String(l.tse ?? '')
    setDigitado(d)
  }

  // Função (não componente) para o input não perder o foco a cada tecla
  const linha = (l) => {
    const val = v(l.chave)
    const status = val == null || l.tse == null ? '' : val === l.tse ? 'ok' : 'diverge'
    return (
      <tr key={l.chave} className={status}>
        <td>{l.rotulo}</td>
        <td>
          <input
            inputMode="numeric"
            value={digitado[l.chave] ?? ''}
            onChange={(e) => setDigitado((d) => ({ ...d, [l.chave]: e.target.value }))}
          />
        </td>
        <td className="num">{fmt(l.tse)}</td>
        <td className="status">
          {status === 'ok' ? '✔' : status === 'diverge' ? `✘ ${val - l.tse > 0 ? '+' : ''}${fmt(val - l.tse)}` : ''}
        </td>
      </tr>
    )
  }

  return (
    <section>
      <h2>1. Escolha a seção</h2>
      <div className="filtros">
        <label>
          UF
          <select value={uf} onChange={trocar(setUf, setMun, setZona, setSecao)}>
            <option value="">—</option>
            {UFS.map(([cd, nome]) => (
              <option key={cd} value={cd}>{cd.toUpperCase()} — {nome}</option>
            ))}
          </select>
        </label>
        <label>
          Município
          <select value={mun} onChange={trocar(setMun, setZona, setSecao)} disabled={!municipios.length}>
            <option value="">{carregando ? 'carregando…' : '—'}</option>
            {municipios.map((m) => (
              <option key={m.cd} value={m.cd}>{m.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Zona
          <select value={zona} onChange={trocar(setZona, setSecao)} disabled={!municipio}>
            <option value="">—</option>
            {municipio?.zonas.map((z) => (
              <option key={z.cd} value={z.cd}>{Number(z.cd)}</option>
            ))}
          </select>
        </label>
        <label>
          Seção
          <select value={secao} onChange={trocar(setSecao)} disabled={!zonaObj}>
            <option value="">—</option>
            {zonaObj?.secoes.map((s) => (
              <option key={s} value={s}>{Number(s)}</option>
            ))}
          </select>
        </label>
        <button onClick={buscar} disabled={!secao || buscando}>
          {buscando ? 'Buscando…' : 'Buscar BU no TSE'}
        </button>
      </div>
      {erroMun && <div className="alerta erro">{erroMun}</div>}
      {erro && <div className="alerta erro">{erro}</div>}

      {bu && (
        <p className="info">
          BU da seção {bu.info.secao?.secao} · zona {bu.info.secao?.zona} · município {bu.info.secao?.municipio}
          {bu.info.secao && Number(secao) !== bu.info.secao.secao && ' (seção agregada à principal)'}
          {' · '}emitido em {bu.info.emissao} · situação: {bu.situacao} ·{' '}
          <a href={bu.url}>baixar arquivo .dat</a>
        </p>
      )}

      <h2>2. Digite os números do boletim impresso (votos para Presidente)</h2>
      <table className="tabela">
        <thead>
          <tr>
            <th>Item</th>
            <th>Boletim impresso</th>
            <th>TSE</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha)}
          {extras.map(linha)}
        </tbody>
      </table>
      <div className="acoes">
        <button className="secundario" onClick={() => setDigitado({})}>Limpar</button>
        {bu && (
          <button className="secundario" onClick={preencherComTSE} title="Útil para conferir só as somas">
            Copiar valores do TSE
          </button>
        )}
      </div>

      {checagens.length > 0 && (
        <>
          <h2>3. Resultado da conferência</h2>
          <ul className="checagens">
            {checagens.map((c, i) => (
              <li key={i} className={c.ok ? 'ok' : 'diverge'}>
                {c.ok ? '✔' : '✘'} {c.texto}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
