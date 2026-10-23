# X thread — three traps between a working x402 endpoint and a Bazaar listing

Post from the Magneta Finance account. One block = one post. Attach the screenshot of the Bazaar merchant listing to post 1 if you have one.

---

1/
We put a paid API for AI agents live on Base: smart-contract risk reports, $0.02 USDC per call over x402, no account, no API key.

Payments worked on day one. Getting listed in the Coinbase x402 Bazaar took three fixes nobody documents. 🧵

---

2/
Trap 1: path parameters are strings.

Our route is /v1/risk/:chainId/:address. We declared chainId as an integer in the discovery schema. The facilitator answered "invalid discovery configuration".

Express hands path params over as strings. Declare them as type "string".

---

3/
Trap 2: your reverse proxy hides https.

Behind Caddy, Express saw plain http and advertised an http:// URL. Rejected: "resource must start with https://".

Fix: app.set("trust proxy", "loopback") and an explicit public URL for the MCP resource.

---

4/
Trap 3: the MCP tool stayed "processing" forever.

The HTTP route was indexed, the MCP tool never was. It only went through once the discovery declaration carried an example call and transport: "streamable-http".

---

5/
Two smaller ones:
• Metadata is re-read only after a new settled payment. Changing a description means buying from yourself again, from a different wallet: payer = payee is refused.
• A testnet listing is never promoted. Only mainnet gets indexed.

---

6/
Since last week the same endpoint also takes USDC on Solana. One 402 response offers both networks; the agent picks the one it holds, and the facilitator pays the gas on both.

---

7/
Try it free, no wallet needed:

curl https://x402.magneta.finance/v1/flags/8453/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

MCP: https://x402.magneta.finance/mcp
Code (MIT): https://github.com/Bosacks/magneta-risk-x402
