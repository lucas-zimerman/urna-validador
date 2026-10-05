# Validador de Urnas — Presidente

Site em React que confere os resultados de **Presidente** usando apenas os
arquivos públicos do TSE (`resultados.tse.jus.br`).

## O que faz

**1. Validar boletim de urna**
Você escolhe UF → município → zona → seção e digita os números do boletim
impresso (votos por candidato, brancos, nulos, comparecimento, aptos). O site
baixa o BU (`*-bu.dat`) daquela seção no TSE, decodifica e mostra:

- se cada valor digitado bate com o BU publicado pelo TSE;
- se a soma do boletim digitado (candidatos + brancos + nulos) bate com o comparecimento;
- se a soma do próprio BU do TSE bate com o comparecimento, e se o comparecimento não excede os aptos.

**2. Totalizar por seção**
Baixa o BU de cada seção de um município, de uma UF ou do Brasil inteiro, pega
só o cargo de Presidente, soma tudo e compara com o total oficial divulgado pelo
TSE para a mesma abrangência. Seções agregadas (que compartilham o BU da seção
principal) são contadas uma vez só. Também aponta BUs cuja soma não bate com o
comparecimento e seções sem BU.

A eleição é escolhida a partir da configuração do próprio TSE
(`/oficial/comum/config/ele-c.json`), então o 2º turno aparece sozinho quando for publicado.

## Rodando

Requer Node 22 (`.nvmrc`):

```sh
nvm use
npm install
npm run dev
```

O navegador acessa o TSE diretamente (o servidor do TSE libera CORS).

### Totalização pela linha de comando

Mesma lógica do site, útil para abrangências grandes:

```sh
npm run totalizar -- --uf ac --mun 01066
npm run totalizar -- --uf sp --concorrencia 8 --json sp.json
npm run totalizar -- --uf br        # Brasil inteiro: centenas de milhares de seções
```

## Estrutura

- `src/lib/der.js` — leitor mínimo de ASN.1 DER
- `src/lib/bu.js` — decodifica o Boletim de Urna e extrai o cargo de Presidente
- `src/lib/tse.js` — URLs e acesso à API do TSE (com retentativa para HTTP 429/5xx)
- `src/lib/totalizar.js` — download em paralelo e soma por seção
- `src/components/` — telas de validação e de totalização
- `scripts/totalizar.mjs` — versão CLI da totalização

## Observações

- O TSE limita requisições em rajada (HTTP 429). Mantenha a concorrência baixa (8 é o padrão).
- Projeto independente, sem vínculo com o TSE.
