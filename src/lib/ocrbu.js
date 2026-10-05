// Extrai dados de Presidente do texto de um boletim de urna impresso, obtido
// por OCR de uma foto. É uma leitura "melhor esforço": o resultado serve para
// pré-preencher a conferência e precisa ser revisado comparando com a foto.

const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Corrige confusões típicas do OCR dentro de tokens numéricos (O→0, l/I→1, S→5…)
function corrigirNumeros(linha) {
  return linha.replace(/\b[0-9OoIlL|SB]*\d[0-9OoIlL|SB]*\b/g, (t) =>
    t.replace(/[Oo]/g, '0').replace(/[IlL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8'),
  )
}

const inteiros = (linha) => (linha.match(/\d+/g) ?? []).map(Number)

function primeiro(texto, re) {
  const m = re.exec(texto)
  return m ? Number(m[1]) : null
}

// O OCR às vezes troca 0 por 6/8 ou insere um dígito a mais no código do
// município. Gera variantes plausíveis de 5 dígitos, da mais para a menos provável;
// quem chama confere contra a lista real de municípios.
function alternativasMunicipio(token) {
  if (!token) return []
  const out = new Set()
  const add = (t) => t.length >= 4 && t.length <= 5 && out.add(Number(t))
  add(token)
  if (token.length > 5) for (let i = 0; i < token.length; i++) add(token.slice(0, i) + token.slice(i + 1))
  for (const base of [...out].map((n) => String(n).padStart(5, '0'))) {
    for (let i = 0; i < base.length; i++) {
      if ('68'.includes(base[i])) add(base.slice(0, i) + '0' + base.slice(i + 1))
    }
  }
  if (token.length > 5) {
    // trocar 6/8 por 0 antes de remover o dígito extra
    const trocado = token.replace(/[68]/g, '0')
    for (let i = 0; i < trocado.length; i++) add(trocado.slice(0, i) + trocado.slice(i + 1))
  }
  return [...out]
}

const FIM_PRESIDENTE = /\b(GOVERNADOR|SENADOR|DEPUTADO|VICE-?GOVERNADOR|PREFEITO|VEREADOR|CONSULTA)\b/

export function parseTextoBU(textoOCR, numerosCandidatos = []) {
  const linhas = semAcento(String(textoOCR))
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => corrigirNumeros(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const texto = linhas.join('\n')

  const tokenMun = /MUNICIPIO[^\d\n]{0,15}(\d{4,7})/.exec(texto)?.[1]
  const alternativas = alternativasMunicipio(tokenMun)
  const secao = {
    municipio: alternativas[0] ?? null,
    alternativas,
    zona: primeiro(texto, /ZONA(?: ELEITORAL)?[^\d\n]{0,10}(\d{1,4})/),
    secao: primeiro(texto, /SECAO(?: ELEITORAL)?[^\d\n]{0,10}(\d{1,4})/),
  }

  const valores = {}
  const aptos = primeiro(texto, /ELEITORES APTOS[^\d\n]{0,10}(\d+)/)
  const comparecimento = primeiro(texto, /COMPARECIMENTO[^\d\n]{0,10}(\d+)/)
  if (aptos != null) valores.aptos = String(aptos)
  if (comparecimento != null) valores.comparecimento = String(comparecimento)

  // Bloco do cargo Presidente: da linha "PRESIDENTE" até o próximo cargo
  const conhecidos = new Set(numerosCandidatos.map(Number))
  const ini = linhas.findIndex((l) => /^PRESIDENTE\b/.test(l) || /\bPRESIDENTE$/.test(l))
  let candidatosLidos = 0
  if (ini >= 0) {
    for (let i = ini + 1; i < linhas.length; i++) {
      const l = linhas[i]
      if (FIM_PRESIDENTE.test(l)) break
      const nums = inteiros(l)
      if (/BRANCO/.test(l) && nums.length) {
        valores.brancos = String(nums[nums.length - 1])
      } else if (/NULO/.test(l) && nums.length) {
        valores.nulos = String(nums[nums.length - 1])
      } else if (!/NOMINAIS|TOTAL|APURADO|LEGENDA|PARTIDO/.test(l) && nums.length >= 2) {
        // "NOME DO CANDIDATO  13  99": número do candidato seguido dos votos
        for (let k = nums.length - 2; k >= 0; k--) {
          const n = nums[k]
          if (conhecidos.size ? conhecidos.has(n) : n >= 10 && n <= 99) {
            valores[`c${n}`] = String(nums[nums.length - 1])
            candidatosLidos++
            break
          }
        }
      }
    }
  }

  return { secao, valores, candidatosLidos, encontrouPresidente: ini >= 0 }
}
