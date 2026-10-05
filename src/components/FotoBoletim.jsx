import { useState } from 'react'
import { parseTextoBU } from '../lib/ocrbu.js'

// Foto do boletim impresso: mostra a imagem (via onFoto) e, opcionalmente,
// tenta ler o texto com OCR para identificar a seção e pré-preencher os votos.
// O tesseract.js é carregado sob demanda e baixa o modelo de português na
// primeira leitura (precisa de internet nessa hora).
export default function FotoBoletim({ candidatos, onFoto, onLeitura }) {
  const [arquivo, setArquivo] = useState(null)
  const [estado, setEstado] = useState(null) // texto de progresso
  const [erro, setErro] = useState(null)
  const [textoOCR, setTextoOCR] = useState('')
  const [resumo, setResumo] = useState(null)

  function escolher(f) {
    if (!f) return
    setArquivo(f)
    setTextoOCR('')
    setResumo(null)
    setErro(null)
    onFoto?.(URL.createObjectURL(f))
  }

  async function lerTexto() {
    setErro(null)
    setEstado('Carregando OCR…')
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('por', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') setEstado(`Lendo texto… ${Math.round(m.progress * 100)}%`)
          else if (m.status) setEstado(`${m.status}…`)
        },
      })
      const { data } = await worker.recognize(arquivo)
      await worker.terminate()
      setTextoOCR(data.text)
      const r = parseTextoBU(data.text, candidatos.map((c) => c.numero))
      setResumo(r)
      onLeitura?.(r)
    } catch (e) {
      setErro(`Falha no OCR: ${e.message ?? e}`)
    } finally {
      setEstado(null)
    }
  }

  const s = resumo?.secao
  return (
    <div className="impresso">
      <div className="acoes">
        <label className="botao secundario">
          Foto do boletim
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { escolher(e.target.files[0]); e.target.value = '' }} />
        </label>
        <button onClick={lerTexto} disabled={!arquivo || !!estado}>
          {estado ?? 'Ler texto da foto (OCR)'}
        </button>
        {arquivo && (
          <button className="secundario" onClick={() => { setArquivo(null); setResumo(null); setTextoOCR(''); onFoto?.(null) }}>
            Remover foto
          </button>
        )}
      </div>
      {erro && <div className="alerta erro">{erro}</div>}
      {resumo && (
        <div className="alerta">
          OCR: município {s.municipio ?? '?'} · zona {s.zona ?? '?'} · seção {s.secao ?? '?'} ·{' '}
          {resumo.encontrouPresidente
            ? `${resumo.candidatosLidos} candidato(s) a Presidente lido(s)`
            : 'bloco "PRESIDENTE" não encontrado'}
          . <strong>Confira cada número com a foto</strong>: o OCR pode errar dígitos, e um erro de
          leitura aparece como divergência na tabela.
        </div>
      )}
      {textoOCR && (
        <details>
          <summary>Texto lido pelo OCR</summary>
          <pre className="ocr">{textoOCR}</pre>
        </details>
      )}
    </div>
  )
}
