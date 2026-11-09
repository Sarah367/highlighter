import {createContext, useContext, useEffect, useState} from "react";
import {createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile} from "firebase/auth";
import {doc, getDoc, serverTimestamp, setDoc} from "firebase/firestore";
import {auth,db} from "./firebase";

// who's signed in, shared with every page. React "context" lets any component ask for it
// with useAuth(), instead of passing it down through every component by hand
const AuthContext = createContext(null);

// loads a user's Highlighter profile ({uid, name, email, role}) from Firestore, or null if there isn't one
async function loadProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return snap.data();
}

export function AuthProvider({children}) {
    const [user,setUser] = useState(null); // firebase's signed-in user, or null when signed out
    const [profile, setProfile] = useState(null); // their Highlighter profile, including their role
    const [loading, setLoading] = useState(true); // true until we know whether anyone is signed in

    // Firebase calls this whenever someone signs in or out, including right when the page loads
    // (it remembers the last sign-in, so refreshing doesn't sign you out)
    useEffect(() => {
        return onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUser(null);
                setProfile(null);
                setLoading(false);
                return;
            }

            try {
                const loaded = await loadProfile(firebaseUser.uid);
                setUser(firebaseUser);
                // right after signing up, profile may not be saved yet when this runs,
                // so keep the one signUp already set instead of replacing it with nothing
                setProfile((current) => {
                    if (loaded) return loaded; // found a profile, then return it
                    // found nothing, but there's already a profile for this same person? (because signUp just set it), then keep it.
                    if (current && current.uid === firebaseUser.uid) return current; 
                    return null; // if found nothing and no profile has been set recently, then return null
                });
            } catch {
                setUser(firebaseUser);
                setProfile(null);
            }
            setLoading(false);
        });
    }, []);

    // creates the account, then saves their name and role (Creator or fan) in Firestore.
    async function signUp({name, email, password, role}) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, {displayName: name});

        const newProfile = {uid: result.user.uid, name, email: result.user.email, role};
        await setDoc(doc(db, "users", result.user.uid), {...newProfile, createdAt: serverTimestamp()});
        // save who is signed in right away, so the next page knows (instead of waiting for Firebase's update)
        setUser(result.user);
        setProfile(newProfile);
        return newProfile;
    }

    // signs in and returns their profile, so page can send them to the right place
    async function logIn({email, password}) {
        const result = await signInWithEmailAndPassword(auth,email,password);
        const loaded = await loadProfile(result.user.uid);

        // save who's signed in right away, so next page knows (instead of waiting for Firebase's update).
        setUser(result.user);
        setProfile(loaded);
        return loaded;
    }

    function logOut() {
        return signOut(auth);
    }
    const isCreator = profile !== null && profile.role === "creator";
    const value = {user,profile, loading, isCreator, signUp, logIn, logOut};
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// any component can call useAuth() to find out who's signed in
export function useAuth() {
    return useContext(AuthContext);
}

// Firebase's error codes, in plain words
export function authErrorMessage(err) {
    if (err.code === "auth/email-already-in-use") return "There's already an account with that email. Try logging in instead.";
    if (err.code === "auth/invalid-email") return "That email address doesn't look right.";
    if (err.code === "auth/weak-password") return "Choose a password with at least 6 characters.";
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        return "That email and password don't match an account.";
    }
    if (err.code === "auth/too-many-requests") return "Too many tries. Wait a few minutes, then try again.";
    if (err.code === "auth/network-request-failed") return "Couldn't connect. Check your internet connection.";
    return err.message;
}
