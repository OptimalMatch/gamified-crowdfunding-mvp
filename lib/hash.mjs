// Pure hashing, the same bytes in Node and in the browser: SHA-256, canonical
// JSON, the sealed commitment, the entry tree and its paths, and the
// deterministic random source. No imports, so web/ serves this file as is.
const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
const utf8 = (s) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Buffer.from(s, "utf8"));
export function sha256(input) {
  const msg = typeof input === "string" ? utf8(input) : new Uint8Array(input);
  const l = msg.length; const bitLen = l * 8;
  const padded = new Uint8Array(((l + 9 + 63) >> 6) << 6); padded.set(msg); padded[l] = 0x80;
  const dv = new DataView(padded.buffer); dv.setUint32(padded.length - 4, bitLen >>> 0); dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Int32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(i + t * 4);
    for (let t = 16; t < 64; t++) { const x = w[t - 15], y = w[t - 2]; const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3); const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0; }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)); const ch = (e & f) ^ (~e & g); const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)); const maj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

// Canonical JSON: keys sorted at every level, no whitespace, undefined dropped.
export function canonical(v) {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined ? "null" : canonical(x))).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
export const hashDoc = (doc) => sha256(canonical(doc));
// The sealed commitment: a hash of the seed and the rule by version, published before pledging opens.
export const commitment = (seed, ruleId, ruleVersion) => sha256(`commit|${seed}|${ruleId}|${ruleVersion}`);

// The entry tree. Leaves are pledge hashes in entry order; each level pairs
// left and right (an odd last leaf is paired with itself). A path is the
// list of siblings from the leaf to the root with the side each sits on.
const pair = (a, b) => sha256(`node|${a}|${b}`);
export const leafHash = (p) => sha256(`leaf|${p.pledge_id}|${p.round_id}|${p.backer_id}|${p.amount_cents}|${p.weight}|${p.signature}`);
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
export const entriesHash = (leaves) => sha256(leaves.join("|"));

// What each signed document signs: everything on it but the signature and
// what is written afterwards (the tree path, the weight the platform adds).
export const pledgeMessage = (p) => canonical({ pledge_id: p.pledge_id, round_id: p.round_id, backer_id: p.backer_id, amount_cents: p.amount_cents, idea: p.idea ?? null, mandate_id: p.mandate_id ?? null, pledged_at: p.pledged_at });
export const mandateMessage = (m) => canonical({ mandate_id: m.mandate_id, backer_id: m.backer_id, amount_cents: m.amount_cents, cadence: m.cadence, backs: m.backs, ceiling_cents: m.ceiling_cents, until: m.until });
export const ledgerMessage = (e) => canonical({ entry_id: e.entry_id, round_id: e.round_id ?? null, buy_id: e.buy_id ?? null, sequence: e.sequence, kind: e.kind, amount_cents: e.amount_cents, from: e.from, to: e.to, ref: e.ref ?? null, at: e.at });
export const commitmentMessage = (c) => canonical({ commitment_id: c.commitment_id, buy_id: c.buy_id, backer_id: c.backer_id, units: c.units, put_cents: c.put_cents, joined_at: c.joined_at });
export const voteMessage = (v) => canonical({ buy_id: v.buy_id, backer_id: v.backer_id, ranks: v.ranks, cast_at: v.cast_at });
export const handoverMessage = (h) => canonical({ shipment_id: h.shipment_id, share: h.share, from: h.from, to: h.to, photo_hash: h.photo_hash, at: h.at });
export const docMessage = (d) => canonical({ ...d, signature: undefined });

// A deterministic random source from the revealed seed and the beacon:
// SHA-256 in counter mode, read as 52-bit floats.
export function drbg(seed, beacon) {
  let counter = 0, pool = "";
  const base = `draw|${seed}|${beacon}|`;
  return () => {
    if (pool.length < 13) pool += sha256(base + counter++);
    const chunk = pool.slice(0, 13); pool = pool.slice(13);
    return parseInt(chunk, 16) / 0x10000000000000;
  };
}
