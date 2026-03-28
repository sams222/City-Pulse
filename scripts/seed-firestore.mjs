import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const seedPath = join(root, "firestore-seed.json");

dotenv.config({ path: join(root, ".env") });
dotenv.config({ path: join(root, "mobile", ".env") });

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT;

let credPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
if (credPath && !existsSync(credPath)) {
  const rel = join(root, credPath);
  if (existsSync(rel)) credPath = rel;
}

if (!projectId) {
  console.error(
    "Missing project id. Set FIREBASE_PROJECT_ID or EXPO_PUBLIC_FIREBASE_PROJECT_ID (e.g. in mobile/.env).",
  );
  process.exit(1);
}

if (!admin.apps.length) {
  if (credPath && existsSync(credPath)) {
    const serviceAccount = JSON.parse(readFileSync(credPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  } else {
    console.error(
      [
        "No Firebase Admin credentials found.",
        "",
        "Download a service account key: Firebase Console → Project settings → Service accounts → Generate new private key.",
        "Save the JSON file outside the repo (or in the repo but gitignored), then either:",
        "",
        '  PowerShell:  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\full\\path\\to\\serviceAccount.json"',
        "  Or add to mobile/.env:",
        '  FIREBASE_SERVICE_ACCOUNT=C:\\full\\path\\to\\serviceAccount.json',
        "",
        "Then run: npm run seed:firestore",
      ].join("\n"),
    );
    process.exit(1);
  }
}

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
console.log("Firestore seed finished for project:", projectId);
console.log("Source:", seedPath);
