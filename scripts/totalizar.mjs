#!/usr/bin/env node
// Totaliza os votos para Presidente a partir dos BUs de cada seção e compara
// com o resultado oficial do TSE.
//
//   npm run totalizar -- --uf ac
//   npm run totalizar -- --uf sp --mun 71072 --concorrencia 32
//   npm run totalizar -- --uf br          (todas as UFs + exterior; demora!)
//   npm run totalizar -- --uf ac --json resultado.json

import { writeFileSync } from 'node:fs'
import { listarEleicoesPresidente, resultadoOficial, UFS } from '../src/lib/tse.js'
import { listarSecoes, totalizar } from '../src/lib/totalizar.js'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? true : (arr[i + 1] ?? true)])
    return acc
  }, []),
)

const uf = String(args.uf ?? 'ac').toLowerCase()
const mun = args.mun ? String(args.mun).padStart(5, '0') : undefined
const concorrencia = Number(args.concorrencia ?? 8)

const eleicoes = await listarEleicoesPresidente()
const el = args.eleicao ? eleicoes.find((e) => e.eleicao === String(args.eleicao)) : eleicoes[0]
if (!el) {
  console.error('Eleição não encontrada. Disponíveis:', eleicoes.map((e) => `${e.eleicao} (${e.nome})`))
  process.exit(1)
}
console.log(`Eleição: ${el.nome} — pleito ${el.pleito}, eleição ${el.eleicao}`)

const ufs = uf === 'br' ? UFS.map(([u]) => u) : [uf]
const secoes = await listarSecoes(el, ufs, { municipio: mun })
console.log(`Seções a processar: ${secoes.length.toLocaleString('pt-BR')}`)

const inicio = Date.now()
const total = await totalizar(el, secoes, {
  concorrencia,
  onProgress: (t, n) => {
    const pct = ((t.secoesProcessadas / n) * 100).toFixed(1)
    process.stderr.write(`\r  ${t.secoesProcessadas}/${n} (${pct}%) — urnas: ${t.urnasContadas}, erros: ${t.erros}   `)
  },
})
process.stderr.write('\n')
console.log(`Concluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s`)

const oficial = await resultadoOficial(el, uf, mun)
const fmt = (n) => n.toLocaleString('pt-BR')
const linha = (rotulo, nosso, deles) =>
  console.log(`${rotulo.padEnd(34)} ${fmt(nosso).padStart(14)} ${fmt(deles).padStart(14)}  ${nosso === deles ? 'OK' : `DIFERENÇA ${fmt(nosso - deles)}`}`)

console.log(`\n${'Item'.padEnd(34)} ${'Soma dos BUs'.padStart(14)} ${'TSE oficial'.padStart(14)}`)
for (const c of oficial.candidatos) {
  linha(`${c.numero} ${c.nome}`.slice(0, 34), total.candidatos[c.numero] ?? 0, c.votos)
}
linha('Brancos', total.brancos, oficial.brancos)
linha('Nulos', total.nulos, oficial.nulos)
linha('Comparecimento', total.comparecimento, oficial.comparecimento)
linha('Eleitores aptos', total.aptos, oficial.aptos)

if (total.agregadas) console.log(`\nSeções agregadas (votos contados no BU da seção principal): ${total.agregadas}`)
if (total.inconsistentes.length) console.log(`\nBUs com soma != comparecimento: ${total.inconsistentes.length}`)
if (total.falhas.length) {
  console.log(`\nSeções sem BU/erro: ${total.falhas.length}`)
  for (const f of total.falhas.slice(0, 20)) console.log(`  ${f.uf} ${f.mun} z${f.zona} s${f.secao}: ${f.motivo}`)
}

if (args.json) {
  writeFileSync(String(args.json), JSON.stringify({ eleicao: el, uf, mun, total, oficial }, null, 2))
  console.log(`\nSalvo em ${args.json}`)
}
