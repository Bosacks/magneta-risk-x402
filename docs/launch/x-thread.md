# X thread — four traps between a working x402 endpoint and a Bazaar listing

Post from the Magneta Finance account. One block = one post. Images are in `images/` (1600x900 PNG, sources in `images/src/`).

---

1/
We put a paid API for AI agents live on Base: smart-contract risk reports, $0.01 USDC per call over x402, no account, no API key.

Payments worked on day one. Getting listed in the Coinbase x402 Bazaar took fixes nobody documents. 🧵

Image: images/01-hero.png
Alt: Magneta logo, a glowing gradient letter M on a dark background, next to the title "Magneta Contract Risk". Tagline: smart-contract risk reports AI agents pay for per call. Details line: $0.01, x402, USDC on Base and Solana, 20 EVM chains. Domain: x402.magneta.finance.

---

2/
Trap 1: path parameters are strings.

Our route is /v1/risk/:chainId/:address. We declared chainId as an integer in the discovery schema. The facilitator answered "invalid discovery configuration".

Express hands path params over as strings. Declare them as type "string".

Image: images/02-bazaar-traps.png
Alt: Four numbered cards on a dark background, each a Bazaar listing problem and its fix. 1: path params, error "invalid discovery configuration", declare type "string". 2: proxy hides https, error "resource must start with https://", use trust proxy and an explicit public URL. 3: MCP tool stuck "processing", add an example call and transport "streamable-http". 4: indexed but never found by search, add serviceName, tags and iconUrl to the 402 resource.

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
Trap 4: indexed, but found by no search.

The listing showed up in the Bazaar yet no query returned it. It only surfaced once the 402 "resource" object carried serviceName, tags and iconUrl. Then it ranked 1st for "contract risk score", 2nd for "smart contract risk".

---

6/
Two smaller ones:
• Metadata is re-read only after a new settled payment. Changing a description means buying from yourself again, from a different wallet: payer = payee is refused.
• A testnet listing is never promoted. Only mainnet gets indexed.

---

7/
Since last week the same endpoint also takes USDC on Solana. One 402 response offers both networks; the agent picks the one it holds, and the facilitator pays the gas on both.

---

8/
Try it free, no wallet needed:

curl https://x402.magneta.finance/v1/flags/8453/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

MCP: https://x402.magneta.finance/mcp
Code (MIT): https://github.com/Bosacks/magneta-risk-x402

Image: images/03-try-it.png
Alt: Terminal window showing the curl command GET https://x402.magneta.finance/v1/flags/8453/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 and its JSON response for USDC on Base: erc20 symbol USDC, owner not renounced, not paused, zeppelinos proxy, selectors found including mint, pause, blacklist and upgradeTo, partialScore 60, partialLevel high, and flags upgradeable-proxy, owner-not-renounced, mint-function, blacklist-function, pausable. Caption: free preview, no wallet; full report $0.01 over x402.
