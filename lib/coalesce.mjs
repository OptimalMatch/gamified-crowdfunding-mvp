// Increments that land in the same few milliseconds go to the node as one
// $inc. The engine's additive counter is exact across nodes but loses
// increments when more than about twenty callers hit one node at once
// (GAPS.md, 4), so a writer with many callers behind it (the web server,
// the phone simulator) adds them up on the way. Nobody waits: add() returns
// as soon as the increment is queued, flush() waits for the last one to land.
export class Coalescer {
  constructor(send, { everyMs = 50, max = 200 } = {}) { this.send = send; this.everyMs = everyMs; this.max = max; this.sum = {}; this.n = 0; this.timer = null; this.pending = Promise.resolve(); this.sent = 0; }
  add(delta) { for (const [k, v] of Object.entries(delta)) this.sum[k] = (this.sum[k] || 0) + v; this.n++; if (this.n >= this.max) return this.flush(); if (!this.timer) this.timer = setTimeout(() => this.flush(), this.everyMs); return this.pending; }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.n) return this.pending;
    const sum = this.sum, n = this.n; this.sum = {}; this.n = 0;
    this.pending = this.pending.then(() => this.send(sum, n)).then(() => { this.sent += n; }, (e) => { console.error("counter increment failed:", e.message); });
    return this.pending;
  }
}
