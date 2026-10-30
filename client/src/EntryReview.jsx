import {useCallback, useEffect, useState} from "react";
import {getDownloadURL, ref} from "firebase/storage";
import {storage} from "./firebase";
import {API_URL} from "./api";
import {formatTime} from "./format";

// review groups, in order the creator sees them
const GROUPS = [
    {key: "screening", title: "Being screened", empty: null},
    {key: "review", title: "Needs your review", empty: "Nothing flagged. Nice."},
    {key: "shortlist", title: "Shortlist", empty: "No shortlisted entries yet."},
    {key: "rejected", title: "Rejected", empty: null},
    {key: "error", title: "Couldn't be screened", empty: null},
];

// screening steps, as server reports them.
const STEPS = [
    {key: "transcribing", label: "Transcribing"},
    {key: "tracing", label:"Tracing sources"},
    {key: "checking_context", label: "Checking context"},
];

const FLAG_LABELS = {
    context: "Context",
    source: "Source",
    unedited: "Unedited",
    length: "Length",
    unchecked: "Not checked",
};

// which group an entry belongs in. the creator's decision always wins over the AI's verdict
function groupOf(entry) {
    // in progress entries are "screening"; failures are "error", then decision if made one
    // flagged entries need review while passed entries are shortlisted.
    if (entry.status === "submitted" || entry.status === "screening") return "screening";
    if (entry.status === "error") return "error";

    if (entry.creatorDecision === "reject") return "rejected";
    if (entry.creatorDecision === "shortlist") return "shortlist";
    
    return entry.status === "flagged" ? "review" : "shortlist"; 
}

function StepIndicator({entry}) {
    if (entry.status === "submitted" && !entry.screeningStep) return <p className="hint">Waiting to start...</p>
    const current = Math.max(0, STEPS.findIndex((s) => s.key === entry.screeningStep));

    return (
        <ol className="steps" aria-label="Screening progress">
            {STEPS.map((step, i) => (
                <li key={step.key} className={i < current ? "done" : i === current ? "current" : ""}>
                {step.label}
                </li>
            ))}
        </ol>
    );

}

function EntryCard({entry, onDecide, onRescreen}) {
    const [videoUrl, setVideoUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const screening = entry.screening;
    const flags = screening?.flags ?? [];
    const segments = screening?.segments ?? [];
    const group = groupOf(entry);
    const canRescreen = group === "error" || flags.some((f) => f.type === "unchecked");

    // video only loads when asked, so a long list of entries stays fast
    async function watch() {
        if (!videoUrl) setVideoUrl(await getDownloadURL(ref(storage, entry.storagePath)));
    }

    async function act(action) {
        setBusy(true);
        try {
            await action();

        } finally {
            setBusy(false);
        }
    }

    return (
        <li className="entry-card">
            <div className = "entry-head">
                <div className="row-main">
                    <span className="row-title">{entry.title || `Entry by ${entry.fanName}`}</span>
                    <div className="meta">
                        <span>by {entry.fanName}</span>
                        {entry.createdAt && <span>{new Date(entry.createdAt).toLocaleString([], {dateStyle: "medium", timeStyle: "short"})}</span>}
                        {(screening?.durationSec ?? entry.durationSec) && <span>{formatTime(screening?.durationSec ?? entry.durationSec)}</span>}
                        {entry.creatorDecision && <span className="status">Your call: {entry.creatorDecision === "shortlist" ? "shortlisted" : "rejected"}</span>}
                    </div>
                </div>
            </div>

            {group === "screening" && <StepIndicator entry = {entry} />}
            {group === "error" && <p className="alert">{entry.error || "Screening failed."}</p>}

            {flags.length > 0 && (
                <ul className="flags">
                {flags.map((flag, i) => (
                    <li key={i} className={`flag flag-${flag.risk ?? "medium"}`}>
                    <span className="flag-type">
                        {FLAG_LABELS[flag.type] ?? flag.type}
                        {flag.risk ? `, ${flag.risk} risk` : ""}
                    </span>
                    <span>{flag.message}</span>
                    </li>
                ))}
                </ul>
            )}
            {screening?.contextCheck?.summary && <p className="hint">AI review: {screening.contextCheck.summary}</p>}

            {segments.length > 0 && (
                <details className="sources">
                <summary>
                    Where the clips came from ({segments.length} {segments.length === 1 ? "piece" : "pieces"})
                </summary>
                <ul>
                    {segments.map((s, i) => (
                    <li key={i}>
                        <span className="ts">{formatTime(s.entryStart)}</span> "{s.text}"{" "}
                        <span className="muted">
                        from {s.episodeTitle} at {formatTime(s.episodeStart)}
                        </span>
                    </li>
                    ))}
                </ul>
                </details>
            )}

            {videoUrl && <video className="player" src={videoUrl} controls />}

            <div className="actions">
                {!videoUrl && <button onClick={watch}>Watch entry</button>}
                {group !== "screening" && group !== "error" && !entry.creatorDecision && (
                    <>
                        <button className="btn-primary" disabled={busy} onClick={() => act(() => onDecide(entry.id, "shortlist"))}>
                            Shortlist
                        </button>
                        <button disabled={busy} onClick={() => act(() => onDecide(entry.id, "reject"))}>
                            Reject
                        </button>
                    </>
                )}
                {entry.creatorDecision && (
                    <button className="btn-quiet" disabled={busy} onClick={() =>act(() => onDecide(entry.id, null))}>
                        Undo decision
                    </button>
                )}
                {canRescreen && (
                    <button disabled={busy} onClick={() => act(() => onRescreen(entry.id))}>
                        Re-screen
                    </button>
                )}
            </div>

        </li>
    );
}

// creator's review screen for one contest's entries.
export default function EntryReview({contestId}) {
    const [entries, setEntries] = useState(null); // null = still loading
    const [problem, setProblem] = useState("");

    // useCallback keeps it same function between redraws so it doesnt restart every time
    const load = useCallback(async () => { 
        try {
            const res = await fetch(`${API_URL}/api/contests/${contestId}/entries`); // fetches the contest's entries
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setEntries(data);
            setProblem("");
        } catch (err) {
            setProblem(err.message);
        }
    }, [contestId]);

    useEffect(() => { 
        load();
    }, [load]);

    // while anything is being screened, check for updates every 3 seconds...
    const inProgress = entries?.some((e) => e.status === "submitted" || e.status === "screening");
    useEffect(() => {
        if (!inProgress) return; // stop when all are done (not submitted or in screening process).
        const timer = setInterval(load, 3000);
        return () => clearInterval(timer); // stop when screening finishes or the page itself closes.

    }, [inProgress, load]);

    async function decide(entryId, decision) {
        const res = await fetch(`${API_URL}/api/entries/${entryId}/decision`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({decision}),
        });
        if (!res.ok) setProblem((await res.json()).error);
        await load(); // refresh, so entry moves to its new group depending on the decision the creator made (shortlisted or rejected)
    }

    async function rescreen(entryId) {
        // screening takes a while, so dont wait for it; show as in progress and let polling follow along.
        fetch(`${API_URL}/api/entries/${entryId}/screen?force=true`, {method: "POST"}).catch(() => {});
        setEntries((list) => list.map((e) => (e.id === entryId ? {...e, status: "screening", screeningStep: "transcribing"} : e)));
    }

    if (!entries) return <p className="notice">{problem || "Loading entries..."}</p>;

    return (
        <section>
            {problem && <p className="alert">{problem}</p>}
            {entries.length===0 && <p className="notice">No entries yet. Share your contest link to get some.</p>}

            {entries.length > 0 &&
                GROUPS.map((group) => {
                    const list = entries.filter((e) =>groupOf(e) === group.key);
                    if (list.length === 0 && !group.empty) return null;
                    return (
                        <div key={group.key} className="entry-group">
                            <h3>
                                {group.title} <span className="muted">({list.length})</span>
                            </h3>
                            {list.length === 0 ? (
                                <p className="hint">{group.empty}</p>
                            ) : (
                                <ul className="entry-list">
                                    {list.map((entry) => (
                                        <EntryCard key = {entry.id} entry={entry} onDecide={decide} onRescreen={rescreen}/>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
        </section>
    );
}