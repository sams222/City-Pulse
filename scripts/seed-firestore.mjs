import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedPath = join(root, "firestore-seed.json");

function deepConvertIsoStringsToTimestamp(value) {
  if (value === null || value === undefined) return value;
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
    !Number.isNaN(Date.parse(value))
  ) {
    return admin.firestore.Timestamp.fromDate(new Date(value));
  }
  if (Array.isArray(value)) return value.map(deepConvertIsoStringsToTimestamp);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepConvertIsoStringsToTimestamp(v);
    }
    return out;
  }
  return value;
}

const raw = JSON.parse(readFileSync(seedPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const batchSize = 400;
let batch = db.batch();
let ops = 0;

async function flush() {
  if (ops === 0) return;
  await batch.commit();
  batch = db.batch();
  ops = 0;
}

for (const [collectionName, documents] of Object.entries(raw)) {
  if (collectionName === "meta") continue;
  if (typeof documents !== "object" || documents === null || Array.isArray(documents)) {
    continue;
  }
  for (const [docId, data] of Object.entries(documents)) {
    const ref = db.collection(collectionName).doc(docId);
    batch.set(ref, deepConvertIsoStringsToTimestamp(data), { merge: true });
    ops++;
    if (ops >= batchSize) {
      await flush();
    }
  }
}

await flush();
console.log("Firestore seed finished:", seedPath);
