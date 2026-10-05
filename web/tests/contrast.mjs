import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const input = process.argv[2] || fileURLToPath(new URL('../../artifacts/computed-colors.json', import.meta.url))
const output = process.argv[3] || fileURLToPath(new URL('../../artifacts/contrast.json', import.meta.url))
const pairs = JSON.parse(await readFile(input, 'utf8'))
function rgb(value) {
  if (value.startsWith('#')) return value.slice(1).match(/../g).map(v => parseInt(v, 16))
  return value.match(/[\d.]+/g).slice(0, 3).map(Number)
}
function luminance(color) {
  const values = rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
}
const results = Object.entries(pairs).map(([name, pair]) => {
  const a = luminance(pair.foreground)
  const b = luminance(pair.background)
  const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  const threshold = ['focus', 'controlBorder'].includes(name) ? 3 : 4.5
  return { name, ...pair, ratio: Number(ratio.toFixed(2)), threshold, passed: ratio >= threshold }
})
await writeFile(output, JSON.stringify({ method: 'WCAG sRGB relative luminance; pairs sampled from opaque rendered surfaces in Chromium', results }, null, 2) + '\n')
for (const item of results) console.log(`${item.name}: ${item.ratio}:1 (target ${item.threshold}:1) ${item.passed ? 'PASS' : 'FAIL'}`)
if (results.some(result => !result.passed)) process.exitCode = 1
