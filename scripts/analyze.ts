// Free local run of the analyzer: pnpm analyze <chainId> <address>
import "../src/config.js";
import { analyzeContract } from "../src/risk/analyze.js";

const [chainId, address] = process.argv.slice(2);
if (!chainId || !address) {
  console.error("usage: pnpm analyze <chainId> <address>");
  process.exit(1);
}
const t0 = performance.now();
try {
  const report = await analyzeContract(Number(chainId), address);
  console.log(JSON.stringify(report, null, 2));
  console.error(`[analyze] done in ${Math.round(performance.now() - t0)} ms`);
} catch (e) {
  console.error(`[analyze] failed after ${Math.round(performance.now() - t0)} ms:`, e instanceof Error ? e.message : e);
  process.exit(1);
}
