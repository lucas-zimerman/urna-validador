import { useMemo, useState } from 'react'

export const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const lerNumero = (s) => (s === '' || s == null ? null : Number(String(s).replace(/\D/g, '')))

// Tabela para digitar o boletim impresso e conferir com um BU decodificado
// (`pres` = resultado de presidenteDoBU, ou null enquanto não houver BU).
// `inicial` pré-preenche os campos (ex.: valores lidos do QR Code); para
// aplicar um novo `inicial`, troque a `key` do componente.
export default function Conferencia({ pres, candidatos, fonte = 'TSE', passo = 2, inicial }) {
  const [digitado, setDigitado] = useState(() => {
    if (!inicial?.ausentesZero) return inicial ?? {}
    const { ausentesZero: _, ...valores } = inicial
    const numeros = [...candidatos.map((c) => c.numero), ...Object.keys(pres?.candidatos ?? {})]
    for (const n of numeros) valores[`c${n}`] ??= '0'
    return valores
  })

  // Linhas: todos os candidatos conhecidos + qualquer número que apareça no BU
  const linhas = useMemo(() => {
    const nums = new Set(candidatos.map((c) => c.numero))
    Object.keys(pres?.candidatos ?? {}).forEach((n) => nums.add(Number(n)))
    return [...nums]
      .sort((a, b) => a - b)
      .map((n) => ({
        chave: `c${n}`,
        rotulo: `${n} — ${candidatos.find((c) => c.numero === n)?.nome ?? 'Candidato'}`,
        ref: pres ? (pres.candidatos[n] ?? 0) : null,
      }))
  }, [candidatos, pres])

  const extras = [
    { chave: 'brancos', rotulo: 'Brancos', ref: pres?.totais.branco },
    { chave: 'nulos', rotulo: 'Nulos', ref: pres ? pres.totais.nulo + pres.totais.outros : null },
    { chave: 'comparecimento', rotulo: 'Comparecimento', ref: pres?.comparecimento },
    { chave: 'aptos', rotulo: 'Eleitores aptos', ref: pres?.aptos },
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
  if (pres) {
    checagens.push({
      ok: pres.soma === pres.comparecimento,
      texto: `BU (${fonte}): soma dos votos = ${fmt(pres.soma)}; comparecimento = ${fmt(pres.comparecimento)}`,
    })
    checagens.push({
      ok: pres.comparecimento <= pres.aptos,
      texto: `BU (${fonte}): comparecimento (${fmt(pres.comparecimento)}) não excede aptos (${fmt(pres.aptos)})`,
    })
    if (algumDigitado) {
      const diverg = [...linhas, ...extras].filter((l) => v(l.chave) != null && v(l.chave) !== l.ref)
      const vazios = [...linhas, ...extras].filter((l) => v(l.chave) == null)
      checagens.unshift({
        ok: diverg.length === 0,
        texto:
          diverg.length === 0
            ? `Todos os valores informados batem com o BU (${fonte})${vazios.length ? ` (${vazios.length} campo(s) não preenchido(s))` : ''}`
            : `Valores divergentes do BU (${fonte}): ${diverg.map((d) => d.rotulo).join(', ')}`,
      })
    }
  }

  function copiarDoBU() {
    const d = {}
    for (const l of [...linhas, ...extras]) d[l.chave] = String(l.ref ?? '')
    setDigitado(d)
  }

  // Função (não componente) para o input não perder o foco a cada tecla
  const linha = (l) => {
    const val = v(l.chave)
    const status = val == null || l.ref == null ? '' : val === l.ref ? 'ok' : 'diverge'
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
        <td className="num">{fmt(l.ref)}</td>
        <td className="status">
          {status === 'ok' ? '✔' : status === 'diverge' ? `✘ ${val - l.ref > 0 ? '+' : ''}${fmt(val - l.ref)}` : ''}
        </td>
      </tr>
    )
  }

  return (
    <>
      <h2>{passo}. Digite os números do boletim impresso (votos para Presidente)</h2>
      <table className="tabela">
        <thead>
          <tr>
            <th>Item</th>
            <th>Boletim impresso</th>
            <th>{fonte}</th>
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
        {pres && (
          <button className="secundario" onClick={copiarDoBU} title="Útil para conferir só as somas">
            Copiar valores do BU
          </button>
        )}
      </div>

      {checagens.length > 0 && (
        <>
          <h2>{passo + 1}. Resultado da conferência</h2>
          <ul className="checagens">
            {checagens.map((c, i) => (
              <li key={i} className={c.ok ? 'ok' : 'diverge'}>
                {c.ok ? '✔' : '✘'} {c.texto}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
