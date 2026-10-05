# Validador de Urnas — Presidente

Site para conferir os resultados de **Presidente** usando os dados públicos do TSE.
Você compara o boletim de urna impresso (o papel afixado na seção) com o arquivo
que o TSE publicou, e pode refazer a soma de todas as seções.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```sh
git clone https://github.com/lucas-zimerman/urna-validador.git
cd urna-validador
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5173).

## Como usar

### Validar boletim de urna

Confere um boletim impresso contra o arquivo do TSE.

1. **Encontre a seção.** Digite o código do município, a zona e a seção como estão
   impressos no boletim (ex.: `01066`, `4`, `77`). Também dá para escolher nas listas.
2. **Digite os números do boletim:** votos de cada candidato, brancos, nulos,
   comparecimento e eleitores aptos.
3. **Veja o resultado.** Cada linha mostra ✔ se bate com o TSE ou ✘ com a diferença,
   e o site também confere se as somas fecham.

Atalhos:

- **BU digital (QR Code):** cole o texto do QR Code do boletim (lido com qualquer
  app de QR, ou com o app *Boletim na Mão* do TSE) ou envie uma foto do QR.
  O site encontra a seção e preenche tudo sozinho.
- **Código verificador:** digite a identificação da urna ou o código de carga
  impresso no boletim para conferir se é a mesma urna do arquivo do TSE.
- **Foto do boletim:** a foto fica ao lado da tabela para você conferir enquanto
  digita. O botão **Ler texto da foto (OCR)** tenta preencher os números
  sozinho — confira sempre com a foto, porque o OCR pode errar dígitos.

### Totalizar por seção

Escolha um município, um estado ou o Brasil inteiro. O site baixa o boletim de
cada seção, soma os votos para Presidente e compara com o total oficial do TSE.

> O Brasil inteiro tem centenas de milhares de seções e pode levar horas.
> Comece por um município ou estado.

### Validador offline

Confere arquivos de boletim que estão no seu computador, sem internet:
arraste arquivos `.bu` / `-bu.dat`, uma pasta ou um `.zip` (por exemplo, os
pacotes por estado do [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br)).
O site confere a soma de cada boletim e soma todos eles.

## Dicas

- **Votos no exterior:** escolha a UF `ZZ — Exterior`. Cada cidade é um município
  (ex.: `30805 — WELLINGTON`, `30341 — PORTO`).
- **Seção agregada:** às vezes várias seções votam na mesma urna. Se você escolher
  uma seção agregada, o site mostra o boletim da seção principal, que contém os
  votos de todas.
- **Linha de comando:** a totalização também roda no terminal:
  `npm run totalizar -- --uf ac` (ou `--uf sp --mun 71072`).

## Limitações

- Confere os **números** e os **códigos** da urna. Não verifica as assinaturas
  digitais do boletim nem do QR Code.
- O TSE limita o número de requisições; se aparecer "HTTP 429", espere um pouco
  e tente de novo.

Projeto independente, sem vínculo com o TSE. Os dados vêm da API pública
[resultados.tse.jus.br](https://resultados.tse.jus.br).
