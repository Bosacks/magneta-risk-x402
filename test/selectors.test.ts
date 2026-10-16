import assert from "node:assert/strict";
import test from "node:test";
import { matchSelectors, SIGNATURE_SELECTORS } from "../src/risk/selectors.js";
import { scanBytecode } from "../src/risk/opcodes.js";

test("well-known selectors are computed correctly", () => {
  assert.equal(SIGNATURE_SELECTORS.get("mint(address,uint256)"), "0x40c10f19");
  assert.equal(SIGNATURE_SELECTORS.get("pause()"), "0x8456cb59");
  assert.equal(SIGNATURE_SELECTORS.get("renounceOwnership()"), "0x715018a6");
  assert.equal(SIGNATURE_SELECTORS.get("transferOwnership(address)"), "0xf2fde38b");
});

test("matches only selectors present as PUSH4 immediates", () => {
  const found = matchSelectors(scanBytecode("0x6340c10f19146340c10f1900").push4);
  assert.deepEqual(found, ["mint(address,uint256)"]);
});

test("selector bytes inside other PUSH data are not matched", () => {
  // PUSH8 containing 8456cb59 inside its data
  const found = matchSelectors(scanBytecode("0x678456cb5900000000").push4);
  assert.deepEqual(found, []);
});
