import {useState} from "react";
import {Link, useNavigate, useSearchParams} from "react-router-dom";
import { authErrorMessage, useAuth } from "./auth";

// where to go after signing in: back to the page that asked them to sign in (?next=...),
// or the starting page for their role. Only addresses on this site are allowed

function destination(next,role) {
    // makes sure its a path (starts with "/") and not a full address ("//") which could maliciously
    // lead the user somewhere else (open redirect)
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return role ==="creator" ? "/contests" : "/browse";
}

export default function AuthPage({mode}) {
    const {signUp, logIn} = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const next = searchParams.get("next");

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    // creator or fan, chosen when signing up. The home page's "Start a contest" adds ?role=creator,
    // so "Run contests" is already picked.
    const [role, setRole] = useState(searchParams.get("role") === "creator" ? "creator" : "");
    const [problem, setProblem] = useState("");
    const [busy, setBusy] = useState(false);

    const signingUp = mode === "signup";
    
    async function handleSubmit(e) {
        e.preventDefault();
        setProblem("");

        if (signingUp && !name.trim()) return setProblem("Add your name.");
        if (signingUp && !role) return setProblem("Choose whether you want to run contests or enter them.");

        setBusy(true);
        try {
            let profile;
            if (signingUp) {
                profile = await signUp({name: name.trim(), email: email.trim(), password, role});

            } else {
                profile = await logIn({email: email.trim(), password});
            }
            navigate(destination(next, profile ? profile.role : "fan"), {replace: true});
        } catch (err) {
            setProblem(authErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }
        
    // keeps ?next= when switching between "Log in" and "Sign up"
    const keepNext = next ? `?next=${encodeURIComponent(next)}` : "";

    return (
        <section className="auth-card">
            <h1>{signingUp ? "Create your account" : "Log in"}</h1>
            <p className="muted">
                {signingUp
                    ? "Creators need an account to run contests. Fans can enter contests without one."
                    : "Welcome back."}
            </p>

            <form className="stack" onSubmit={handleSubmit}>
                {signingUp && (
                    <div className="field">
                        <span className="label">What do you want to do?</span>
                        <div className="role-options">
                            <button type="button" className="role-option" aria-pressed={role === "creator"} onClick={() => setRole("creator")}>
                                <strong>Run contests</strong>
                                <span>You can still enter other creators' contests.</span>
                            </button>
                            <button type="button" className="role-option" aria-pressed={role === "fan"} onClick={() => setRole("fan")}>
                                <strong>Enter contests</strong>
                                <span>Make edits, and keep track of your entries.</span>
                            </button>
                        </div>
                    </div>
                )}

                {signingUp && (
                    <label className="field">
                        <span className="label">Name</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    </label>
                )}

                <label className="field">
                    <span className="label">Email</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                </label>

                <label className="field">
                    <span className="label">Password</span>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={signingUp ? "new-password" : "current-password"}
                        minLength={6}
                        required
                    />
                    {signingUp && <span className="hint">At least 6 characters.</span>}
                </label>
                                {problem && <p className="alert">{problem}</p>}

                    <div className="actions">
                        <button className="btn-primary" type="submit" disabled={busy}>
                            {busy ? "One moment..." : signingUp ? "Create account" : "Log in"}
                        </button>
                    </div>
                </form>

                <p className="muted auth-switch">
                    {signingUp ? (
                        <>Already have an account? <Link to={`/login${keepNext}`}>Log in</Link></>
                    ) : (
                        <>New to Highlighter? <Link to={`/signup${keepNext}`}>Create an account</Link></>
                    )}
                </p>
            </section>
        );

}
