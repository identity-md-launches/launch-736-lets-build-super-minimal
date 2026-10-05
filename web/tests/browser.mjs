import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// All chain and wallet traffic in these tests is synthetic. No transaction is broadcast.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = process.env.COUNTER_EVIDENCE_DIR || resolve(root, 'artifacts')
const artifact = JSON.parse(await readFile(resolve(root, 'web/src/counter-artifact.json'), 'utf8'))
const ADDRESS = JSON.parse(await readFile(resolve(root, 'web/src/deployment.json'), 'utf8')).address
const ACCOUNT = '0x2222222222222222222222222222222222222222'
const HASH = `0x${'ab'.repeat(32)}`
const BLOCK_HASH = `0x${'cd'.repeat(32)}`
const results = []
const errors = []
await mkdir(out, { recursive: true })
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const relative = pathname.replace(/^\/preview\//, '') || 'index.html'
  const path = resolve(root, 'dist', relative)
  if (!pathname.startsWith('/preview/') || !path.startsWith(resolve(root, 'dist') + '/')) { response.writeHead(404).end(); return }
  try { response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)) }
  catch { response.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/preview/`
let browser
const check = async (name, fn) => { await fn(); results.push({ name, result: 'passed' }); console.log(`PASS ${name}`) }

function walletScript({ account, hash }) {
  const listeners = new Map()
  window.testWallet = { chain: '0x1', connected: false, reject: false, rejectConnect: false, sent: [], hold: false }
  const provider = {
    on(name, fn) { listeners.set(name, [...(listeners.get(name) || []), fn]) },
    removeListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(x => x !== fn)) },
    async request({ method, params }) {
      const state = window.testWallet
      if (method === 'eth_requestAccounts' || method === 'wallet_requestPermissions') {
        if (state.rejectConnect) throw Object.assign(new Error('Rejected'), { code: 4001 })
        state.connected = true
        return method === 'wallet_requestPermissions' ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [account] }] }] : [account]
      }
      if (method === 'eth_accounts') return state.connected ? [account] : []
      if (method === 'eth_chainId') return state.chain
      if (method === 'wallet_switchEthereumChain') {
        if (state.reject) throw Object.assign(new Error('Rejected'), { code: 4001 })
        state.chain = params[0].chainId
        for (const fn of listeners.get('chainChanged') || []) fn(state.chain)
        return null
      }
      if (method === 'eth_sendTransaction') {
        if (state.reject) throw Object.assign(new Error('Rejected'), { code: 4001 })
        if (state.hold) await new Promise(r => { window.releaseWallet = r })
        state.sent.push(params[0]); return hash
      }
      if (method === 'wallet_revokePermissions') { state.connected = false; return null }
      if (method === 'wallet_getCapabilities') return {}
      throw Object.assign(new Error(`Unsupported mock method ${method}`), { code: 4200 })
    },
  }
  window.changeTestChain = chain => { window.testWallet.chain = chain; for (const fn of listeners.get('chainChanged') || []) fn(chain) }
  window.changeTestAccount = value => { for (const fn of listeners.get('accountsChanged') || []) fn(value ? [value] : []) }
  window.ethereum = provider
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
    info: { uuid: 'd1e06925-6a2a-46c0-b53a-92615c60f8f1', name: 'Test wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'test.wallet' }, provider,
  } }))
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
}

async function routeChain(context, chain, calls = []) {
  await context.route(/^https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/, async route => {
    const request = route.request().postDataJSON()
    if (chain.unavailable) { await route.fulfill({ status: 503, body: 'Unavailable' }); return }
    const answer = item => {
      calls.push(item)
      const base = { jsonrpc: '2.0', id: item.id }
      const tx = { hash: HASH, nonce: '0x0', blockHash: chain.receipt ? BLOCK_HASH : null, blockNumber: chain.receipt ? '0x100' : null, transactionIndex: chain.receipt ? '0x0' : null, from: ACCOUNT, to: ADDRESS, value: '0x0', gas: '0x10000', gasPrice: '0x1', input: '0xd09de08a', type: '0x0', v: '0x25', r: '0x1', s: '0x1' }
      switch (item.method) {
        case 'eth_chainId': return { ...base, result: chain.chainId }
        case 'eth_getCode': return { ...base, result: chain.code }
        case 'eth_blockNumber': return { ...base, result: `0x${(chain.block || 256).toString(16)}` }
        case 'eth_call':
          if (item.params[0].data === '0x06661abd') return { ...base, result: `0x${chain.count.toString(16).padStart(64, '0')}` }
          if (chain.simulateRevert) return { ...base, error: { code: 3, message: 'execution reverted', data: '0x' } }
          return { ...base, result: '0x' }
        case 'eth_getTransactionByHash': return { ...base, result: tx }
        case 'eth_getTransactionReceipt': return { ...base, result: chain.receipt && { transactionHash: HASH, transactionIndex: '0x0', blockHash: BLOCK_HASH, blockNumber: '0x100', from: ACCOUNT, to: ADDRESS, cumulativeGasUsed: '0x7530', gasUsed: '0x7530', contractAddress: null, logs: [], logsBloom: `0x${'0'.repeat(512)}`, status: chain.receipt, effectiveGasPrice: '0x1', type: '0x0' } }
        case 'eth_getBlockByNumber': return { ...base, result: { number: '0x100', hash: BLOCK_HASH, parentHash: BLOCK_HASH, nonce: '0x0', sha3Uncles: BLOCK_HASH, logsBloom: `0x${'0'.repeat(512)}`, transactionsRoot: BLOCK_HASH, stateRoot: BLOCK_HASH, receiptsRoot: BLOCK_HASH, miner: ADDRESS, difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x1', gasLimit: '0x1000000', gasUsed: '0x7530', timestamp: '0x1', transactions: chain.receipt ? (item.params[1] ? [tx] : [HASH]) : [], uncles: [], baseFeePerGas: '0x1' } }
        default: throw new Error(`Unhandled RPC method: ${item.method}`)
      }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(request) ? request.map(answer) : answer(request)) })
  })
}

try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await routeChain(context, { count: 0n, code: artifact.runtime, chainId: '0x1', receipt: null, unavailable: false, simulateRevert: false })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', response => { if (response.status() >= 400 && response.url().includes('/preview/')) errors.push(`${response.status()} ${response.url()}`) })
  await page.goto(url, { waitUntil: 'networkidle' })
  await check('Production assets load at /preview/ with relative URLs', async () => {
    assert.match(await page.title(), /Counter/)
    assert.equal(await page.locator('h1').innerText(), 'you know.')
    await page.waitForFunction(() => document.querySelector('[data-testid="count"]').textContent === '0')
    assert.equal(errors.length, 0)
  })
  await check('Initial page has no automated WCAG A/AA violations', async () => {
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    assert.deepEqual(audit.violations.map(v => `${v.id}: ${v.description}`), [])
  })
  await page.screenshot({ path: resolve(out, 'desktop.png'), fullPage: true })
  for (const width of [320, 390, 704, 1024, 1440]) {
    await check(`No horizontal overflow at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      if (width === 320 || width === 390 || width === 704) await page.screenshot({ path: resolve(out, `viewport-${width}.png`), fullPage: true })
    })
  }
  await check('Keyboard opens wallet dialog; Escape restores visible focus', async () => {
    await page.keyboard.press('Tab')
    assert.equal(await page.locator(':focus').innerText(), 'Skip to counter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    assert.match(await page.locator(':focus').innerText(), /Connect wallet/)
    await page.keyboard.press('Enter')
    await page.getByText('No browser wallet found.').waitFor()
    assert.equal(await page.locator('dialog').evaluate(d => d.open), true)
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    assert.equal(audit.violations.length, 0)
    await page.screenshot({ path: resolve(out, 'wallet-empty.png'), fullPage: true })
    await page.keyboard.press('Escape')
    assert.match(await page.locator(':focus').innerText(), /Connect wallet/)
    assert.equal(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineStyle), 'solid')
    await page.screenshot({ path: resolve(out, 'keyboard-focus.png'), fullPage: true })
  })
  await check('200% text enlargement reflows without overflow', async () => {
    await page.setViewportSize({ width: 704, height: 900 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: resolve(out, 'text-200-percent.png'), fullPage: true })
    await page.evaluate(() => { document.documentElement.style.fontSize = '' })
  })
  await check('Reduced motion disables button transitions', async () => {
    assert.equal(await page.locator('.primary-button').evaluate(el => getComputedStyle(el).transitionDuration), '0s')
  })
  await check('Forced colors retains focus perimeter', async () => {
    await page.emulateMedia({ forcedColors: 'active' })
    await page.getByRole('button', { name: 'Copy contract address' }).focus()
    await page.keyboard.press('Tab')
    assert.equal(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineWidth), '2px')
    await page.screenshot({ path: resolve(out, 'forced-colors.png'), fullPage: true })
    await page.emulateMedia({ forcedColors: 'none' })
  })
  await check('Copy address succeeds and unavailable clipboard has a fallback', async () => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'Copy contract address' }).click()
    await page.getByText('Address copied.', { exact: true }).waitFor()
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).toLowerCase(), ADDRESS.toLowerCase())
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable') } })
    await page.getByRole('button', { name: 'Copy contract address' }).click()
    await page.getByText('Copy unavailable.', { exact: false }).waitFor()
  })
  const colors = await page.evaluate(() => {
    const sample = (selector, background) => {
      const s = getComputedStyle(document.querySelector(selector))
      const b = getComputedStyle(document.querySelector(background))
      return { foreground: s.color, background: b.backgroundColor }
    }
    return { body: sample('h1', 'html'), secondary: sample('.count-caption', '.terminal'), primary: sample('.primary-button', '.primary-button'), state: sample('.state-label', '.terminal'), controlBorder: { foreground: getComputedStyle(document.querySelector('.outline-button')).borderColor, background: getComputedStyle(document.documentElement).backgroundColor }, accent: sample('.ascii-title', 'html'), focus: { foreground: getComputedStyle(document.documentElement).getPropertyValue('--color-focus').trim(), background: getComputedStyle(document.querySelector('.terminal')).backgroundColor } }
  })
  await writeFile(resolve(out, 'computed-colors.json'), JSON.stringify(colors, null, 2) + '\n')
  await context.close()

  const walletContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await walletContext.addInitScript(walletScript, { account: ACCOUNT, hash: HASH })
  const chain = { count: 7n, code: artifact.runtime, chainId: '0x1', receipt: null, unavailable: false, simulateRevert: false }
  const calls = []
  await routeChain(walletContext, chain, calls)
  const wp = await walletContext.newPage()
  wp.on('pageerror', e => errors.push(e.message))
  await wp.goto(url)
  await check('Wallet rejection remains recoverable', async () => {
    await wp.evaluate(() => { window.testWallet.rejectConnect = true })
    await wp.locator('.primary-button').click()
    await wp.getByRole('button', { name: 'Test wallet' }).click()
    await wp.getByText('Request declined in your wallet.', { exact: false }).waitFor()
  })
  await check('Connect wallet and disconnect without requesting a transaction', async () => {
    await wp.evaluate(() => { window.testWallet.rejectConnect = false })
    await wp.getByRole('button', { name: 'Test wallet' }).click()
    await wp.getByRole('button', { name: 'Disconnect' }).waitFor()
    await wp.getByRole('button', { name: 'Increment +1' }).waitFor()
    await wp.getByRole('button', { name: 'Disconnect' }).click()
    await wp.getByRole('button', { name: 'Connect wallet' }).first().waitFor()
    assert.equal(await wp.evaluate(() => window.testWallet.sent.length), 0)
  })
  await check('Verified deployment loads a count and explorer links', async () => {
    await wp.waitForFunction(() => document.querySelector('[data-testid="count"]').textContent === '7')
    assert.equal((await wp.locator('.address-link').getAttribute('href')).toLowerCase(), `https://etherscan.io/address/${ADDRESS}`.toLowerCase())
    await wp.locator('.primary-button').click()
    await wp.getByRole('button', { name: 'Test wallet' }).click()
    await wp.getByRole('button', { name: 'Increment +1' }).waitFor()
  })
  await check('Code-free and mismatching contracts block increments', async () => {
    chain.code = '0x'
    await wp.getByRole('button', { name: 'Refresh', exact: true }).click()
    await wp.getByText('No contract exists', { exact: false }).waitFor()
    assert.equal(await wp.locator('.primary-button').isDisabled(), true)
    chain.code = '0x60006000'
    await wp.getByRole('button', { name: 'Retry reading count' }).click()
    await wp.getByText('does not match the Counter source', { exact: false }).waitFor()
    assert.equal(await wp.locator('.primary-button').isDisabled(), true)
    chain.code = artifact.runtime
    await wp.getByRole('button', { name: 'Retry reading count' }).click()
    await wp.waitForFunction(() => !document.querySelector('.primary-button').disabled)
  })
  await check('Wrong network offers switching and sends nothing', async () => {
    await wp.evaluate(() => window.changeTestChain('0xaa36a7'))
    await wp.getByRole('button', { name: 'Switch to Ethereum' }).waitFor()
    colors.warning = await wp.locator('.account-line .warning').evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(document.documentElement).backgroundColor }))
    await wp.getByRole('button', { name: 'Switch to Ethereum' }).click()
    await wp.getByRole('button', { name: 'Increment +1' }).waitFor()
    assert.equal(await wp.evaluate(() => window.testWallet.chain), '0x1')
    assert.equal(await wp.evaluate(() => window.testWallet.sent.length), 0)
  })
  await check('Rejected increment has no success state or count change', async () => {
    await wp.evaluate(() => { window.testWallet.reject = true })
    await wp.getByRole('button', { name: 'Increment +1' }).click()
    await wp.getByText('Request declined in your wallet.', { exact: false }).waitFor()
    colors.error = await wp.locator('.action-error').evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el.closest('.terminal')).backgroundColor }))
    assert.equal(await wp.getByTestId('count').innerText(), '7')
    assert.equal(await wp.evaluate(() => window.testWallet.sent.length), 0)
    await wp.evaluate(() => { window.testWallet.reject = false })
  })
  await check('Simulation revert stops before wallet submission', async () => {
    chain.simulateRevert = true
    await wp.getByRole('button', { name: 'Increment +1' }).click()
    await wp.getByText('The contract rejected this increment.', { exact: false }).waitFor()
    assert.equal(await wp.evaluate(() => window.testWallet.sent.length), 0)
    chain.simulateRevert = false
  })
  await check('Double activation sends one nonpayable increment on mainnet', async () => {
    await wp.evaluate(() => { window.testWallet.hold = true })
    await wp.locator('.primary-button').evaluate(button => { button.click(); button.click() })
    await wp.getByRole('button', { name: 'Approve in wallet…' }).waitFor()
    assert.equal(await wp.locator('.primary-button').isDisabled(), true)
    await wp.waitForFunction(() => !!window.releaseWallet)
    await wp.evaluate(() => { window.releaseWallet(); window.testWallet.hold = false })
    await wp.getByRole('button', { name: 'Increment pending…' }).waitFor()
    const sent = await wp.evaluate(() => window.testWallet.sent)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to.toLowerCase(), ADDRESS.toLowerCase())
    assert.equal(sent[0].data, '0xd09de08a')
    assert.equal(sent[0].from.toLowerCase(), ACCOUNT)
    assert.equal(BigInt(sent[0].value || '0x0'), 0n)
    assert.equal(await wp.getByTestId('count').innerText(), '7')
    assert.equal(await wp.getByRole('link', { name: 'View transaction' }).getAttribute('href'), `https://etherscan.io/tx/${HASH}`)
    await wp.screenshot({ path: resolve(out, 'mock-pending.png'), fullPage: true })
  })
  await check('Confirmation refreshes count from chain', async () => {
    chain.count = 8n; chain.receipt = '0x1'; chain.block = 257
    await wp.getByText('Confirmed. You added one to the counter.').waitFor({ timeout: 20_000 })
    await wp.waitForFunction(() => document.querySelector('[data-testid="count"]').textContent === '8')
    await wp.screenshot({ path: resolve(out, 'mock-confirmed.png'), fullPage: true })
    assert.equal(await wp.locator('.primary-button').isEnabled(), true)
    assert.equal(await wp.evaluate(() => sessionStorage.getItem('counter:pending')), null)
  })
  await check('Reverted receipt is never called confirmed', async () => {
    chain.receipt = '0x0'
    await wp.getByRole('button', { name: 'Increment +1' }).click()
    await wp.getByText('Transaction reverted.', { exact: false }).waitFor({ timeout: 20_000 })
    assert.equal(await wp.getByTestId('count').innerText(), '8')
  })
  await check('uint256 values remain exact and reflow at 320px', async () => {
    chain.count = (1n << 256n) - 1n
    await wp.getByRole('button', { name: 'Refresh', exact: true }).click()
    await wp.waitForFunction(value => document.querySelector('[data-testid="count"]').textContent === value, chain.count.toString())
    assert.equal(await wp.locator('.primary-button').isDisabled(), true)
    colors.disabled = await wp.locator('.primary-button').evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }))
    await wp.setViewportSize({ width: 320, height: 900 })
    assert.equal(await wp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await wp.screenshot({ path: resolve(out, 'mock-max-count.png'), fullPage: true })
    const audit = await new AxeBuilder({ page: wp }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    assert.deepEqual(audit.violations.map(v => v.id), [])
    await wp.setViewportSize({ width: 1440, height: 1000 })
  })
  await check('Account removal disconnects immediately', async () => {
    await wp.evaluate(() => window.changeTestAccount(null))
    await wp.getByRole('button', { name: 'Connect wallet' }).first().waitFor()
  })
  await check('Pending transaction survives reload and can be checked', async () => {
    chain.count = 8n; chain.receipt = null
    await wp.evaluate(({ hash, address }) => sessionStorage.setItem('counter:pending', JSON.stringify({ phase: 'pending', hash, address })), { hash: HASH, address: ADDRESS })
    await wp.reload()
    await wp.getByText('An earlier transaction may still be pending.', { exact: false }).waitFor()
    chain.receipt = '0x1'
    await wp.getByRole('button', { name: 'Check status', exact: true }).click()
    await wp.getByText('Confirmed. You added one to the counter.').waitFor({ timeout: 20_000 })
  })
  await check('RPC outage shows stale count, blocks writes and recovers', async () => {
    chain.unavailable = true
    await wp.getByRole('button', { name: 'Refresh', exact: true }).click()
    await wp.getByRole('button', { name: 'Retry reading count' }).waitFor({ timeout: 30_000 })
    await wp.getByText('Last known count · refresh to update').waitFor()
    chain.unavailable = false
    await wp.getByRole('button', { name: 'Retry reading count' }).click()
    await wp.getByText('Every increment leaves a little mark.').waitFor()
  })
  await check('No uncaught JavaScript or local resource errors', async () => assert.deepEqual(errors, []))
  if (process.env.COUNTER_LIVE_READ === '1') {
    await check('Live mainnet read succeeds in the production browser', async () => {
      const liveContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
      const live = await liveContext.newPage()
      await live.goto(url)
      await live.waitForFunction(() => /^\d+$/.test(document.querySelector('[data-testid="count"]')?.textContent || ''), null, { timeout: 45_000 })
      const count = await live.getByTestId('count').innerText()
      const meta = await live.locator('.read-meta').innerText()
      await live.screenshot({ path: resolve(out, 'live-desktop.png'), fullPage: true })
      await live.setViewportSize({ width: 390, height: 844 })
      await live.screenshot({ path: resolve(out, 'live-mobile.png'), fullPage: true })
      await writeFile(resolve(out, 'live-read.json'), JSON.stringify({ count, meta, checkedAt: new Date().toISOString(), address: ADDRESS }, null, 2) + '\n')
      await liveContext.close()
    })
  }
  await writeFile(resolve(out, 'interaction-results.json'), JSON.stringify({ date: new Date().toISOString(), browser: await browser.version(), export: 'dist/ served under /preview/', chain: 'Mock RPC and EIP-1193 wallet only; no live transaction', results, errors, rpcCalls: calls.length }, null, 2) + '\n')
  await writeFile(resolve(out, 'computed-colors.json'), JSON.stringify(colors, null, 2) + '\n')
  console.log(`${results.length} checks passed. Evidence: ${out}`)
} catch (error) {
  await writeFile(resolve(out, 'interaction-results.json'), JSON.stringify({ results, failed: String(error), errors }, null, 2) + '\n')
  throw error
} finally {
  await browser?.close()
  await new Promise(r => server.close(r))
}
