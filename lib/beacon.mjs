// The randomness beacon: a public value that appeared after the round
// closed, which nobody on the platform picked. drand's League of Entropy
// mainnet (30 s rounds, genesis 1595431050) when reachable; a demo fallback
// derived from the close time and the entry root otherwise, and the proof
// says which it was. A verifier checks a drand round at
// https://api.drand.sh/public/<round>.
const GENESIS = 1595431050, PERIOD = 30;
const URLS = ["https://api.drand.sh/public/latest", "https://drand.cloudflare.com/public/latest"];
export const drandRoundAt = (ms) => Math.floor((ms / 1000 - GENESIS) / PERIOD) + 1;
export async function beaconAfter(closesAtMs, entryRoot) {
  const mustExceed = drandRoundAt(closesAtMs);
  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const b = await res.json();
      if (b.round > mustExceed) return { source: "drand-mainnet", round: b.round, value: b.randomness, signature: b.signature, at: new Date().toISOString(), after_round: mustExceed };
      // The next round has not appeared yet: wait for it.
      await new Promise((r) => setTimeout(r, 1000 * (PERIOD - ((Date.now() / 1000 - GENESIS) % PERIOD)) + 500));
      const res2 = await fetch(url.replace("latest", String(mustExceed + 1)), { signal: AbortSignal.timeout(4000) });
      if (res2.ok) { const b2 = await res2.json(); return { source: "drand-mainnet", round: b2.round, value: b2.randomness, signature: b2.signature, at: new Date().toISOString(), after_round: mustExceed }; }
    } catch {}
  }
  const { sha256 } = await import("./hash.mjs");
  return { source: "demo-fallback", round: mustExceed + 1, value: sha256(`demo-beacon|${closesAtMs}|${entryRoot}`), at: new Date().toISOString(), after_round: mustExceed, note: "drand unreachable: a demo value derived from the close time and the entry root; not unpredictable, and the proof says so" };
}
