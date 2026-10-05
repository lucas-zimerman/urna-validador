import { useState } from 'react'
import { UFS, baixarBU } from '../lib/tse.js'
import { decodeBU, presidenteDoBU } from '../lib/bu.js'
import { useMunicipios } from './useMunicipios.js'
import Conferencia from './Conferencia.jsx'
import BoletimImpresso from './BoletimImpresso.jsx'
import { qrParaDigitado } from '../lib/qrbu.js'

const pad = (v, n) => String(v).padStart(n, '0')

export default function ValidarSecao({ eleicao, candidatos }) {
  const [uf, setUf] = useState('')
  const [mun, setMun] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const { municipios, carregando, erro: erroMun } = useMunicipios(eleicao, uf)

  const [bu, setBu] = useState(null) // { pres, info, url }
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  // Valores do QR Code para pré-preencher a conferência (key força remontagem)
  const [preenchido, setPreenchido] = useState({ key: 0, valores: undefined })

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

  async function buscar(alvo = { uf, mun, zona, secao }) {
    setBuscando(true)
    setErro(null)
    setBu(null)
    try {
      const r = await baixarBU(eleicao, alvo.uf, alvo.mun, alvo.zona, alvo.secao)
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

  // QR Code lido: seleciona a seção, busca o BU no TSE e preenche a tabela
  function usarQR(qr) {
    setPreenchido((p) => ({ key: p.key + 1, valores: qrParaDigitado(qr) }))
    setAviso(
      qr.pleito && String(Number(qr.pleito)) !== String(Number(eleicao.pleito))
        ? `O QR Code é do pleito ${qr.pleito}, mas a eleição selecionada é do pleito ${eleicao.pleito}.`
        : null,
    )
    const s = qr.secao
    if (!s.uf || !s.municipio || !s.zona || !s.secao) return
    const alvo = { uf: s.uf, mun: pad(s.municipio, 5), zona: pad(s.zona, 4), secao: pad(s.secao, 4) }
    setUf(alvo.uf)
    setMun(alvo.mun)
    setZona(alvo.zona)
    setSecao(alvo.secao)
    buscar(alvo)
  }

  return (
    <section>
      <h2>1. Escolha a seção — ou leia o QR Code do boletim impresso</h2>
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
        <button onClick={() => buscar()} disabled={!secao || buscando}>
          {buscando ? 'Buscando…' : 'Buscar BU no TSE'}
        </button>
      </div>
      <BoletimImpresso bu={bu?.info ?? null} onQR={usarQR} />
      {aviso && <div className="alerta">{aviso}</div>}
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

      <Conferencia
        key={preenchido.key}
        inicial={preenchido.valores}
        pres={bu?.pres ?? null}
        candidatos={candidatos}
        fonte="TSE"
      />
    </section>
  )
}
