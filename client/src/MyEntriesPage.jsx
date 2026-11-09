import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL, authFetch } from "./api";
import { useAuth } from "./auth";
import { formatMoney } from "./format";
 
// "Nov 20"
function shortDate(iso) {
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
 
// where an entry stands, in a sentence a fan would understand.
function describe(entry) {
    if (entry.win) {
        const prize = `You won ${entry.win.placeLabel} place: ${formatMoney(entry.win.prizeCents)}!`;
        if (entry.win.paymentStatus === "SUCCESS") return `${prize} It's been sent to your PayPal.`;
        if (entry.win.paymentStatus === "UNCLAIMED") return `${prize} Check your email from PayPal to claim it.`;
        if (entry.win.paymentStatus === "PENDING") return `${prize} PayPal is sending it now.`;
        return `${prize} There was a problem sending it, so the creator will try again.`;
    }
    if (entry.stage === "open") return `Contest open until ${shortDate(entry.deadline)}.`;
    if (entry.stage === "judging") return "The creator is picking winners.";
    return "Winners announced. You didn't place this time, but thanks for entering!";
}

export default function MyEntriesPage() {
    const { profile } = useAuth();
    const [entries, setEntries] = useState(null); // null = still loading
    const [problem, setProblem] = useState("");
 
    useEffect(() => {
        // authFetch sends the user's sign-in token, so the server knows whose entries to send back..
        authFetch(`${API_URL}/api/me/entries`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setEntries(data);
            })
            .catch((err) => setProblem(err.message));
    }, []);

    return (
        <>
            <div className="page-head">
                <h1>My entries</h1>
                <p>Every contest you've entered {profile ? `, ${profile.name}` : ""}.</p>
            </div>

            {problem && <p className="alert">{problem}</p>}
            {!entries && !problem && <p className="notice">Loading your entries...</p>}
            {entries && entries.length === 0 && (
                <p className="notice">
                    You haven't entered any contests while signed in yet. <Link to="/browse">Browse open contests</Link>.
                </p>
            )}
            {entries && entries.length > 0 && (
                <ul className="rows">
                    {entries.map((entry) => (
                        <li key={entry.id} className="row">
                            <div className="row-main">
                                <span className="row-title">{entry.title}</span>
                                <div className="meta">
                                    <Link to={`/c/${entry.contestId}`}>{entry.contestTitle}</Link>
                                    {entry.createdAt && <span>Entered {shortDate(entry.createdAt)}</span>}
                                </div>
                                <span className="entry-result">
                                    {/* a win gets the Highlighter, on just the words */}
                                    <span className={entry.win ? "entry-won" : ""}>{describe(entry)}</span>
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}