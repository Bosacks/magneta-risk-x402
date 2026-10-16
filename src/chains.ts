// Supported chains. RPC URLs can be overridden with RPC_URL_<chainId>. `blockscout` is optional: chains without a
// Blockscout instance rely on Sourcify for verified sources. EVM only (no zkSync Era: EraVM bytecode breaks the opcode
// and selector heuristics).
export interface ChainInfo {
  id: number;
  name: string;
  rpc: string;
  blockscout?: string;
  testnet?: boolean;
}

export const CHAINS: Record<number, ChainInfo> = {
  // Mainnets
  1: { id: 1, name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", blockscout: "https://eth.blockscout.com" },
  10: { id: 10, name: "OP Mainnet", rpc: "https://mainnet.optimism.io", blockscout: "https://optimism.blockscout.com" },
  56: { id: 56, name: "BNB Smart Chain", rpc: "https://bsc-dataseed.bnbchain.org" },
  100: { id: 100, name: "Gnosis", rpc: "https://rpc.gnosischain.com", blockscout: "https://gnosis.blockscout.com" },
  130: { id: 130, name: "Unichain", rpc: "https://mainnet.unichain.org", blockscout: "https://unichain.blockscout.com" },
  137: { id: 137, name: "Polygon", rpc: "https://polygon-bor-rpc.publicnode.com", blockscout: "https://polygon.blockscout.com" },
  146: { id: 146, name: "Sonic", rpc: "https://rpc.soniclabs.com" },
  480: { id: 480, name: "World Chain", rpc: "https://worldchain-mainnet.g.alchemy.com/public", blockscout: "https://worldchain-mainnet.explorer.alchemy.com" },
  5000: { id: 5000, name: "Mantle", rpc: "https://rpc.mantle.xyz" },
  8453: { id: 8453, name: "Base", rpc: "https://mainnet.base.org", blockscout: "https://base.blockscout.com" },
  42161: { id: 42161, name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", blockscout: "https://arbitrum.blockscout.com" },
  42220: { id: 42220, name: "Celo", rpc: "https://forno.celo.org", blockscout: "https://celo.blockscout.com" },
  43114: { id: 43114, name: "Avalanche C-Chain", rpc: "https://api.avax.network/ext/bc/C/rpc" },
  59144: { id: 59144, name: "Linea", rpc: "https://rpc.linea.build", blockscout: "https://explorer.linea.build" },
  81457: { id: 81457, name: "Blast", rpc: "https://rpc.blast.io", blockscout: "https://blast.blockscout.com" },
  534352: { id: 534352, name: "Scroll", rpc: "https://rpc.scroll.io", blockscout: "https://scroll.blockscout.com" },
  // Testnets
  84532: { id: 84532, name: "Base Sepolia", rpc: "https://sepolia.base.org", blockscout: "https://base-sepolia.blockscout.com", testnet: true },
  11155111: { id: 11155111, name: "Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com", blockscout: "https://eth-sepolia.blockscout.com", testnet: true },
  11155420: { id: 11155420, name: "OP Sepolia", rpc: "https://sepolia.optimism.io", blockscout: "https://optimism-sepolia.blockscout.com", testnet: true },
  421614: { id: 421614, name: "Arbitrum Sepolia", rpc: "https://sepolia-rollup.arbitrum.io/rpc", blockscout: "https://arbitrum-sepolia.blockscout.com", testnet: true },
};

export function getChain(chainId: number): ChainInfo | undefined {
  return Object.prototype.hasOwnProperty.call(CHAINS, chainId) ? CHAINS[chainId] : undefined;
}

export const isSupportedChain = (chainId: number): boolean => getChain(chainId) !== undefined;

/** RPC URL for a chain: RPC_URL_<chainId> env override, else the public default. */
export function rpcUrl(chain: ChainInfo): string {
  return process.env[`RPC_URL_${chain.id}`] || chain.rpc;
}

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
