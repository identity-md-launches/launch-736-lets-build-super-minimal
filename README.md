# Counter / you know.

A minimal ASCII interface for the IdentityMD Counter on **Ethereum mainnet (chain 1)**. It reads the shared count without a wallet, connects browser wallets, switches to mainnet, and asks the wallet to submit `increment()` with zero ETH value. Ethereum network fees still apply.

The production website is in **`dist/`**. React, TypeScript, Vite, wagmi and viem source and the npm lockfile are in **`web/`**. All visual assets are local; there is no backend, analytics, API key, external font, token approval, or WalletConnect service.

## Verified deployment

- Counter: [`0x7c4dd52baa8352ba2d673739da456698e715451b`](https://etherscan.io/address/0x7c4dd52baa8352ba2d673739da456698e715451b)
- [IdentityMD deployment job](https://explorer.imd.fun/jobs/b2246df4-9856-41c0-b573-e6f0b67f5897#deployed)
- [Deployment transaction](https://etherscan.io/tx/0x51246a8812ba4876859a43367e6e5992e436cef87c46ed3c1c5c10715a84109a), block **26,129,110**
- [Pinned Counter source](https://github.com/identity-md-launches/launch-734-counter-minimal-counter-contract/blob/9665e84d83282eaf0d121587d784bae233c6a177/src/Counter.sol), commit `9665e84d83282eaf0d121587d784bae233c6a177`

The 209-byte runtime was reproduced with solc 0.8.26, Cancun, optimizer enabled at 200 runs, and `bytecode_hash = "none"`. The public mainnet runtime matches it byte for byte. `artifacts/deployment-check.json` contains the exact observations and pinned block. `web/src/deployment.json` pins the address and provenance; `web/src/counter-artifact.json` contains the compiled ABI and runtime. The application also checks chain ID and code before reading and again before submitting.

## Install, preview and rebuild

Use Node 22 and npm 10 or compatible versions. From the repository root:

```sh
npm ci --prefix web
npm run typecheck --prefix web
npm run build --prefix web
npm run preview --prefix web
```

Open the localhost URL Vite prints. `npm run dev --prefix web` starts the development server. To preview the export without installing dependencies:

```sh
python3 -m http.server 4173 --directory dist
```

The production build writes to repo-root `dist/`, clears obsolete build assets, and uses `base: './'`. Builds require no network once dependencies have been installed. `npm ci --offline` also works when the exact lockfile dependencies are already in the npm cache; no registry mirror is delivered.

During this assignment, installation and builds ran in an isolated `/tmp/imd-counter-build` copy. This kept every `node_modules` and cache directory outside the submitted repository. The final export was copied back byte for byte. No ignore file was changed. If installing locally, exclude generated dependency directories from your submission and publish only `dist/`.

## Publish

Upload **the contents of `dist/`**, including `assets/` and `favicon.svg`, to any HTTPS static host or an IPFS directory. Keep their relative paths intact. The publisher should serve this finished export without rebuilding. Root hosting and gateway subpaths work; navigation uses the `#main` fragment and needs no server-side route rewrites. A local `file://` opening is not a supported wallet preview.

Source, lockfile, documentation, evidence and the static export are all delivered together. The network worker can include those files in its submission commit; this task does not modify `.git/`, `.github/`, `.env` files, or repository dependency directories.

## Wallet and transaction behavior

Use an installed EIP-1193 browser wallet, an EIP-6963-discovered extension, or the injected browser inside a mobile wallet. The selector handles multiple discovered wallets. A browser without one receives setup guidance. Connecting shares an account; it does not send a transaction. Remote QR/WalletConnect pairing is deliberately absent because this site has no service credentials.

The primary button connects, switches network, or increments according to the current state. The app simulates an increment before asking for approval, rechecks the connected account and mainnet, prevents duplicate submissions, links the transaction to Etherscan, and waits for one confirmation. It reads the resulting count from chain rather than adding one locally. Refresh runs every 15 seconds while the page is active and can also be requested manually.

Rejection, simulation failure, reverted receipts, delayed confirmation, RPC failures and the uint256 maximum have visible recovery states. A pending hash is retained in this tab's session storage across reloads. An uncertain transaction blocks another increment until its status is checked. Wallet speed-ups and replacements are handled by viem; cancelled/replaced actions are not described as successful increments. Public RPC services can be unavailable or rate limited. Storage-disabled browsers retain status in memory only.

## Validation

Actual final validation on 2026-10-05:

- Lockfile install: `npm ci --offline --no-audit --no-fund` passed in the isolated build copy; transitive package deprecation/peer warnings are recorded in `artifacts/install.log`.
- TypeScript: `npm run typecheck` passed, exit 0; see `artifacts/typecheck.log`.
- Production: `npm run build` passed, exit 0; see `artifacts/build.log`. Vite reports one non-fatal chunk-size warning for the approximately 550 KB main JS bundle (about 170 KB gzip).
- All **28 Chromium checks** passed, including interactions, automated accessibility scans, subpath assets, responsive reflow, and a live mainnet read; exact results are in `artifacts/interaction-results.json`.
- Browser screenshots were inspected at desktop and mobile sizes. The six-domain design review, fixes, measurements and limits are recorded in [`artifacts/validation.md`](artifacts/validation.md). Implemented design rules are in [`DESIGN.md`](DESIGN.md).

Reproduce interaction checks after building:

```sh
cd web
npx playwright install chromium
npm run test:interaction
```

The test script serves the **production export** under `/preview/`, launches Chromium and closes both in one bounded process. Wallets and RPC responses in the interaction suite are simulated. No test signs or broadcasts a mainnet transaction. Set `COUNTER_LIVE_READ=1` for an additional read-only live browser check:

```sh
COUNTER_LIVE_READ=1 npm run test:interaction
```

Set `PLAYWRIGHT_BROWSERS_PATH` if using a custom browser cache and `COUNTER_EVIDENCE_DIR` to choose the evidence directory. Screenshots named `mock-*`, `desktop.png`, `viewport-*`, and accessibility captures use synthetic chain data; `live-*` screenshots and `live-read.json` use the real public mainnet response. Native screen-reader sessions, browser-native zoom, physical mobile wallets and funded mainnet writes were not tested. The site has not been published by this task.

Run `node web/tests/contrast.mjs` from the repository root after the browser suite to recompute contrast from the sampled rendered colors. All 10 sampled pairs passed their thresholds. The export is **564,431 bytes**; the complete source, documentation and evidence total approximately **2.0 MB uncompressed**, comfortably below the 8 MiB submission limit. `artifacts/export-check.json` records sizes, relative-asset validation and export hashes. No Git bundle was generated locally because `.git/` is outside the assignment's write scope.

## Reproduce the mainnet evidence

These public, read-only JSON-RPC requests reproduce the pinned observation. They contain no credentials:

```sh
curl -sS https://ethereum-rpc.publicnode.com -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
curl -sS https://ethereum-rpc.publicnode.com -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":2,"method":"eth_getCode","params":["0x7c4dd52baa8352ba2d673739da456698e715451b","0x18eb2e8"]}'
curl -sS https://ethereum-rpc.publicnode.com -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":3,"method":"eth_call","params":[{"to":"0x7c4dd52baa8352ba2d673739da456698e715451b","data":"0x06661abd"},"0x18eb2e8"]}'
```

Expected chain ID: `0x1`; expected count at block 26,129,128: `0`. Compare the returned runtime to `web/src/counter-artifact.json`. Live values can change.

## Credits

Design review follows Jakub Krehel's [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Design documentation follows Paul Bakaus's [Impeccable documentation method](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md), Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Included notices and license texts are in `docs/design-guidance-LICENSE.txt`. Integration references: [wagmi wallet connection](https://wagmi.sh/react/guides/connect-wallet) and [viem receipt handling](https://viem.sh/docs/actions/public/waitForTransactionReceipt).
