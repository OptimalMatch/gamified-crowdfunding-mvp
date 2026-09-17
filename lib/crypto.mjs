// Hashing (pure, shared with the browser) plus the device signatures, which
// need Node's Ed25519. Public keys travel as hex of the raw 32 bytes, which
// is what the browser's WebCrypto exports too.
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify, createPublicKey, createPrivateKey, randomBytes } from "node:crypto";
export * from "./hash.mjs";
export const hex = (buf) => Buffer.from(buf).toString("hex");
export const randomHex = (n = 32) => randomBytes(n).toString("hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey: hex(publicKey.export({ type: "spki", format: "der" }).subarray(SPKI_PREFIX.length)), privateKey: hex(privateKey.export({ type: "pkcs8", format: "der" }).subarray(PKCS8_PREFIX.length)) };
}
// A key pair from a 32-byte seed: an Ed25519 private key is its seed.
export function keyPairFromSeed(seedHex) {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, "hex")]), format: "der", type: "pkcs8" });
  return { publicKey: hex(createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(SPKI_PREFIX.length)), privateKey: seedHex };
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
