// Who signs what. Every writer of the design holds an Ed25519 key: each
// backer's device, the round (the platform's integrity lead), the escrow,
// the supplier's node and the sponsor's. In the demo they are derived from
// one secret in .env (DEMO_KEY_SEED) so the seed, the simulators and the web
// server agree without a key store; the public halves are published in the
// `keys` collection, which is what a verifier reads.
import { sha256, keyPairFromSeed } from "./crypto.mjs";
const SECRET = process.env.DEMO_KEY_SEED || "demo-only-change-me";
export const deviceKey = (backerId) => keyPairFromSeed(sha256(`device|${SECRET}|${backerId}`));
export const roleKey = (role) => keyPairFromSeed(sha256(`role|${SECRET}|${role}`));
export const ROLES = ["round", "escrow", "supplier-northlight", "sponsor-acme", "fulfilment", "panel"];
export const keyDocs = () => ROLES.map((role) => ({ _id: `role:${role}`, holder: role, kind: "role", public_key: roleKey(role).publicKey, algorithm: "ed25519" }));
