// What the design rests on, in one file: hashing, the entry tree and its
// paths, the sealed commitment, the device signature, and a deterministic
// random source from the seed and the beacon. Every function here is pure
// and runs the same in Node, in the browser (web/public/verify.js mirrors
// it with WebCrypto) and on anybody's laptop.
import { createHash, generateKeyPairSync, sign as nodeSign, verify as nodeVerify, createPublicKey, createPrivateKey, randomBytes } from "node:crypto";

export const hex = (buf) => Buffer.from(buf).toString("hex");
export const sha256 = (data) => createHash("sha256").update(typeof data === "string" ? data : Buffer.from(data)).digest("hex");
export const randomHex = (n = 32) => randomBytes(n).toString("hex");

// Canonical JSON: keys sorted at every level, no whitespace, so two parties
// hashing the same document get the same bytes.
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
export const hashDoc = (doc) => sha256(canonical(doc));

// The sealed commitment: a hash of the seed and the rule by version, published
// before pledging opens. Reveal is checked against it afterwards.
export const commitment = (seed, ruleId, ruleVersion) => sha256(`commit|${seed}|${ruleId}|${ruleVersion}`);

// The entry tree. Leaves are pledge hashes in entry order; each level pairs
// left and right (an odd last leaf is paired with itself). A path is the
// list of siblings from the leaf to the root with which side each sits on.
const pair = (a, b) => sha256(`node|${a}|${b}`);
export const leafHash = (pledge) => sha256(`leaf|${pledge.pledge_id}|${pledge.round_id}|${pledge.backer_id}|${pledge.amount_cents}|${pledge.weight}|${pledge.signature}`);
export function merkleTree(leaves) {
  if (!leaves.length) return { root: sha256("empty"), levels: [[]] };
  const levels = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1], next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(pair(prev[i], prev[i + 1] ?? prev[i]));
    levels.push(next);
  }
  return { root: levels[levels.length - 1][0], levels };
}
export function merklePath(tree, index) {
  const path = [];
  for (let l = 0; l < tree.levels.length - 1; l++) {
    const level = tree.levels[l];
    const sibling = index % 2 === 0 ? (level[index + 1] ?? level[index]) : level[index - 1];
    path.push({ hash: sibling, side: index % 2 === 0 ? "right" : "left" });
    index = Math.floor(index / 2);
  }
  return path;
}
export function verifyPath(leaf, path, root) {
  let h = leaf;
  for (const p of path) h = p.side === "right" ? pair(h, p.hash) : pair(p.hash, h);
  return h === root;
}

// Device keys: Ed25519. Public keys travel as hex of the raw 32 bytes, which
// is what the browser's WebCrypto exports too, so a pledge signed on a phone
// verifies on the node and the other way round.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "der" }).subarray(SPKI_PREFIX.length);
  const priv = privateKey.export({ type: "pkcs8", format: "der" }).subarray(PKCS8_PREFIX.length);
  return { publicKey: hex(pub), privateKey: hex(priv) };
}
export function sign(privateKeyHex, message) {
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(privateKeyHex, "hex")]), format: "der", type: "pkcs8" });
  return hex(nodeSign(null, Buffer.from(message), key));
}
export function verify(publicKeyHex, message, signatureHex) {
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return nodeVerify(null, Buffer.from(message), key, Buffer.from(signatureHex, "hex"));
  } catch { return false; }
}
// What a pledge signs: everything on it but the signature and the tree path,
// which are written afterwards.
export const pledgeMessage = (p) => canonical({ pledge_id: p.pledge_id, round_id: p.round_id, backer_id: p.backer_id, amount_cents: p.amount_cents, idea: p.idea ?? null, mandate_id: p.mandate_id ?? null, pledged_at: p.pledged_at });
export const mandateMessage = (m) => canonical({ mandate_id: m.mandate_id, backer_id: m.backer_id, amount_cents: m.amount_cents, cadence: m.cadence, backs: m.backs, ceiling_cents: m.ceiling_cents, until: m.until });
export const ledgerMessage = (e) => canonical({ entry_id: e.entry_id, round_id: e.round_id ?? null, buy_id: e.buy_id ?? null, sequence: e.sequence, kind: e.kind, amount_cents: e.amount_cents, from: e.from, to: e.to, ref: e.ref ?? null, at: e.at });
export const handoverMessage = (h) => canonical({ shipment_id: h.shipment_id, share: h.share, from: h.from, to: h.to, photo_hash: h.photo_hash, at: h.at });

// A deterministic random source from the revealed seed and the beacon:
// SHA-256 in counter mode, read as 53-bit floats. Anyone with the proof
// gets the same sequence.
export function drbg(seed, beacon) {
  let counter = 0, pool = "";
  const base = `draw|${seed}|${beacon}|`;
  return () => {
    if (pool.length < 14) { pool += sha256(base + counter++); }
    const chunk = pool.slice(0, 13); pool = pool.slice(13);
    return parseInt(chunk, 16) / 0x10000000000000; // 52 bits
  };
}

// A key pair from a 32-byte seed: an Ed25519 private key is its seed, so a
// demo device's key can be derived from a secret and the backer's id and
// never stored. A real phone keeps its key in the keystore instead.
export function keyPairFromSeed(seedHex) {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, "hex")]), format: "der", type: "pkcs8" });
  const pub = createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(SPKI_PREFIX.length);
  return { publicKey: hex(pub), privateKey: seedHex };
}
