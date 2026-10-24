# Show HN

**Where:** https://news.ycombinator.com/submit

**Title** (field "title"):

Show HN: Smart-contract risk reports that AI agents buy per call over x402

**URL** (field "url"):

https://github.com/Bosacks/magneta-risk-x402

Leave the "text" field empty: with a URL, HN ignores it. Post the text below as the first comment right after submitting.

---

## First comment

Hi HN. This is a small HTTP + MCP service that answers one question an agent should ask before it approves or swaps a token: what can the owner of this contract still do?

It reads the contract on-chain (20 EVM chains) and returns a 0-100 score with the evidence: proxy pattern and implementation, owner and whether ownership was renounced, pause/mint/blacklist/fee selectors in the bytecode, SELFDESTRUCT and DELEGATECALL, verified source from Blockscout or Sourcify, and static analysis with Aderyn when source exists. It is deterministic: no LLM in the loop, same input, same report. The scoring rubric is public, as a free endpoint and an MCP tool.

Payment is x402: the server answers 402 with a price, the agent signs a USDC authorization, the request is replayed with the signature, and Coinbase's facilitator settles it on-chain and pays the gas. $0.01 per report, on Base or Solana, no account and no API key. A bytecode-only preview is free (30 requests/min per IP).

Try it without a wallet:

    curl https://x402.magneta.finance/v1/flags/8453/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

The paid route shows the 402 handshake:

    curl -i https://x402.magneta.finance/v1/risk/8453/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

The part that took longest was not payments but discovery. Getting listed in the Coinbase x402 Bazaar needed four fixes: path params must be declared as strings, the advertised URL must be https even behind a reverse proxy, and the MCP declaration needs an example call and its transport or it stays "processing" forever. And even once indexed, the listing was returned by no search until the 402 resource carried serviceName, tags and iconUrl.

There is also a typed client on npm (@magnetafinance/contract-risk) with LangChain.js and Vercel AI SDK adapters. Code is MIT. Happy to answer questions about x402 in production.
