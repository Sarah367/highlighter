// connects the Express server to Firebase with full admin access.
import {readFileSync} from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

// private key file 
const serviceAccount = JSON.parse(
    readFileSync(new URL("./serviceAccountKey.json", import.meta.url), "utf8")
);

const app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

// Firestore database is named "default" (no parantheses)
export const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID);
export const bucket = getStorage(app).bucket();