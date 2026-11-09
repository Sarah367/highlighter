import {auth} from "./firebase";

// the server's address: VITE_API_URL when built for the internet, or your computer while developing.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// works just like fetch, but also tells the server who's signed in: it adds the user's Firebase
// sign-in token to the request's "Authorization" header. When nobody's signed in, it's a normal fetch.
export async function authFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) }; // keep any headers the caller already set
    if (auth.currentUser) {
        // Firebase gives a fresh token automatically when the old one is about to expire (they last an hour)
        const token = await auth.currentUser.getIdToken();
        headers.Authorization = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
}