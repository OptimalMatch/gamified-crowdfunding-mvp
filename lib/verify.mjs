// Verify it yourself: the two checks of the design, both pure functions over
// published documents. Anyone with the proof recomputes the whole allocation;
// anyone with a receipt proves their entry was in the set that was drawn.
import { commitment, merkleTree, leafHash, verifyPath, canonical, pledgeMessage, entriesHash, docMessage } from "./hash.mjs";
import { allocate } from "./mechanisms.mjs";

// 1. Recompute the whole allocation from the proof, the frozen rule and the entries.
//    Returns { ok, why, recomputed } where recomputed is what this laptop got.
// verifySig(publicKeyHex, message, signatureHex) -> boolean is Node's Ed25519 in the
// simulators and WebCrypto in the browser; without one the signatures are not checked, and why says so.
export function recomputeDraw({ seal, draw, rule, entries, roundKey, verifySig = null }) {
  const why = [];
  if (!seal) why.push("no sealed commitment for this round");
  if (!draw) why.push("no proof for this round");
  if (!rule) why.push("the rule by version is missing");
  if (why.length) return { ok: false, why };
  const notes = [];
  if (roundKey && verifySig) {
    if (!verifySig(roundKey, docMessage(seal), seal.signature)) why.push("the seal's signature does not verify against the round's key");
    if (!verifySig(roundKey, docMessage(draw), draw.signature)) why.push("the proof's signature does not verify against the round's key");
  } else notes.push("signatures not checked here");
  // Commit first, reveal after: the revealed seed and the frozen rule hash to what was sealed before opening.
  if (commitment(draw.seed, draw.rule_id, draw.rule_version) !== seal.seed_hash) why.push("the revealed seed and rule do not hash to the sealed commitment");
  if (seal.rule_id !== draw.rule_id || seal.rule_version !== draw.rule_version) why.push("the rule the draw ran is not the rule that was sealed");
  if (rule.rule_id !== draw.rule_id || rule.version !== draw.rule_version) why.push("the rule document is not the sealed version");
  // The entry set: the hash and the tree root must match, so the list did not grow after the close.
  const sorted = entries.slice().sort((a, b) => a.entry_index - b.entry_index);
  const leaves = sorted.map(leafHash);
  if (sorted.length !== draw.entry_count) why.push(`${sorted.length} entries held, the proof says ${draw.entry_count}`);
  if (entriesHash(leaves) !== draw.entries_hash) why.push("the entry set does not hash to the proof's entries_hash");
  if (merkleTree(leaves).root !== draw.entry_root) why.push("the entry tree's root is not the proof's root");
  // Run the frozen rule with the seed and the beacon: the same inputs give the same answer.
  const recomputed = allocate(rule, sorted, draw.seed, draw.beacon.value, { match_cents: draw.match_cents || 0 });
  if (canonical(recomputed) !== canonical(draw.result)) why.push("the recomputed allocation differs from the published result");
  return { ok: why.length === 0, why, notes, recomputed };
}

// 2. Check a receipt: the pledge's own signature, its leaf and its path to the published root.
export function verifyReceipt({ pledge, root, devicePublicKey, verifySig = null }) {
  const why = [];
  const key = devicePublicKey || pledge.device_public_key;
  if (verifySig && !verifySig(key, pledgeMessage(pledge), pledge.signature)) why.push("the pledge's signature does not verify against the device's key");
  if (leafHash(pledge) !== pledge.leaf_hash) why.push("the pledge does not hash to its own leaf");
  if (!verifyPath(pledge.leaf_hash, pledge.tree_path || [], root)) why.push("the path from this leaf does not reach the published root");
  return { ok: why.length === 0, why };
}
