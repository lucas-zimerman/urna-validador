import { useRef, useState } from 'react'
import { UFS, resultadoOficial } from '../lib/tse.js'
import { listarSecoes, totalizar } from '../lib/totalizar.js'
import { useMunicipios } from './useMunicipios.js'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

export default function Totalizacao({ eleicao, candidatos }) {
  const [uf, setUf] = useState('ac')
  const [mun, setMun] = useState('')
  const [concorrencia, setConcorrencia] = useState(8)
  const { municipios } = useMunicipios(eleicao, uf)

  const [fase, setFase] = useState('parado') // parado | listando | rodando | fim
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 })
  const [total, setTotal] = useState(null)
  const [oficial, setOficial] = useState(null)
  const [erro, setErro] = useState(null)
  const ctrl = useRef(null)

  async function iniciar() {
    ctrl.current = new AbortController()
    const signal = ctrl.current.signal
    setErro(null)
    setTotal(null)
    setOficial(null)
    setFase('listando')
    try {
      const ufs = uf === 'br' ? UFS.map(([u]) => u) : [uf]
      const [secoes, of] = await Promise.all([
        listarSecoes(eleicao, ufs, { municipio: mun || undefined, signal }),
        resultadoOficial(eleicao, uf, mun || undefined, { signal }),
      ])
      setOficial(of)
      setProgresso({ feito: 0, total: secoes.length })
      setFase('rodando')
      const t = await totalizar(eleicao, secoes, {
        concorrencia,
        signal,
        onProgress: (parcial, n) => {
          setTotal({ ...parcial, candidatos: { ...parcial.candidatos } })
          setProgresso({ feito: parcial.secoesProcessadas, total: n })
        },
      })
      setTotal({ ...t })
    } catch (e) {
      if (e.name !== 'AbortError') setErro(e.message)
    } finally {
      setFase('fim')
    }
  }

  function exportar() {
    const blob = new Blob([JSON.stringify({ eleicao, uf, mun, total, oficial }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `totalizacao-presidente-${uf}${mun ? '-' + mun : ''}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const rodando = fase === 'listando' || fase === 'rodando'
  const pct = progresso.total ? (progresso.feito / progresso.total) * 100 : 0
  const concluido = fase === 'fim' && total && progresso.feito === progresso.total

  const nomes = new Map(candidatos.map((c) => [c.numero, c.nome]))
  const nums = new Set([
    ...(oficial?.candidatos.map((c) => c.numero) ?? []),
    ...Object.keys(total?.candidatos ?? {}).map(Number),
  ])
  const linhas = [...nums]
    .map((n) => ({
      rotulo: `${n} — ${nomes.get(n) ?? oficial?.candidatos.find((c) => c.numero === n)?.nome ?? ''}`,
      nosso: total?.candidatos[n] ?? 0,
      tse: oficial?.candidatos.find((c) => c.numero === n)?.votos ?? 0,
    }))
    .sort((a, b) => b.nosso - a.nosso || b.tse - a.tse)
  if (total && oficial) {
    linhas.push(
      { rotulo: 'Brancos', nosso: total.brancos, tse: oficial.brancos, sep: true },
      { rotulo: 'Nulos', nosso: total.nulos + total.outros, tse: oficial.nulos },
      { rotulo: 'Comparecimento', nosso: total.comparecimento, tse: oficial.comparecimento },
      { rotulo: 'Eleitores aptos', nosso: total.aptos, tse: oficial.aptos },
    )
  }
  const validos = total ? Object.values(total.candidatos).reduce((s, v) => s + v, 0) : 0

  return (
    <section>
      <p>
        Baixa o boletim de urna (BU) de <strong>cada seção</strong> direto do TSE, extrai só os
        votos para Presidente e soma tudo aqui no navegador. No fim, compara com o total oficial
        divulgado pelo TSE para a mesma abrangência.
      </p>
      <div className="filtros">
        <label>
          Abrangência
          <select value={uf} onChange={(e) => { setUf(e.target.value); setMun('') }} disabled={rodando}>
            <option value="br">Brasil inteiro (todas as UFs + exterior)</option>
            {UFS.map(([cd, nome]) => (
              <option key={cd} value={cd}>{cd.toUpperCase()} — {nome}</option>
            ))}
          </select>
        </label>
        <label>
          Município (opcional)
          <select value={mun} onChange={(e) => setMun(e.target.value)} disabled={rodando || uf === 'br'}>
            <option value="">Todos</option>
            {municipios.map((m) => (
              <option key={m.cd} value={m.cd}>{m.cd} — {m.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Downloads simultâneos
          <input
            type="number"
            min="1"
            max="64"
            value={concorrencia}
            onChange={(e) => setConcorrencia(Number(e.target.value) || 1)}
            disabled={rodando}
          />
        </label>
        {rodando ? (
          <button className="perigo" onClick={() => ctrl.current?.abort()}>Parar</button>
        ) : (
          <button onClick={iniciar}>Totalizar</button>
        )}
      </div>
      {uf === 'br' && !rodando && (
        <div className="alerta">
          O Brasil inteiro tem centenas de milhares de seções (vários GB de download). Pode levar
          horas — prefira começar por uma UF ou município, ou use o script <code>npm run totalizar</code>.
        </div>
      )}
      {erro && <div className="alerta erro">{erro}</div>}

      {fase !== 'parado' && (
        <div className="progresso">
          <div className="barra"><div style={{ width: `${pct}%` }} /></div>
          <span>
            {fase === 'listando'
              ? 'Carregando lista de seções…'
              : `${fmt(progresso.feito)} / ${fmt(progresso.total)} seções (${pct.toFixed(1)}%)`}
            {total && ` · urnas contadas: ${fmt(total.urnasContadas)} · agregadas: ${fmt(total.agregadas)} · sem BU: ${fmt(total.semBU)} · erros: ${fmt(total.erros)}`}
            {fase === 'fim' && !concluido && ' · interrompido'}
          </span>
        </div>
      )}

      {total && oficial && (
        <>
          <table className="tabela">
            <thead>
              <tr>
                <th>Presidente</th>
                <th>Soma dos BUs</th>
                <th>% válidos</th>
                <th>TSE oficial</th>
                <th>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const dif = l.nosso - l.tse
                const status = !concluido ? '' : dif === 0 ? 'ok' : 'diverge'
                return (
                  <tr key={l.rotulo} className={`${status} ${l.sep ? 'sep' : ''}`}>
                    <td>{l.rotulo}</td>
                    <td className="num">{fmt(l.nosso)}</td>
                    <td className="num">
                      {!l.sep && l.rotulo.match(/^\d/) && validos
                        ? `${((l.nosso / validos) * 100).toFixed(2)}%`
                        : ''}
                    </td>
                    <td className="num">{fmt(l.tse)}</td>
                    <td className="num">{concluido ? (dif === 0 ? '✔' : fmt(dif)) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="info">
            Oficial do TSE atualizado em {oficial.atualizado} · seções totalizadas pelo TSE:{' '}
            {fmt(oficial.secoesTotalizadas)} de {fmt(oficial.secoesTotal)}
          </p>
        </>
      )}

      {concluido && (
        <>
          {total.inconsistentes.length > 0 && (
            <div className="alerta erro">
              {total.inconsistentes.length} BU(s) com soma de votos diferente do comparecimento:{' '}
              {total.inconsistentes.slice(0, 30).map((i) => `${i.uf.toUpperCase()} ${i.mun} z${i.zona} s${i.secao}`).join(', ')}
            </div>
          )}
          {total.falhas.length > 0 && (
            <details>
              <summary>{total.falhas.length} seção(ões) sem BU ou com erro</summary>
              <ul>
                {total.falhas.slice(0, 500).map((f, i) => (
                  <li key={i}>
                    {f.uf.toUpperCase()} {f.mun} zona {f.zona} seção {f.secao}: {f.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="acoes">
            <button className="secundario" onClick={exportar}>Exportar JSON</button>
          </div>
        </>
      )}
    </section>
  )
}
