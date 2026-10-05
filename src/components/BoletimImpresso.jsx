import { useState } from 'react'
import jsQR from 'jsqr'
import { conferirCodigo } from '../lib/bu.js'
import { parseQRBU } from '../lib/qrbu.js'

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^0+(?=.)/, '')

async function lerQRDaImagem(file) {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, 2500 / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * escala)
  const h = Math.round(bmp.height * escala)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0, w, h)
  const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)
  if (!r) throw new Error('Nenhum QR Code encontrado na imagem. Tente uma foto mais próxima e nítida, um QR por vez.')
  return r.data
}

// Entrada de dados do boletim impresso: BU digital (QR Code) e código verificador.
// `bu` é o BU decodificado (do TSE ou de arquivo) para conferir os códigos.
export default function BoletimImpresso({ bu, onQR }) {
  const [texto, setTexto] = useState('')
  const [qr, setQr] = useState(null)
  const [erro, setErro] = useState(null)
  const [lendo, setLendo] = useState(false)
  const [codigo, setCodigo] = useState('')

  function ler(t = texto) {
    setErro(null)
    try {
      const q = parseQRBU(t)
      setQr(q)
      onQR?.(q)
    } catch (e) {
      setQr(null)
      setErro(e.message)
    }
  }

  async function foto(files) {
    setErro(null)
    setLendo(true)
    try {
      let novo = texto
      for (const f of files) novo = `${novo}${novo ? '\n' : ''}${await lerQRDaImagem(f)}`
      setTexto(novo)
      ler(novo)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLendo(false)
    }
  }

  // Conferências de identificação
  const checagens = []
  if (codigo.trim()) {
    if (bu) {
      const campo = conferirCodigo(bu, codigo)
      checagens.push({
        ok: !!campo,
        texto: campo
          ? `Código verificador confere: ${campo} desta urna`
          : 'Código verificador não corresponde a nenhum código desta urna',
      })
    } else if (qr) {
      const ok = [qr.urna.idue, qr.urna.codigoCarga].some((c) => c && norm(c) === norm(codigo))
      checagens.push({
        ok,
        texto: ok ? 'Código verificador confere com o QR Code' : 'Código verificador não aparece no QR Code',
      })
    }
  }
  if (qr && bu?.secao) {
    const s = qr.secao
    const okSecao = s.municipio === bu.secao.municipio && s.zona === bu.secao.zona && s.secao === bu.secao.secao
    checagens.push({
      ok: okSecao,
      texto: `Seção do QR Code (mun. ${s.municipio}, zona ${s.zona}, seção ${s.secao}) ${okSecao ? 'é a mesma do BU' : `difere do BU (mun. ${bu.secao.municipio}, zona ${bu.secao.zona}, seção ${bu.secao.secao})`}`,
    })
    if (qr.urna.idue && bu.urna?.idue != null) {
      const ok = norm(qr.urna.idue) === norm(bu.urna.idue)
      checagens.push({ ok, texto: `Identificação da urna no QR Code (${qr.urna.idue}) ${ok ? 'confere' : `difere do BU (${bu.urna.idue})`}` })
    }
    if (qr.urna.codigoCarga && bu.urna?.codigoCarga) {
      const ok = norm(qr.urna.codigoCarga) === norm(bu.urna.codigoCarga)
      checagens.push({ ok, texto: `Código de carga no QR Code ${ok ? 'confere com o BU' : 'difere do BU'}` })
    }
  }

  return (
    <div className="impresso">
      <div className="impresso-campos">
        <label className="cheio">
          BU digital (texto do QR Code do boletim impresso)
          <textarea
            rows={3}
            placeholder="QRBU:1:1 VRQR:1.5 ... UNFE:AC MUNI:1066 ZONA:4 SECA:77 ... 13:99 22:103 ..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <div className="acoes">
          <button onClick={() => ler()} disabled={!texto.trim()}>Ler BU digital</button>
          <label className={`botao secundario ${lendo ? 'desabilitado' : ''}`}>
            {lendo ? 'Lendo foto…' : 'Foto do QR Code'}
            <input type="file" accept="image/*" capture="environment" multiple hidden
              onChange={(e) => { foto([...e.target.files]); e.target.value = '' }} />
          </label>
          {(texto || qr) && (
            <button className="secundario" onClick={() => { setTexto(''); setQr(null); setErro(null) }}>Limpar QR</button>
          )}
        </div>
        <label>
          Código verificador (identificação da urna ou código de carga)
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ex.: 02293919" />
        </label>
      </div>

      {erro && <div className="alerta erro">{erro}</div>}
      {qr && (
        <p className="info">
          QR lido: {qr.secao.uf?.toUpperCase()} · município {qr.secao.municipio} · zona {qr.secao.zona} ·
          seção {qr.secao.secao}
          {qr.partes.total ? ` · partes ${qr.partes.lidas.join(', ')} de ${qr.partes.total}` : ''}
          {qr.urna.idue ? ` · urna ${qr.urna.idue}` : ''}
        </p>
      )}
      {qr?.avisos.map((a) => <div key={a} className="alerta">{a}</div>)}
      {checagens.length > 0 && (
        <ul className="checagens">
          {checagens.map((c, i) => (
            <li key={i} className={c.ok ? 'ok' : 'diverge'}>{c.ok ? '✔' : '✘'} {c.texto}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
