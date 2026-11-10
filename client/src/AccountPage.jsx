import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";
import { API_URL, authFetch } from "./api";
import { useAuth } from "./auth";
import { formatMoney } from "./format";
import { STATUS_LABELS, statusKeyOf } from "./contestDetails";

// loads JSON from the server with the sign-in token, or throws the server's error message
async function getJson(path) {
    const res = await authFetch(`${API_URL}${path}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

// "November 2026"
function monthYear(date) {
    return date.toLocaleDateString([], {month: "long", year: "numeric"});
}

// one creator contest, as a row with its status
function ContestRow({contest}) {
    const key = statusKeyOf(contest);

    return (
        <li className="row">
            <div className="row-main">
                <span className="row-title">{contest.title}</span>
                <div className="meta">
                    <span className={`status status-${key}`}>{STATUS_LABELS[key] ?? key}</span>
                    <span>{formatMoney(contest.prizeTotalCents)} in prizes</span>
                    <span>{contest.entryCount || 0} {contest.entryCount === 1 ? "entry" : "entries"}</span>
                </div>

            </div>
            <Link className="button-link" to={`/contests/${contest.id}`}>Open</Link>
        </li>
    );
}

// one group of contests, like "Open" or "Past". Left out when it's empty.
function ContestGroup({ title, contests }) {
    if (contests.length === 0) return null;
    return (
        <div className="account-group">
            <h3>{title} <span className="muted">({contests.length})</span></h3>
            <ul className="rows">
                {contests.map((c) => <ContestRow key={c.id} contest={c} />)}
            </ul>
        </div>
    );
}

// user's account: profile, contests (creators), and the contest's they've entered
export default function AccountPage() {
    const {user, profile, isCreator, updateName, logOut} = useAuth();
    const [name, setName] = useState(profile ? profile.name : "");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(""); // "Saved." 
    const [problem, setProblem] = useState("");

    const [contests, setContests] = useState(null); // creators: their contests (null = loading)
    const [entries, setEntries] = useState(null); // everyone: their entries (null = loading)

    // creators: their own contests, everyone: the entries they made WHILE SIGNED IN
    useEffect(() => {
        if (isCreator) getJson("/api/contests").then(setContests).catch(() => setContests([]));
        getJson("/api/me/entries").then(setEntries).catch(() => setEntries([]));
    }, [isCreator]);

    async function saveName(e) {
        e.preventDefault();
        const trimmed = name.trim();
        setMessage("");
        setProblem("");
        // we dont want super long usernames
        if (trimmed.length < 1 || trimmed.length > 60) return setProblem("Use 1 to 60 characters.");

        setSaving(true);
        try {
            await updateName(trimmed);
            setMessage("Saved. New entries will use this name.");
        } catch (err) {
            setProblem(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function resetPassword() {
        setMessage("");
        setProblem("");
        try {
            await sendPasswordResetEmail(auth, user.email);
            setMessage(`We sent a link to ${user.email} to choose a new password.`)
        } catch (err) {
            setProblem(err.message);
        }
    }

    // creators' contests, in three groups
    const open = [];
    const drafts = [];
    const past = [];

    for (const c of contests || []) {
        const key = statusKeyOf(c);
        if (key === "open") open.push(c);
        else if (key === "draft") drafts.push(c);
        else past.push(c);
    }  

    // each contest they entered, once (they may have entered one several times)
    const entered = [];
    for (const entry of entries || []) {
        if (!entered.some((c) => c.contestId === entry.contestId)) entered.push(entry);
    }

    // when they joined: Firebase keeps the date each account was created
    const joined = new Date(user.metadata.creationTime);

    return (
        <>
            <div className="page-head">
                <h1>Your account</h1>
                <p>Member since {monthYear(joined)}</p>
            </div>

            <section className="panel account-profile">
                <form className="stack" onSubmit={saveName}>
                    <label className="field">
                        <span className="label">Display name</span>
                        <div className="inline-field">
                            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name"/>
                            <button type="submit" disabled={saving || name.trim() === (profile ? profile.name : "")}>
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                        <span className="hint">Shown on your account, and filled in when you enter contests.</span>
                    </label>
                </form>

                <dl className="account-facts">
                    <div>
                        <dt>Email</dt>
                        <dd>{user.email}</dd>
                    </div>
                    <div>
                        <dt>Account type</dt>
                        <dd>
                            {isCreator ? "Creator" : "Fan"}
                            {!isCreator && <> · <Link to="/start-creating">Start running contests</Link></>}
                        </dd>
                    </div>
                    <div>
                        <dt>Member since</dt>
                        <dd>{joined.toLocaleDateString([], {dateStyle: "long"})}</dd>                        
                    </div>
                </dl>

                {message && <p className="notice">{message}</p>}
                {problem && <p className="alert">{problem}</p>}

                <div className="actions">
                    <button onClick={resetPassword}>Email me a password reset link</button>
                    <button className="btn-quiet" onClick={logOut}>Log out</button>
                </div>
            </section>
            {isCreator && (
                <section className="block">
                    <div className="section-head">
                        <h2>Your contests</h2>
                        <Link to="/contests">Start a contest</Link>
                    </div>
                    {!contests && <p className="notice">Loading your contests...</p>}
                    {contests && contests.length === 0 && <p className="notice">You haven't started a contest yet.</p>}
                    {contests && (
                        <>
                            <ContestGroup title="Open" contests={open} />
                            <ContestGroup title="Drafts" contests={drafts}/>
                            <ContestGroup title="Past" contests={past}/>
                        </>
                    )}
                </section>
            )}
            <section className="block">
                <div className="section-head">
                    <h2>Contests you've entered</h2>
                    <Link to="/my-entries">My entries</Link>
                </div>
                {!entries && <p className="notice">Loading...</p>}
                {entries && entered.length === 0 && (
                    <p className="notice">
                        Nothing yet. <Link to="/browse">Browse open contests</Link>.
                    </p>
                )}
                {entered.length > 0 && (
                    <ul className="rows">
                        {entered.map((entry) => (
                            <li key={entry.contestId} className="row">
                                <div className="row-main">
                                    <span className="row-title">{entry.contestTitle}</span>
                                </div>
                                {/* a link BACK to the contest */}
                                <Link className="button-link" to={`/c/${entry.contestId}`}>View contest</Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </>
    );

}