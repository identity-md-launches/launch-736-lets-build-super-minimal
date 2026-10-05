import { createConfig, http, injected } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { createPublicClient, fallback, getAddress, isAddress, parseAbi, type Address } from 'viem'
import artifact from './counter-artifact.json'

export const abi = parseAbi([
  'function count() view returns (uint256)',
  'function increment()',
  'event Incremented(address indexed caller, uint256 newCount)',
])
export const transport = fallback([
  http('https://ethereum-rpc.publicnode.com', { timeout: 8_000, retryCount: 0 }),
  http('https://eth.drpc.org', { timeout: 8_000, retryCount: 0 }),
])
export const config = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: { [mainnet.id]: transport },
  multiInjectedProviderDiscovery: true,
})
export const client = createPublicClient({ chain: mainnet, transport })
export const MAX_COUNT = (1n << 256n) - 1n

export function parseAddress(value: string): Address {
  if (!isAddress(value.trim())) throw new Error('Enter a valid Ethereum address (0x followed by 40 hexadecimal characters).')
  return getAddress(value.trim())
}

export async function verifyContract(address: Address) {
  if (await client.getChainId() !== 1) throw new Error('The read service returned the wrong network. Try again.')
  const code = await client.getCode({ address })
  if (!code || code === '0x') throw new Error('No contract exists at this address on Ethereum mainnet. Check the deployment address.')
  if (code.toLowerCase() !== artifact.runtime.toLowerCase()) {
    throw new Error('This contract does not match the Counter source from the job. Check the deployment address.')
  }
}

export async function readCounter(address: Address) {
  await verifyContract(address)
  const block = await client.getBlockNumber({ cacheTime: 0 })
  const count = await client.readContract({ address, abi, functionName: 'count', blockNumber: block })
  return { count, block, updatedAt: Date.now() }
}

export function friendlyError(error: unknown): string {
  let e: unknown = error
  for (let depth = 0; depth < 8 && e && typeof e === 'object'; depth++) {
    const item = e as { code?: number; name?: string; cause?: unknown }
    if (item.code === 4001 || item.name === 'UserRejectedRequestError') return 'Request declined in your wallet. You can try again when ready.'
    if (item.code === -32002) return 'A request is already open. Check your wallet to continue.'
    e = item.cause
  }
  const message = error instanceof Error ? error.message : ''
  if (/insufficient funds/i.test(message)) return 'Not enough ETH for the network fee. Add ETH to your wallet, then try again.'
  if (/chain.*mismatch|chain.*does not match/i.test(message)) return 'Switch your wallet to Ethereum mainnet, then try again.'
  if (/no contract|does not match the Counter|Enter a valid|wrong network/i.test(message)) return message
  if (/revert|execution failed/i.test(message)) return 'The contract rejected this increment. Refresh the count before trying again.'
  return 'Could not reach Ethereum or your wallet. Check your connection and try again.'
}

export function shortAddress(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}` }

