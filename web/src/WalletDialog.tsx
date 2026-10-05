import { useEffect, useRef, useState } from 'react'
import { useConnect } from 'wagmi'
import { friendlyError } from './chain'

export function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { connectors, connectAsync, isPending } = useConnect()
  const [available, setAvailable] = useState<string[]>([])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all(connectors.map(async connector => ({ uid: connector.uid, provider: await connector.getProvider().catch(() => undefined) })))
      .then(results => { if (active) { setAvailable(results.filter(r => r.provider).map(r => r.uid)); setChecking(false) } })
    return () => { active = false }
  }, [connectors, open])
  useEffect(() => {
    if (open) { setError(''); dialog.current?.showModal() }
    else dialog.current?.close()
  }, [open])

  const options = connectors.filter(c => available.includes(c.uid))
    .filter(c => c.id !== 'injected' || available.length === 1)

  return <dialog ref={dialog} aria-labelledby="wallet-title" onCancel={onClose} onClose={onClose}>
    <div className="dialog-top"><span className="eyebrow">[ wallet ]</span><button className="text-button" onClick={onClose} aria-label="Close wallet selection">[ x ]</button></div>
    <h2 id="wallet-title">Connect wallet</h2>
    <p>Choose a wallet to add one to the counter.</p>
    <div className="wallet-options">
      {options.map(connector => <button className="outline-button wallet-option" key={connector.uid} disabled={isPending} onClick={async () => {
        setError('')
        try { await connectAsync({ connector }); onClose() } catch (e) { setError(friendlyError(e)) }
      }}><span>{connector.name}</span><span aria-hidden="true">→</span></button>)}
    </div>
    {checking && <p>Looking for browser wallets…</p>}
    {!checking && options.length === 0 && <div className="notice"><strong>No browser wallet found.</strong><p>Open this page in your wallet’s browser, or enable a wallet extension and reload.</p><a href="https://ethereum.org/wallets/find-wallet/" target="_blank" rel="noreferrer">Find an Ethereum wallet ↗</a></div>}
    <p className="small muted">Connecting only shares your address. Each increment requires a separate approval in your wallet.</p>
    <div role="status" className="small">{isPending ? 'Confirm the connection in your wallet…' : ''}</div>
    <div role="alert" className="error">{error}</div>
  </dialog>
}
