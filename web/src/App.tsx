import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { getAccount, getWalletClient } from 'wagmi/actions'
import { mainnet } from 'wagmi/chains'
import { type Address, type Hash } from 'viem'
import { abi, client, config, friendlyError, MAX_COUNT, parseAddress, readCounter, shortAddress, verifyContract } from './chain'
import { WalletDialog } from './WalletDialog'
import deployment from './deployment.json'

type Tx = { phase: 'idle' | 'preparing' | 'signing' | 'pending' | 'confirmed' | 'reverted' | 'unknown' | 'replaced'; hash?: Hash; address?: Address; message: string }
const initialTx: Tx = { phase: 'idle', message: '' }
const wordmark = [
  '  ____ ___  _   _ _   _ _____ _____ ____  ',
  ' / ___/ _ \\| | | | \\ | |_   _| ____|  _ \\ ',
  '| |  | | | | | | |  \\| | | | |  _| | |_) |',
  '| |__| |_| | |_| | |\\  | | | | |___|  _ < ',
  ' \\____\\___/ \\___/|_| \\_| |_| |_____|_| \\_\\',
].join('\n')

function restoreTx(): Tx {
  try {
    const saved = JSON.parse(sessionStorage.getItem('counter:pending') || 'null') as Tx | null
    if (saved?.hash && /^0x[0-9a-f]{64}$/i.test(saved.hash) && saved.address && saved.address.toLowerCase() === deployment.address.toLowerCase()) {
      return { phase: 'unknown', hash: saved.hash, address: parseAddress(saved.address), message: 'An earlier transaction may still be pending. Check its status before sending another.' }
    }
  } catch { /* Storage may be unavailable in private browsing. */ }
  return initialTx
}

export function App() {
  const account = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const [walletOpen, setWalletOpen] = useState(false)
  const address = parseAddress(deployment.address)
  const [actionError, setActionError] = useState('')
  const [copied, setCopied] = useState('')
  const [tx, setTx] = useState<Tx>(restoreTx)
  const locked = useRef(false)
  const query = useQuery({
    queryKey: ['counter', address],
    queryFn: () => readCounter(address),
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
  const busy = ['preparing', 'signing', 'pending', 'unknown'].includes(tx.phase)
  const wrongChain = account.isConnected && account.chainId !== 1
  const maxed = query.data?.count === MAX_COUNT

  useEffect(() => {
    try {
      if (tx.hash && ['pending', 'unknown'].includes(tx.phase)) sessionStorage.setItem('counter:pending', JSON.stringify(tx))
      else if (!['preparing', 'signing'].includes(tx.phase)) sessionStorage.removeItem('counter:pending')
    } catch { /* In-memory transaction tracking still works. */ }
  }, [tx])

  async function track(hash: Hash, target: Address) {
    setTx({ phase: 'pending', hash, address: target, message: 'Transaction sent. Waiting for an Ethereum confirmation…' })
    let changedAction = false
    let latestHash = hash
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash, confirmations: 1, timeout: 180_000, pollingInterval: 4_000,
        onReplaced: ({ reason, transactionReceipt }) => {
          latestHash = transactionReceipt.transactionHash
          changedAction = reason !== 'repriced'
          setTx(current => ({ ...current, hash: latestHash }))
        },
      })
      if (changedAction) setTx({ phase: 'replaced', hash: latestHash, address: target, message: 'Transaction replaced or cancelled in your wallet. Check the transaction before trying again.' })
      else if (receipt.status === 'reverted') setTx({ phase: 'reverted', hash: receipt.transactionHash, address: target, message: 'Transaction reverted. No increment was recorded; a network fee may still apply.' })
      else setTx({ phase: 'confirmed', hash: receipt.transactionHash, address: target, message: 'Confirmed. You added one to the counter.' })
      await query.refetch()
    } catch {
      setTx({ phase: 'unknown', hash: latestHash, address: target, message: 'Confirmation is taking longer than expected. Your transaction may still go through. Check its status before sending another.' })
    }
  }

  async function increment() {
    if (locked.current || busy || !account.address || wrongChain || !query.data || query.isError || maxed) return
    locked.current = true
    setActionError('')
    const target = address
    const caller = account.address
    try {
      setTx({ phase: 'preparing', message: 'Checking the contract and preparing your increment…' })
      await verifyContract(target)
      const wallet = await getWalletClient(config, { chainId: 1 })
      const { request } = await client.simulateContract({ address: target, abi, functionName: 'increment', account: caller })
      const current = getAccount(config)
      if (current.address !== caller || current.chainId !== 1) throw new Error('Wallet chain or account mismatch')
      setTx({ phase: 'signing', message: 'Approve the increment and network fee in your wallet.' })
      const hash = await wallet.writeContract({ ...request, chain: mainnet, account: caller })
      await track(hash, target)
    } catch (e) { setTx(initialTx); setActionError(friendlyError(e)) }
    finally { locked.current = false }
  }

  const primaryLabel = !account.isConnected ? 'Connect wallet' : wrongChain ? (switching ? 'Switching network…' : 'Switch to Ethereum') : tx.phase === 'preparing' ? 'Preparing increment…' : tx.phase === 'signing' ? 'Approve in wallet…' : tx.phase === 'pending' ? 'Increment pending…' : tx.phase === 'unknown' ? 'Check transaction below' : 'Increment +1'
  const disabled = !account.isConnected ? false : wrongChain ? switching || busy : busy || !query.data || query.isError || maxed

  return <div className="site-shell">
    <a className="skip-link" href="#main">Skip to counter</a>
    <header className="site-header">
      <a className="brand" href="#main" aria-label="Counter home"><span className="brand-mark" aria-hidden="true">[ + ]</span><span>counter<span className="muted">.sol</span></span></a>
      <div className="header-actions"><span className="network"><span aria-hidden="true">◇</span> Ethereum <span className="network-suffix">mainnet</span></span>
        <button className="outline-button connect-header" aria-label={account.isConnected ? `${shortAddress(account.address!)}: change wallet` : undefined} onClick={() => setWalletOpen(true)}>{account.isConnected ? shortAddress(account.address!) : 'Connect wallet'}<span aria-hidden="true"> ↗</span></button>
        {account.isConnected && <button className="text-button disconnect" disabled={tx.phase === 'signing'} onClick={() => { disconnect(); setActionError('') }}>Disconnect</button>}
      </div>
    </header>

    <main id="main" tabIndex={-1}>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow"><span className="accent">//</span> A very small onchain experiment</p>
        <pre className="ascii-title" aria-hidden="true">{wordmark}</pre>
        <h1 id="page-title">you know<span className="accent">.</span></h1>
        <p className="intro-copy">One shared counter. Anyone can add one.</p>
      </section>

      <section className="terminal" aria-labelledby="counter-heading">
        <div className="terminal-bar"><h2 id="counter-heading"><span aria-hidden="true">&gt;_ </span>counter / mainnet</h2><span className="small muted">uint256</span></div>
        <div className="counter-body">
          <div className="counter-meta"><span className="eyebrow">Current count</span><span className={`state-label ${query.isError ? 'error' : ''}`}><span aria-hidden="true">{query.isError ? '!' : '·'}</span> {query.isError ? 'Read unavailable' : !query.data ? 'Reading chain…' : 'Onchain'}</span></div>
          <output className={`count ${query.data && query.data.count.toString().length > 12 ? 'count-long' : ''}`} aria-label={`Current count: ${query.data ? query.data.count.toString() : 'unavailable'}`} data-testid="count">{query.data ? query.data.count.toString() : '--'}</output>
          <p className="count-caption">{query.isError && query.data ? 'Last known count · refresh to update' : 'Every increment leaves a little mark.'}</p>
          <button className="primary-button" disabled={disabled} onClick={async () => {
            if (!account.isConnected) setWalletOpen(true)
            else if (wrongChain) { setActionError(''); try { await switchChainAsync({ chainId: 1 }) } catch (e) { setActionError(friendlyError(e)) } }
            else await increment()
          }}><span aria-hidden="true">[ + ]</span><span>{primaryLabel}</span><span aria-hidden="true">→</span></button>
          <p className="fee-note">+1 to the count. You only pay the Ethereum network fee.</p>
          <div className="status-region" role="status">{tx.message}</div>
          <div role="alert" className="error action-error">{actionError}{maxed ? 'The counter has reached the uint256 limit and cannot be incremented.' : ''}</div>
          {tx.hash && <div className="transaction-line"><a href={`https://etherscan.io/tx/${tx.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>{tx.phase === 'unknown' && <button className="text-button" onClick={() => track(tx.hash!, tx.address!)}>Check status</button>}</div>}
          {query.isError && <div className="notice error"><p>{friendlyError(query.error)}</p><button className="outline-button" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? 'Refreshing…' : 'Retry reading count'}</button></div>}
        </div>
        <div className="terminal-footer"><span><span aria-hidden="true">↳ </span>{query.isError ? 'Contract read unavailable' : query.data ? 'Code matches source' : 'Checking contract…'}</span><a href={`https://etherscan.io/address/${address}`} target="_blank" rel="noreferrer">View contract ↗</a></div>
      </section>

      <div className="contract-line">
        <span className="eyebrow">Contract</span>
        <a className="address-link" href={`https://etherscan.io/address/${address}`} target="_blank" rel="noreferrer"><bdi>{address}</bdi> ↗</a><button className="text-button" aria-label="Copy contract address" onClick={async () => {
          try { await navigator.clipboard.writeText(address); setCopied('Address copied.') } catch { setCopied('Copy unavailable. Select the full address above to copy it.') }
        }}>[ copy ]</button>
      </div>
      <div role="status" className="small muted copy-status">{copied}</div>
      {query.data && <div className="read-meta"><span>Read at block {query.data.block.toLocaleString('en-US')} · {new Date(query.data.updatedAt).toLocaleTimeString('en-US', { hour12: false })}</span><button className="text-button" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? 'Refreshing…' : 'Refresh'}</button></div>}
      {account.address && <p className="account-line small muted">Wallet <bdi>{account.address}</bdi>{wrongChain && <span className="warning"> · Switch to Ethereum mainnet to increment.</span>}</p>}

      <div className="principles"><span>No owner.</span><span>No reset.</span><span>Just <span className="accent">+1.</span></span></div>
      <p className="closing-ascii" aria-hidden="true">+--------------------[ ∞ ]--------------------+</p>
    </main>
    <footer className="site-footer"><span>Built on <a href="https://imd.fun" target="_blank" rel="noreferrer">IdentityMD ↗</a></span><nav aria-label="Project links"><a href={deployment.source} target="_blank" rel="noreferrer">Source ↗</a><a href={deployment.job} target="_blank" rel="noreferrer">Deployment ↗</a></nav><span className="footer-note">Small contract. Shared state.</span></footer>
    <WalletDialog open={walletOpen} onClose={() => setWalletOpen(false)} />
  </div>
}
