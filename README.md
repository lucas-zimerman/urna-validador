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

Em vez de escolher a seção e digitar os números, dá para usar o **BU digital**:
cole o texto do QR Code do boletim impresso (ou carregue uma foto do QR). O site
localiza a seção, busca o BU e preenche a tabela sozinho. Também há um campo de
**código verificador**: digite a identificação da urna ou o código de carga
impresso no boletim e o site confere se é o mesmo gravado no BU. Se o QR e o BU
estiverem disponíveis, também confere se a seção, a urna e o código de carga são
os mesmos nos dois.

Para fotos de boletim sem QR Code legível (comum em redes sociais):

- **Busca rápida pelos números:** digite o código do município (5 dígitos, como
  impresso no boletim), a zona e a seção. A UF é descoberta sozinha. Os seletores
  também mostram o código junto do nome (`01066 — PORTO WALTER`).
- **Foto do boletim:** a foto fica ao lado da tabela para conferir enquanto digita.
  O botão **Ler texto da foto (OCR)** usa o tesseract.js para tentar identificar
  a seção e pré-preencher os votos para Presidente. É uma leitura de melhor
  esforço: dígitos podem sair errados ou em branco, então confira com a foto.
  Se o código do município lido não existir, o site tenta variações próximas
  (o OCR costuma trocar 0 por 6) e avisa qual município usou. O modelo de
  português do OCR é baixado da internet na primeira leitura.

**2. Totalizar por seção**
Baixa o BU de cada seção de um município, de uma UF ou do Brasil inteiro, pega
só o cargo de Presidente, soma tudo e compara com o total oficial divulgado pelo
TSE para a mesma abrangência. Seções agregadas (que compartilham o BU da seção
principal) são contadas uma vez só. Também aponta BUs cuja soma não bate com o
comparecimento e seções sem BU.

**3. Validador offline**
Confere arquivos de BU que estão no seu computador, sem acessar a internet:
arquivos `.bu` / `-bu.dat` (portal do TSE ou pen drive da urna), pastas inteiras
ou `.zip` com vários boletins (inclusive zips dentro de zips). Para cada boletim,
mostra se a soma bate com o comparecimento. Também soma todos os boletins
carregados, contando cada seção uma vez só, e deixa você conferir um boletim
contra os números do boletim impresso, digitados ou lidos do QR Code. O QR Code
localiza o boletim da mesma seção entre os arquivos carregados. Sem nenhum
arquivo, o QR sozinho ainda tem as somas conferidas. Nada é enviado para
servidor algum.

**Exterior:** brasileiros que votam fora do país aparecem na UF `ZZ — Exterior`,
com cada cidade como município (ex.: `30805 — WELLINGTON`, Nova Zelândia). Tudo
acima funciona igual para o exterior, inclusive a busca rápida pelo código.

**Seções agregadas:** quando várias seções votam na mesma urna (comum no
exterior), só a seção principal tem BU. Validar uma seção agregada busca o BU
da principal e avisa; na totalização elas são contadas à parte, não como erro.

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
- `src/lib/offline.js` — leitura de BUs locais e de arquivos `.zip`
- `src/lib/qrbu.js` — leitura do texto do QR Code do boletim impresso (BU digital)
- `src/lib/ocrbu.js` — extração de seção e votos do texto lido por OCR de uma foto do boletim
- `src/components/` — telas de validação e de totalização
- `scripts/totalizar.mjs` — versão CLI da totalização

## Observações

- O TSE limita requisições em rajada (HTTP 429). Mantenha a concorrência baixa (8 é o padrão).
- O hash e a assinatura digital do QR Code (campos `HASH`/`ASSI`) e do BU não são verificados: a conferência é dos números e códigos.
- Projeto independente, sem vínculo com o TSE.
