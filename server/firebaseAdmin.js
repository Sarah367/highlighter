// connects the Express server to Firebase with full admin access.
import {readFileSync} from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {getAuth} from "firebase-admin/auth";

// on your computer: the key file. Online: the same key, stored as a setting (FIREBASE_SERVICE_ACCOUNT),
// since the key file is never uploaded to GitHub.
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    serviceAccount = JSON.parse(readFileSync(new URL("./serviceAccountKey.json", import.meta.url), "utf8"));
}

const app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

// Firestore database is named "default" (no parantheses)
export const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID);
export const bucket = getStorage(app).bucket();
export const adminAuth = getAuth(app); // checks the sign-in tokens the app sends