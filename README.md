# Magneta Contract Risk (x402)

A small production-oriented service that sells an **on-chain smart-contract risk report** to AI agents, paid per call with
[x402](https://x402.org) micropayments (USDC, EIP-3009 `exact` scheme). One express process, two paid surfaces:

| Surface | Route | Price |
|---|---|---|
| HTTP | `GET /v1/risk/:chainId/:address` | **$0.02** |
| MCP (Streamable HTTP, stateless) | `POST /mcp`, tool `contract_risk_summary(chainId, address)` | **$0.02** |
| MCP | tool `supported_chains` | free |
| Health | `GET /health` | free |

Both paid surfaces call the same `analyzeContract(chainId, address)` in `src/risk/analyze.ts`. The analysis is deterministic and
uses public data only (RPC, Blockscout, Sourcify, a local aderyn binary). **No LLM, no API key for analysis.**
Unknown chain or malformed address returns `400` *before* any payment is requested. If the analysis itself fails (not a contract,
upstream error, timeout) the response is an error status and **the buyer is not charged** (x402 only settles successful responses).

Supported chains (v1, `src/chains.ts`): Base 8453, Base Sepolia 84532, Ethereum 1, Arbitrum One 42161. Override RPCs with `RPC_URL_<chainId>`.

## Report

```
{ chainId, address, analyzedAt, isContract, bytecodeSize, proxy, erc20, opcodes, selectors: { found },
  blockscout, sourcify?, aderyn, score, level, flags, notes }
```

- `proxy`: `{ type, implementation, admin? }` from EIP-1967 (implementation/admin/beacon), legacy zeppelinos slot, EIP-1822, EIP-1167 clones, or Blockscout's detection. The implementation bytecode is analysed too.
- `erc20`: name, symbol, decimals, totalSupply, `owner()` (and whether it is the zero address), `paused()`. Each probe is individually try/catch.
- `opcodes`: SELFDESTRUCT / DELEGATECALL presence from a real opcode walk that skips PUSH data (no substring matching).
- `selectors.found`: risky signatures (mint, pause, blacklist, fee/tax setters, upgrade, ownership...) whose 4-byte selector appears as a PUSH4 in the bytecode. **Heuristic**: presence is not proof of reachability (also stated in `notes`).
- `blockscout` / `sourcify`: verification status, compiler, contract name, creator and creation tx. Blockscout has a 5 s timeout; on failure `blockscout: { available: false }`. Sourcify is only queried as a fallback when Blockscout is unreachable or reports "unverified". For proxies, the implementation's verification is what counts.
- `aderyn`: when verified Solidity source is available, sources are written to a temp dir (sanitised paths) and aderyn runs with a 15 s timeout: `{ ran, counts: { high, low }, top: [{ title, severity, instances }] }`, else `{ ran: false, reason }`. It never fails the request.
- Total budget: hard deadline 24 s per analysis. Results are cached in memory for 10 minutes per chainId+address (the payment still happens on every call).

### Score rubric (`src/risk/score.ts`)

Score 0..100, higher = riskier, additive, capped at 100.

| Points | Condition |
|---|---|
| +25 | logic contract source not verified (Blockscout, then Sourcify) |
| +0 (flagged) | verification unknown because every provider was unreachable |
| +15 | proxy / upgradeable |
| +10 | `owner()` exists and is not the zero address |
| +15 | mint selector |
| +15 | blacklist / bot-list selector |
| +10 | fee / tax / limit / trading-switch setters |
| +5 (+5 if currently paused) | pause selector |
| +10 | SELFDESTRUCT opcode |
| +5 each, max +20 | aderyn high-severity findings |

Level: 0-24 `low`, 25-49 `medium`, 50-74 `high`, 75-100 `critical`. A non-contract address is an error, not a score. The score is a triage signal, not an audit.

## Supported chains

Mainnets: Ethereum (1), OP Mainnet (10), BNB Smart Chain (56), Gnosis (100), Unichain (130), Polygon (137), Sonic (146),
World Chain (480), Mantle (5000), Base (8453), Arbitrum One (42161), Celo (42220), Avalanche C-Chain (43114), Linea (59144),
Blast (81457), Scroll (534352). Testnets: Base Sepolia (84532), Sepolia (11155111), OP Sepolia (11155420), Arbitrum Sepolia (421614).
Chains without a Blockscout instance (BNB, Sonic, Mantle, Avalanche) rely on Sourcify for verified sources. zkSync Era is
excluded on purpose: EraVM bytecode defeats the opcode and selector heuristics. Compiler remappings from Blockscout or
Sourcify are written to `remappings.txt` so aderyn can resolve `@openzeppelin/...`-style imports.

## Free tier, agent skill and client package

- **Free preview**: `GET /v1/flags/:chainId/:address` and the MCP tool `contract_quick_flags` return the bytecode-only part of
  the report (proxy, owner/pause state, risky selectors, opcodes, partial score) with no payment. Rate-limited to 30
  requests per minute per IP. Source verification and aderyn findings are only in the paid report.
- **Agent skill**: `npx skills add Bosacks/magneta-risk-x402 --skill magneta-contract-risk` installs
  [skills/magneta-contract-risk/SKILL.md](skills/magneta-contract-risk/SKILL.md), which teaches an agent when and how to
  buy a report over HTTP, MCP or a Coinbase Agentic Wallet. [![skills.sh](https://skills.sh/b/Bosacks/magneta-risk-x402)](https://skills.sh/Bosacks/magneta-risk-x402)
- **Client package**: [`packages/contract-risk-client`](packages/contract-risk-client) (`@magneta-finance/contract-risk`)
  wraps the x402 payment flow in a typed client and ships tool adapters for LangChain.js, the Vercel AI SDK and
  OpenAI/Anthropic function calling.

## Run

```bash
pnpm install --ignore-scripts
cp .env.example .env.local      # fill PAY_TO, X402_NETWORK, FACILITATOR_URL (+ CDP keys if cdp)
pnpm dev                        # tsx, or: pnpm build && pnpm start
pnpm type-check && pnpm test    # unit tests, no network
pnpm analyze 84532 0x036CbD53842c5426634e7929541eC2318f3dCF7e   # free local run, prints the report
```

Buying (needs a funded buyer key, spend cap $0.05; never put this key on the server):

```bash
BUYER_PRIVATE_KEY=0x... pnpm buy-once        # HTTP; prints the report and the PAYMENT-RESPONSE tx hash
BUYER_PRIVATE_KEY=0x... pnpm buy-once-mcp    # same through the MCP tool
```

## Environment

- `PUBLIC_URL` (https, no trailing slash): advertised as the MCP resource URL for Bazaar discovery. Behind a reverse proxy the
  server trusts the loopback proxy (`trust proxy = loopback`) so HTTP resource URLs are advertised as `https://`; without
  that, the facilitator rejects discovery with "resource must start with https://".


| Var | Meaning |
|---|---|
| `PORT` | listening port (default 3011) |
| `PAY_TO` | receiving address (required) |
| `X402_NETWORK` | CAIP-2 network, default `eip155:84532` (Base Sepolia); production: `eip155:8453` |
| `FACILITATOR_URL` | `cdp` (Coinbase CDP facilitator, needs `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`) or an HTTP facilitator URL such as `https://x402.org/facilitator` (testnet) |
| `ADERYN_BIN` | aderyn 0.6.8 binary, default `/home/dominique/bin/aderyn` |
| `RPC_URL_<chainId>` | optional RPC override per chain |
| `BUYER_PRIVATE_KEY`, `TARGET_URL`, `MCP_URL`, `CHAIN_ID`, `ADDRESS` | buyer scripts only |

## Deploy (systemd + Caddy)

```bash
pnpm install --ignore-scripts && pnpm build
rsync -a --exclude node_modules ./ server:/srv/magneta/risk-x402/    # then pnpm install --prod --ignore-scripts there
sudo cp deploy/magneta-risk-x402.service /etc/systemd/system/ && sudo systemctl enable --now magneta-risk-x402
# add deploy/Caddyfile.snippet to the Caddyfile (vhost x402.magneta.finance -> 127.0.0.1:3011), reload Caddy
```

The unit reads `/srv/magneta/risk-x402/.env.local`. For mainnet set `X402_NETWORK=eip155:8453` and `FACILITATOR_URL=cdp`.
Aderyn needs its solc download/cache available to the service user (HOME writable).

## Bazaar discovery

Both paid surfaces declare x402 Bazaar discovery metadata with `declareDiscoveryExtension` from `@x402/extensions/bazaar`
(HTTP route with path-parameter schema and output example; MCP tool with input schema), and the `bazaarResourceServerExtension`
is registered on the resource server. The metadata appears in the `PAYMENT-REQUIRED` header (`extensions.bazaar`). Actual
cataloguing depends on the facilitator: it indexes resources when it settles a payment, so the listing appears only after the
first real paid call through a Bazaar-enabled facilitator (CDP). The public x402.org testnet facilitator is not expected to list it.

## Production status (2026-10-16)

Live at https://x402.magneta.finance on Base mainnet (`eip155:8453`), Coinbase CDP facilitator, $0.02 per call, listed in the
x402 Bazaar (route `/v1/risk/:chainId/:address`). Buyers need USDC on Base and no ETH. The facilitator rejects payments where
the payer equals `payTo` (`self_send_not_allowed`).

## License

MIT, Copyright (c) 2026 Magneta Finance. See [LICENSE](LICENSE).
