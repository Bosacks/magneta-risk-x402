import assert from "node:assert/strict";
import test from "node:test";
import { computeScore, levelFor, type ScoreInput } from "../src/risk/score.js";

const clean: ScoreInput = {
  verified: true, isProxy: false, ownerNotRenounced: false, foundSelectors: [],
  hasSelfdestruct: false, currentlyPaused: false, aderynHigh: 0,
};

test("clean verified contract scores 0 / low", () => {
  const r = computeScore(clean);
  assert.equal(r.score, 0);
  assert.equal(r.level, "low");
  assert.deepEqual(r.flags, []);
});

test("rubric points add up", () => {
  const r = computeScore({
    ...clean, verified: false, isProxy: true, ownerNotRenounced: true,
    foundSelectors: ["mint(uint256)", "setBots(address[],bool)", "setSellTax(uint256)", "pause()"],
  });
  assert.equal(r.score, 25 + 15 + 10 + 15 + 15 + 10 + 5);
  assert.equal(r.level, "critical");
});

test("aderyn high findings: +5 each, capped at +20", () => {
  assert.equal(computeScore({ ...clean, aderynHigh: 2 }).score, 10);
  assert.equal(computeScore({ ...clean, aderynHigh: 9 }).score, 20);
  assert.equal(computeScore({ ...clean, aderynHigh: null }).score, 0);
});

test("score is capped at 100 and level thresholds hold", () => {
  assert.equal(levelFor(24), "low");
  assert.equal(levelFor(25), "medium");
  assert.equal(levelFor(50), "high");
  assert.equal(levelFor(75), "critical");
  const r = computeScore({
    verified: false, isProxy: true, ownerNotRenounced: true, hasSelfdestruct: true, currentlyPaused: true, aderynHigh: 10,
    foundSelectors: ["mint(uint256)", "blacklist(address)", "setFee(uint256)", "pause()"],
  });
  assert.equal(r.score, 100);
});

test("unknown verification status is flagged but not penalised", () => {
  const r = computeScore({ ...clean, verified: null });
  assert.equal(r.score, 0);
  assert.deepEqual(r.flags, ["source-verification-unknown"]);
  assert.equal(computeScore({ ...clean, verified: false }).score, 25);
});
