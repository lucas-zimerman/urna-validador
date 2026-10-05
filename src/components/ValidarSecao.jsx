import { useState } from 'react'
import { UFS, baixarBU, carregarMunicipiosBR, secaoPrincipal } from '../lib/tse.js'
import { decodeBU, presidenteDoBU } from '../lib/bu.js'
import { useMunicipios } from './useMunicipios.js'
import Conferencia from './Conferencia.jsx'
import BoletimImpresso from './BoletimImpresso.jsx'
import FotoBoletim from './FotoBoletim.jsx'
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
  // Busca rápida pelos números impressos no boletim
  const [rapido, setRapido] = useState({ mun: '', zona: '', secao: '' })
  const [foto, setFoto] = useState(null)

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
      // Seção agregada não tem BU próprio: busca o da seção principal
      const principal = await secaoPrincipal(eleicao, alvo.uf, alvo.mun, alvo.zona, alvo.secao).catch(() => alvo.secao)
      const r = await baixarBU(eleicao, alvo.uf, alvo.mun, alvo.zona, principal)
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

  // Vai para uma seção (a UF é descoberta pelo código do município, se faltar),
  // busca o BU no TSE e, se vierem valores (QR/OCR), preenche a conferência.
  async function irParaSecao({ uf: ufAlvo, municipio, zona: z, secao: sc, alternativas }, valores) {
    if (valores) setPreenchido((p) => ({ key: p.key + 1, valores }))
    if (!municipio || !z || !sc) {
      setErro('Não foi possível identificar município, zona e seção.')
      return
    }
    setErro(null)
    if (!ufAlvo) {
      try {
        const mapa = await carregarMunicipiosBR(eleicao)
        // O OCR pode mandar alternativas para o código lido; usa a primeira que existe
        const codigos = alternativas?.length ? alternativas : [Number(municipio)]
        const cod = codigos.find((c) => mapa.has(Number(c)))
        if (cod == null) {
          setErro(`Município ${pad(municipio, 5)} não encontrado nesta eleição.`)
          return
        }
        if (Number(cod) !== Number(municipio)) {
          setAviso(`O código do município lido (${pad(municipio, 5)}) não existe; usando ${pad(cod, 5)} — ${mapa.get(Number(cod)).nome}. Confira com o boletim.`)
          municipio = cod
        }
        ufAlvo = mapa.get(Number(cod)).uf
      } catch (e) {
        setErro(e.message)
        return
      }
    }
    const alvo = { uf: ufAlvo, mun: pad(municipio, 5), zona: pad(z, 4), secao: pad(sc, 4) }
    setUf(alvo.uf)
    setMun(alvo.mun)
    setZona(alvo.zona)
    setSecao(alvo.secao)
    buscar(alvo)
  }

  // QR Code lido: seleciona a seção, busca o BU no TSE e preenche a tabela
  function usarQR(qr) {
    setAviso(
      qr.pleito && String(Number(qr.pleito)) !== String(Number(eleicao.pleito))
        ? `O QR Code é do pleito ${qr.pleito}, mas a eleição selecionada é do pleito ${eleicao.pleito}.`
        : null,
    )
    irParaSecao(qr.secao, qrParaDigitado(qr))
  }

  // OCR da foto: mesma ideia, com a UF descoberta pelo código do município
  function usarOCR(r) {
    setAviso(null)
    setRapido({ mun: r.secao.municipio != null ? pad(r.secao.municipio, 5) : '', zona: r.secao.zona ?? '', secao: r.secao.secao ?? '' })
    irParaSecao(r.secao, r.valores)
  }

  function buscaRapida(e) {
    e.preventDefault()
    setAviso(null)
    irParaSecao({ municipio: Number(rapido.mun), zona: Number(rapido.zona), secao: Number(rapido.secao) })
  }

  return (
    <section>
      <h2>1. Encontre a seção</h2>
      <form className="filtros" onSubmit={buscaRapida}>
        <label>
          Município (código no boletim)
          <input inputMode="numeric" placeholder="ex.: 01066" value={rapido.mun}
            onChange={(e) => setRapido((r) => ({ ...r, mun: e.target.value }))} />
        </label>
        <label>
          Zona
          <input inputMode="numeric" className="curto" value={rapido.zona}
            onChange={(e) => setRapido((r) => ({ ...r, zona: e.target.value }))} />
        </label>
        <label>
          Seção
          <input inputMode="numeric" className="curto" value={rapido.secao}
            onChange={(e) => setRapido((r) => ({ ...r, secao: e.target.value }))} />
        </label>
        <button type="submit" disabled={!rapido.mun || !rapido.zona || !rapido.secao || buscando}>
          Buscar pelos números
        </button>
      </form>
      <p className="info">Ou escolha na lista:</p>
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
              <option key={m.cd} value={m.cd}>{m.cd} — {m.nome}</option>
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
      <h2>Boletim impresso: QR Code, código verificador ou foto</h2>
      <BoletimImpresso bu={bu?.info ?? null} onQR={usarQR} />
      <FotoBoletim candidatos={candidatos} onFoto={setFoto} onLeitura={usarOCR} />
      {aviso && <div className="alerta">{aviso}</div>}
      {erroMun && <div className="alerta erro">{erroMun}</div>}
      {erro && <div className="alerta erro">{erro}</div>}

      {bu && (
        <p className="info">
          BU da seção {bu.info.secao?.secao} · zona {bu.info.secao?.zona} · município {bu.info.secao?.municipio}
          {bu.info.secao && Number(secao) !== bu.info.secao.secao &&
            ` — a seção ${Number(secao)} é agregada à ${bu.info.secao.secao}: os votos dela estão neste BU`}
          {' · '}emitido em {bu.info.emissao} · situação: {bu.situacao} ·{' '}
          <a href={bu.url}>baixar arquivo .dat</a>
        </p>
      )}

      <div className={foto ? 'lado-a-lado' : ''}>
        <div>
          <Conferencia
            key={preenchido.key}
            inicial={preenchido.valores}
            pres={bu?.pres ?? null}
            candidatos={candidatos}
            fonte="TSE"
          />
        </div>
        {foto && <a href={foto} target="_blank" rel="noreferrer"><img className="foto-bu" src={foto} alt="Foto do boletim" /></a>}
      </div>
    </section>
  )
}
