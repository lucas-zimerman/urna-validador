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
    const ctrl = new AbortController()
    setEstado({ municipios: [], carregando: true, erro: null })
    carregarSecoes(eleicao, uf, { signal: ctrl.signal })
      .then((m) => {
        m.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        setEstado({ municipios: m, carregando: false, erro: null })
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setEstado({ municipios: [], carregando: false, erro: e.message })
      })
    return () => ctrl.abort()
  }, [eleicao, uf])

  return estado
}
