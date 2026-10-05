import { useState } from 'react'
import { EH_ZIP, extrairBUs, processarBU } from '../lib/offline.js'
import { novoTotal, somarBU } from '../lib/totalizar.js'
import Conferencia, { fmt } from './Conferencia.jsx'
import BoletimImpresso from './BoletimImpresso.jsx'
import FotoBoletim from './FotoBoletim.jsx'
import { qrParaDigitado } from '../lib/qrbu.js'

const ROTULO = {
  ok: '✔ consistente',
  inconsistente: '✘ soma não bate',
  duplicado: 'duplicado',
  'sem-presidente': 'sem Presidente',
  erro: '✘ arquivo inválido',
}

export default function ValidarOffline({ candidatos }) {
  const [urnas, setUrnas] = useState([])
  const [ignorados, setIgnorados] = useState(0)
  const [processando, setProcessando] = useState(null) // { feito, total }
  const [selecionada, setSelecionada] = useState(null)
  const [soProblemas, setSoProblemas] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [preenchido, setPreenchido] = useState({ key: 0, valores: undefined })
  const [avisoQR, setAvisoQR] = useState(null)
  const [foto, setFoto] = useState(null)

  async function carregar(fileList) {
    const files = [...fileList]
    if (!files.length) return
    setProcessando({ feito: 0, total: files.length })
    const novas = []
    let ign = 0
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const nome = f.webkitRelativePath || f.name
      // Arquivo escolhido individualmente: tenta decodificar mesmo com nome diferente
      const forcar = !f.webkitRelativePath && !EH_ZIP.test(nome)
      try {
        const bus = extrairBUs(nome, new Uint8Array(await f.arrayBuffer()), forcar)
        if (!bus.length) ign++
        for (const b of bus) novas.push(processarBU(b.nome, b.bytes))
      } catch (e) {
        novas.push({ nome, status: 'erro', erro: e.message })
      }
      if (i % 25 === 0) {
        setProcessando({ feito: i + 1, total: files.length })
        await new Promise((r) => setTimeout(r)) // deixa a tela atualizar
      }
    }
    setUrnas((atuais) => [...atuais, ...novas])
    setIgnorados((n) => n + ign)
    setProcessando(null)
  }

  function limpar() {
    setUrnas([])
    setIgnorados(0)
    setSelecionada(null)
  }

  // Soma, contando cada seção uma vez só
  const total = novoTotal()
  const vistos = new Set()
  const lista = urnas.map((u) => {
    if (!u.pres) return u
    const s = u.info.secao
    const chave = s ? `${s.municipio}-${s.zona}-${s.secao}` : u.nome
    if (vistos.has(chave)) return { ...u, status: 'duplicado' }
    vistos.add(chave)
    somarBU(total, u.pres)
    return u
  })
  const contagem = lista.reduce((c, u) => ({ ...c, [u.status]: (c[u.status] ?? 0) + 1 }), {})
  const validos = Object.values(total.candidatos).reduce((s, v) => s + v, 0)
  const nomes = new Map(candidatos.map((c) => [c.numero, c.nome]))
  const ranking = Object.entries(total.candidatos)
    .map(([n, votos]) => ({ numero: Number(n), votos }))
    .sort((a, b) => b.votos - a.votos)

  const visiveis = lista
    .map((u, i) => ({ ...u, i }))
    .filter((u) => !soProblemas || (u.status !== 'ok' && u.status !== 'duplicado'))
  const detalhe = selecionada != null ? lista[selecionada] : null

  // QR Code ou OCR: procura o BU da mesma seção entre os arquivos carregados
  function localizar(secao, valores, origem) {
    const codigos = secao.alternativas?.length ? secao.alternativas : [secao.municipio]
    let i = -1
    for (const mun of codigos) {
      i = lista.findIndex(
        (u) => u.pres && u.status !== 'duplicado' && u.info.secao?.municipio === mun &&
          u.info.secao?.zona === secao.zona && u.info.secao?.secao === secao.secao,
      )
      if (i >= 0) break
    }
    setSelecionada(i >= 0 ? i : null)
    setAvisoQR(
      i >= 0 || !lista.length
        ? null
        : `O BU da seção ${secao.secao ?? '?'} (zona ${secao.zona ?? '?'}, município ${secao.municipio ?? '?'}) não está entre os arquivos carregados. Conferindo só as somas ${origem}.`,
    )
    setPreenchido((p) => ({ key: p.key + 1, valores }))
  }

  const usarQR = (qr) => localizar(qr.secao, qrParaDigitado(qr), 'do QR Code')
  const usarOCR = (r) => localizar(r.secao, r.valores, 'lidas da foto')

  return (
    <section>
      <p>
        Confere arquivos de boletim de urna que estão no seu computador, sem acessar a internet.
        Aceita arquivos <code>.bu</code> / <code>-bu.dat</code> (baixados do portal do TSE ou do
        pen drive da urna), pastas inteiras e arquivos <code>.zip</code> com vários boletins.
        Nada é enviado para servidor algum.
      </p>

      <div
        className={`soltar ${arrastando ? 'ativo' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); carregar(e.dataTransfer.files) }}
      >
        <p>Arraste os arquivos aqui, ou</p>
        <div className="acoes">
          <label className="botao">
            Escolher arquivos
            <input type="file" multiple accept=".bu,.dat,.busa,.zip" hidden
              onChange={(e) => { carregar(e.target.files); e.target.value = '' }} />
          </label>
          <label className="botao secundario">
            Escolher pasta
            <input type="file" webkitdirectory="" directory="" hidden
              onChange={(e) => { carregar(e.target.files); e.target.value = '' }} />
          </label>
          {urnas.length > 0 && <button className="secundario" onClick={limpar}>Limpar tudo</button>}
        </div>
      </div>

      {processando && (
        <div className="progresso">
          <div className="barra"><div style={{ width: `${(processando.feito / processando.total) * 100}%` }} /></div>
          <span>Lendo {fmt(processando.feito)} / {fmt(processando.total)} arquivos…</span>
        </div>
      )}

      {lista.length > 0 && (
        <>
          <p className="info">
            {fmt(lista.length)} boletim(ns) lido(s) · {fmt(total.urnasContadas)} seção(ões) distintas somadas
            {contagem.inconsistente ? ` · ${contagem.inconsistente} com soma inconsistente` : ''}
            {contagem.duplicado ? ` · ${contagem.duplicado} duplicado(s)` : ''}
            {contagem.erro ? ` · ${contagem.erro} inválido(s)` : ''}
            {contagem['sem-presidente'] ? ` · ${contagem['sem-presidente']} sem Presidente` : ''}
            {ignorados ? ` · ${ignorados} arquivo(s) ignorado(s) (não são BU)` : ''}
          </p>

          <h2>Soma dos boletins carregados — Presidente</h2>
          <table className="tabela">
            <thead>
              <tr><th>Candidato</th><th>Votos</th><th>% válidos</th></tr>
            </thead>
            <tbody>
              {ranking.map((c) => (
                <tr key={c.numero}>
                  <td>{c.numero} — {nomes.get(c.numero) ?? 'Candidato'}</td>
                  <td className="num">{fmt(c.votos)}</td>
                  <td className="num">{validos ? `${((c.votos / validos) * 100).toFixed(2)}%` : ''}</td>
                </tr>
              ))}
              <tr className="sep"><td>Brancos</td><td className="num">{fmt(total.brancos)}</td><td></td></tr>
              <tr><td>Nulos</td><td className="num">{fmt(total.nulos + total.outros)}</td><td></td></tr>
              <tr><td>Comparecimento</td><td className="num">{fmt(total.comparecimento)}</td><td></td></tr>
              <tr><td>Eleitores aptos</td><td className="num">{fmt(total.aptos)}</td><td></td></tr>
            </tbody>
          </table>

          <h2>Boletins</h2>
          <label className="check">
            <input type="checkbox" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} />
            Mostrar só os com problema
          </label>
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Arquivo</th><th>Mun. / Zona / Seção</th><th>Soma</th><th>Comparec.</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 1000).map((u) => (
                  <tr
                    key={u.i}
                    className={`clicavel ${u.status === 'ok' ? '' : u.status === 'duplicado' ? '' : 'diverge'} ${selecionada === u.i ? 'selecionada' : ''}`}
                    onClick={() => setSelecionada(u.i)}
                  >
                    <td className="arquivo">{u.nome}</td>
                    <td>{u.info?.secao ? `${u.info.secao.municipio} / ${u.info.secao.zona} / ${u.info.secao.secao}` : '—'}</td>
                    <td className="num">{fmt(u.pres?.soma)}</td>
                    <td className="num">{fmt(u.pres?.comparecimento)}</td>
                    <td className="status">{ROTULO[u.status]}{u.erro ? `: ${u.erro}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visiveis.length > 1000 && <p className="info">Mostrando os primeiros 1.000 de {fmt(visiveis.length)}.</p>}

        </>
      )}

      <div className="detalhe">
        <h2>Conferir com o boletim impresso</h2>
        <p className="info">
          {detalhe?.pres
            ? `Boletim selecionado: ${detalhe.nome} · município ${detalhe.info.secao?.municipio} · zona ${detalhe.info.secao?.zona} · seção ${detalhe.info.secao?.secao} · emitido em ${detalhe.info.emissao}`
            : 'Clique num boletim da lista, ou leia o QR Code do boletim impresso para localizar a seção. Sem arquivo carregado, o QR Code sozinho ainda tem as somas conferidas.'}
        </p>
        <BoletimImpresso bu={detalhe?.info ?? null} onQR={usarQR} />
        <FotoBoletim candidatos={candidatos} onFoto={setFoto} onLeitura={usarOCR} />
        {avisoQR && <div className="alerta">{avisoQR}</div>}
        <div className={foto ? 'lado-a-lado' : ''}>
          <div>
            <Conferencia
              key={`${selecionada}-${preenchido.key}`}
              inicial={preenchido.valores}
              pres={detalhe?.pres ?? null}
              candidatos={candidatos}
              fonte="Arquivo"
              passo={1}
            />
          </div>
          {foto && <a href={foto} target="_blank" rel="noreferrer"><img className="foto-bu" src={foto} alt="Foto do boletim" /></a>}
        </div>
      </div>
    </section>
  )
}
