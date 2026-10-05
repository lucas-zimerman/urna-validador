import { useState } from 'react'
import { UFS, baixarBU } from '../lib/tse.js'
import { decodeBU, presidenteDoBU } from '../lib/bu.js'
import { useMunicipios } from './useMunicipios.js'
import Conferencia from './Conferencia.jsx'

export default function ValidarSecao({ eleicao, candidatos }) {
  const [uf, setUf] = useState('')
  const [mun, setMun] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const { municipios, carregando, erro: erroMun } = useMunicipios(eleicao, uf)

  const [bu, setBu] = useState(null) // { pres, info, url }
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState(null)

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

      <Conferencia pres={bu?.pres ?? null} candidatos={candidatos} fonte="TSE" />
    </section>
  )
}
