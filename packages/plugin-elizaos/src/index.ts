import type { Plugin } from "@elizaos/core";
import { quickFlagsAction, riskReportAction } from "./actions.js";

export const contractRiskPlugin: Plugin = {
  name: "contract-risk",
  description:
    "Smart-contract risk checks from Magneta Contract Risk: free bytecode quick flags and a paid ($0.02 USDC, x402) full report.",
  actions: [quickFlagsAction, riskReportAction],
};

export { quickFlagsAction, riskReportAction } from "./actions.js";
export { extract, extractAddress, extractChainId } from "./parse.js";
export default contractRiskPlugin;
