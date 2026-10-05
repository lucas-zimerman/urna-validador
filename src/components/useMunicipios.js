import { useEffect, useState } from 'react'
import { carregarSecoes } from '../lib/tse.js'

// Carrega municípios → zonas → seções de uma UF (arquivo de configuração do pleito).
export function useMunicipios(eleicao, uf) {
  const [estado, setEstado] = useState({ municipios: [], carregando: false, erro: null })

  useEffect(() => {
    if (!eleicao || !uf || uf === 'br') {
      setEstado({ municipios: [], carregando: false, erro: null })
      return
    }
    let vivo = true // ignora respostas de uma UF que já foi trocada
    setEstado({ municipios: [], carregando: true, erro: null })
    carregarSecoes(eleicao, uf)
      .then((m) => {
        const ordenados = [...m].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        if (vivo) setEstado({ municipios: ordenados, carregando: false, erro: null })
      })
      .catch((e) => {
        if (vivo) setEstado({ municipios: [], carregando: false, erro: e.message })
      })
    return () => {
      vivo = false
    }
  }, [eleicao, uf])

  return estado
}
