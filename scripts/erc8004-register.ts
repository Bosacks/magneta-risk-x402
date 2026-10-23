// Prepares the ERC-8004 registration on Base mainnet. Sends nothing, reads no key.
//   tsx scripts/erc8004-register.ts                 prints registry, call, calldata and a cast command
//   tsx scripts/erc8004-register.ts --check <txHash> reads the receipt and prints the minted agentId
import { createPublicClient, decodeEventLog, encodeFunctionData, http, parseAbi, parseAbiItem } from "viem";
import { base } from "viem/chains";

export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const; // verified on Base mainnet (proxy, name "AgentIdentity")
export const AGENT_URI = "https://x402.magneta.finance/.well-known/agent-registration.json";
export const REGISTRY_ABI = parseAbi(["function register(string agentURI) returns (uint256 agentId)"]);
const registeredEvent = parseAbiItem("event Registered(uint256 indexed agentId, string agentURI, address indexed owner)");
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

export const registerCalldata = (uri: string = AGENT_URI) => encodeFunctionData({ abi: REGISTRY_ABI, functionName: "register", args: [uri] });

async function main() {
  const client = createPublicClient({ chain: base, transport: http(RPC) });
  const checkIdx = process.argv.indexOf("--check");
  if (checkIdx !== -1) {
    const hash = process.argv[checkIdx + 1] as `0x${string}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash ?? "")) throw new Error("usage: --check <txHash>");
    const receipt = await client.getTransactionReceipt({ hash });
    console.log(`status: ${receipt.status}, block ${receipt.blockNumber}`);
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue;
      for (const abi of [[registeredEvent], [transferEvent]]) {
        try {
          const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
          const a = ev.args as Record<string, unknown>;
          if (ev.eventName === "Registered") console.log(`Registered: agentId=${a.agentId} owner=${a.owner} agentURI=${a.agentURI}`);
          else console.log(`Transfer: from=${a.from} to=${a.to} tokenId(agentId)=${a.tokenId}`);
        } catch { /* not this event */ }
      }
    }
    return;
  }
  const code = await client.getCode({ address: IDENTITY_REGISTRY });
  const name = await client.readContract({ address: IDENTITY_REGISTRY, abi: parseAbi(["function name() view returns (string)"]), functionName: "name" });
  console.log(`IdentityRegistry (Base mainnet, chain 8453): ${IDENTITY_REGISTRY}`);
  console.log(`  on-chain check: code ${code && code !== "0x" ? "present" : "MISSING"}, name()="${name}"`);
  console.log(`Function: register(string agentURI) returns (uint256 agentId)`);
  console.log(`agentURI: ${AGENT_URI}`);
  const data = registerCalldata();
  console.log(`Calldata: ${data}`);
  console.log(`\nSend from the owner wallet (the sender becomes the agent owner):`);
  console.log(`cast send ${IDENTITY_REGISTRY} "register(string)" "${AGENT_URI}" --rpc-url ${RPC} --private-key $OWNER_KEY`);
  console.log(`\nThen: tsx scripts/erc8004-register.ts --check <txHash>`);
  console.log(`agentRegistry for the registrations entry: eip155:8453:${IDENTITY_REGISTRY}`);
}

if (process.argv[1]?.endsWith("erc8004-register.ts")) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
