// Picks the facilitator the seller talks to.
//   FACILITATOR_URL=cdp           -> Coinbase CDP facilitator (reads CDP_API_KEY_ID / CDP_API_KEY_SECRET)
//   FACILITATOR_URL=https://...   -> any x402 facilitator over HTTP (e.g. the public x402.org one)
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { need } from "./config.js";

export function makeFacilitatorClient(): HTTPFacilitatorClient {
  const url = need("FACILITATOR_URL");
  if (url === "cdp") {
    need("CDP_API_KEY_ID");
    need("CDP_API_KEY_SECRET");
    console.log("[facilitator] using Coinbase CDP facilitator");
    return createCdpFacilitatorClient();
  }
  console.log(`[facilitator] using ${url}`);
  return new HTTPFacilitatorClient({ url });
}
