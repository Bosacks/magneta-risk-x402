# @magnetafinance/plugin-contract-risk

ElizaOS plugin that lets an agent check a smart contract before it trades, approves or integrates it. It calls
[Magneta Contract Risk](https://x402.magneta.finance) (20 EVM chains) and exposes two actions:

| Action | Cost | What it does |
|---|---|---|
| `CONTRACT_QUICK_FLAGS` | **free** | Bytecode-only red flags (proxy, owner, pause, mint/blacklist/fee selectors, SELFDESTRUCT) and a partial score. Rate limit: 30 requests/minute/IP. |
| `CONTRACT_RISK_REPORT` | **$0.02 USDC per call** (x402, Base) | Full report: 0-100 score, verdict, findings including source verification and static analysis. |

The score is a triage signal, not an audit.

## Install

```bash
npm install @magnetafinance/plugin-contract-risk
```

Add it to your character:

```ts
import { contractRiskPlugin } from "@magnetafinance/plugin-contract-risk";

export const character = {
  name: "Auditor",
  plugins: ["@magnetafinance/plugin-contract-risk"], // or pass contractRiskPlugin in your project's plugins array
  settings: {
    secrets: {
      CONTRACT_RISK_EVM_PRIVATE_KEY: "0x...", // optional, only for the paid action
    },
    CONTRACT_RISK_MAX_USD: "0.05",
  },
};
```

## Settings

| Setting | Required | Default | Purpose |
|---|---|---|---|
| `CONTRACT_RISK_EVM_PRIVATE_KEY` | only for the paid action | none | Hex private key of a wallet holding USDC on Base. No ETH is needed (EIP-3009 signature, the facilitator pays gas). Without it `CONTRACT_RISK_REPORT` is never offered. Use a dedicated wallet funded with a few cents to a few dollars. |
| `CONTRACT_RISK_MAX_USD` | no | `0.05` | Per-call spend cap. If the service asks for more, the action refuses and nothing is signed. The current price is $0.02. |
| `CONTRACT_RISK_BASE_URL` | no | `https://x402.magneta.finance` | Service base URL. |

## Usage

The actions read the message text: a `0x` address (40 hex characters) and, optionally, a chain name or id.
Recognised names: ethereum, base, arbitrum, optimism, polygon, bsc, avalanche (plus eth, arb, matic, bnb, avax),
or `chain 137` / `eip155:42161`. With no chain named, Base (8453) is assumed and the reply says so.
Other supported chain ids (Gnosis, Linea, Scroll, Celo, ...) work through the numeric form.

Examples: "quick check 0x8335... on ethereum" (free), "buy the full risk report for 0x8335... on base" ($0.02).

## Costs and safety

- Free action: no wallet, no payment.
- Paid action: exactly one $0.02 USDC payment per successful report; failed analyses (not a contract, upstream error, timeout) return an error status and are not charged.
- The key never leaves the process except as an EIP-3009 signature. Keep `CONTRACT_RISK_MAX_USD` low.

## Links

- Service and docs: https://x402.magneta.finance
- Source: https://github.com/Bosacks/magneta-risk-x402 (`packages/plugin-elizaos`)
- Client library used by the paid action: [`@magnetafinance/contract-risk`](https://www.npmjs.com/package/@magnetafinance/contract-risk)

## Development

```bash
pnpm install --ignore-scripts
pnpm test && pnpm build
```

Built against `@elizaos/core` 1.7.2. Its published type entry for the `node` condition is broken under `moduleResolution: NodeNext`, so this package compiles with `Bundler` resolution.

MIT
