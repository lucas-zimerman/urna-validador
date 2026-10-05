import { useEffect, useState } from 'react'
import { listarEleicoesPresidente, resultadoOficial } from './lib/tse.js'
import ValidarSecao from './components/ValidarSecao.jsx'
import Totalizacao from './components/Totalizacao.jsx'
import ValidarOffline from './components/ValidarOffline.jsx'
import './App.css'

export default function App() {
  const [aba, setAba] = useState('validar')
  const [eleicoes, setEleicoes] = useState([])
  const [eleicao, setEleicao] = useState(null)
  const [candidatos, setCandidatos] = useState([])
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarEleicoesPresidente()
      .then((lista) => {
        setEleicoes(lista)
        setEleicao(lista[0] ?? null)
      })
      .catch((e) => setErro(`Não foi possível carregar as eleições do TSE: ${e.message}`))
  }, [])

  // Nomes dos candidatos a Presidente (do resultado nacional oficial)
  useEffect(() => {
    if (!eleicao) return
    setCandidatos([])
    resultadoOficial(eleicao, 'br')
      .then((r) => setCandidatos([...r.candidatos].sort((a, b) => a.numero - b.numero)))
      .catch((e) => setErro(`Não foi possível carregar os candidatos: ${e.message}`))
  }, [eleicao])

  return (
    <div className="app">
      <header>
        <h1>Validador de Urnas — Presidente</h1>
        <p className="sub">
          Confere boletins de urna com os arquivos publicados pelo TSE e refaz a soma por seção.
        </p>
        <div className="eleicao">
          <label>
            Eleição
            <select
              value={eleicao?.eleicao ?? ''}
              onChange={(e) => setEleicao(eleicoes.find((x) => x.eleicao === e.target.value))}
            >
              {eleicoes.map((e) => (
                <option key={e.eleicao} value={e.eleicao}>
                  {e.nome} ({e.data})
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav>
          <button className={aba === 'validar' ? 'ativo' : ''} onClick={() => setAba('validar')}>
            Validar boletim de urna
          </button>
          <button className={aba === 'totalizar' ? 'ativo' : ''} onClick={() => setAba('totalizar')}>
            Totalizar por seção
          </button>
          <button className={aba === 'offline' ? 'ativo' : ''} onClick={() => setAba('offline')}>
            Validador offline
          </button>
        </nav>
      </header>

      {erro && aba !== 'offline' && <div className="alerta erro">{erro}</div>}

      <main>
        {aba === 'offline' ? (
          <ValidarOffline candidatos={candidatos} />
        ) : !eleicao ? (
          !erro && <p>Carregando eleições do TSE…</p>
        ) : aba === 'validar' ? (
          <ValidarSecao eleicao={eleicao} candidatos={candidatos} />
        ) : (
          <Totalizacao eleicao={eleicao} candidatos={candidatos} />
        )}
      </main>

      <footer>
        Dados: <a href="https://resultados.tse.jus.br">resultados.tse.jus.br</a> (API pública do TSE).
        Projeto independente, sem vínculo com o TSE.
      </footer>
    </div>
  )
}
