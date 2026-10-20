# @magnetafinance/contract-risk

Typed client and agent-tool adapters for [Magneta Contract Risk](https://x402.magneta.finance): a deterministic smart-contract risk
report (0-100 score, proxy/owner/mint/blacklist/fee flags, verified source, static analysis) on 20 EVM chains, paid per call
with [x402](https://x402.org) (USDC on Base, $0.02, no ETH needed). Free bytecode-only preview included.

> License: pending (package.json says `UNLICENSED` until one is chosen).

## Install

```bash
npm i @magnetafinance/contract-risk @x402/core@2.28.0 @x402/evm@2.28.0 @x402/fetch@2.28.0 viem@2.57.7
```

## Use

```ts
import { createContractRiskClient } from "@magnetafinance/contract-risk";

const risk = createContractRiskClient({
  privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}`, // wallet with USDC on Base; use a dedicated low-balance key
  maxAmountPerPayment: "$0.05",                                // hard cap per payment (default)
});

const preview = await risk.quickFlags(8453, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // free
const report = await risk.risk(8453, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");        // $0.02
console.log(report.score, report.level, report.flags, report._payment?.transaction);
```

- `risk()` returns the report with an extra `_payment: { transaction, network, payer }` taken from the `PAYMENT-RESPONSE` header.
- Non-2xx throws `ContractRiskError` (`status`, `body`). 400/422/429/502 are never charged.
- `supportedChains()` returns the static 20-chain list (same as the MCP tool `supported_chains`).
- Options: `baseUrl`, `account` (instead of `privateKey`), `fetch` (inject for tests).
- `QuickFlags` is typed loosely (`flags` plus open fields) because the free `/v1/flags` route is newer than the paid report.

## LangChain.js

The package does not depend on langchain; you pass `tool` and `z`.

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { toLangChainTool } from "@magnetafinance/contract-risk";

const riskTool = toLangChainTool(risk, { tool, z }); // DynamicStructuredTool, returns the report as a JSON string
```

## Vercel AI SDK

```ts
import { tool, jsonSchema, generateText } from "ai";
import { toAiSdkTool } from "@magnetafinance/contract-risk";

const tools = { contract_risk_summary: toAiSdkTool(risk, { tool, jsonSchema }) };
```

## OpenAI / Anthropic function calling

`toolDefinition` is `{ name, description, parameters }` (JSON Schema). Map it to `tools[].function` (OpenAI) or
`input_schema` (Anthropic), then run the model's call with `executeToolCall(risk, args)`.

Signatures checked against `@langchain/core` 1.2.19 (`tool(func, { name, description, schema })`) and `ai` 7.0.146
(`tool({ description, inputSchema, execute })`, `jsonSchema`).
