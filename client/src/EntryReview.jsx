import {useCallback, useEffect, useState} from "react";
import {getDownloadURL, ref} from "firebase/storage";
import {storage} from "./firebase";
import {API_URL, authFetch} from "./api";
import {formatTime} from "./format";
import {MIN_DECISIONS, predictTaste, trainTaste} from "./tasteModel";

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
    {key: "final_checks", label: "Final checks"},
];

const FLAG_LABELS = {
    context: "Context",
    source: "Source",
    unedited: "Unedited",
    length: "Length",
    unchecked: "Not checked",
    duplicate: "Duplicate",
    brief: "Brief",
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
// selected / onToggle: whether the card is ticked for a bulk action (and how to tick or untick it)
function EntryCard({entry, onDecide, onRescreen, selected, onToggle , taste}) {
    const [videoUrl, setVideoUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const screening = entry.screening;
    const flags = screening?.flags ?? [];
    const segments = screening?.segments ?? [];
    const group = groupOf(entry);
    const canRescreen = group === "error" || flags.some((f) => f.type === "unchecked");

    // a guess at how the creator would decide, for screened entries they haven't decided on yet
    let guess = null;
    let guessText = "";
    if (taste && screening && !entry.creatorDecision && group !== "screening" && group !== "error") {
        guess = predictTaste(taste,entry);

        // percentage for whichever way it leans, so it never says "likely reject (4%)"
        let percent = guess.shortlistChance;
        if (guess.leaning === "reject") percent = 1 - guess.shortlistChance;
        percent = Math.round(percent * 100);

        if (guess.leaning === "shortlist") {
            guessText=`Likely shortlist (${percent}%)`;
        } else {
            guessText = `Likely reject (${percent}%)`;
        }
    }

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
                {/* entries still being screened (or that failed) can't be decided yet, so they get no checkbox. */}
                {group !== "screening" && group !== "error" && (
                    <input
                        type="checkbox"
                        className="entry-select"
                        checked={selected}
                        onChange={onToggle}
                        aria-label={`Select ${entry.title || `entry by ${entry.fanName}`}`}
                    />
                )}
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
            
            {/* your taste: the naive bayes guess, with the two features that pushed it the most*/}
            {guess && (
                <p className={`taste taste-${guess.leaning}`}>
                    <span className="taste-label">Your taste</span>
                    {guessText}
                    {guess.reasons.length > 0 && <span className="muted"> · {guess.reasons.join(", ")}</span>}
                </p>
            )}

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

// true when screening gave the entry at least one real flag ("Not checked" doesn't count)
function isFlagged(entry) {
    if (!entry.screening || !entry.screening.flags) return false;
    for (const flag of entry.screening.flags) {
        if (flag.type !== "unchecked") return true;
    }
    return false;
}

// true when the entry has at least one high-risk flag, like an exact duplicate or clear fake quote
function isHighRisk(entry) {
    if (!entry.screening || !entry.screening.flags) return false;
    for (const flag of entry.screening.flags) {
        if (flag.risk === "high") return true;
    }
    return false;
}


// creator's review screen for one contest's entries.
// onChange: called whenever the entries reload, so other parts of the page (like winner picker) can update properly
export default function EntryReview({contestId, onChange}) {
    const [entries, setEntries] = useState(null); // null = still loading
    const [problem, setProblem] = useState("");
    const [selected, setSelected] = useState([]); // IDs of the entries ticked for a bulk action
    const [bulkSaving, setBulkSaving] = useState(false);

    // useCallback keeps it same function between redraws so it doesnt restart every time
    const load = useCallback(async () => { 
        try {
            const res = await authFetch(`${API_URL}/api/contests/${contestId}/entries`); // fetches the contest's entries
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setEntries(data);
            setProblem("");
            if (onChange) onChange(); // let rest of page know the entries changed.
        } catch (err) {
            setProblem(err.message);
        }
    }, [contestId, onChange]);

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
        const res = await authFetch(`${API_URL}/api/entries/${entryId}/decision`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({decision}),
        });
        if (!res.ok) setProblem((await res.json()).error);
        await load(); // refresh, so entry moves to its new group depending on the decision the creator made (shortlisted or rejected)
    }

    // ticks or unticks one entry.
    function toggle(entryId) {
        if (selected.includes(entryId)) { // is this entry already ticked? 
            // filter makes new list keeping all items except entry ID 
            setSelected(selected.filter((id) => id !== entryId)); // if its ticked, then untick it
        } else {
            // the spread (...) copies every item from selected, and entry ID is added at the end. 
            setSelected([...selected, entryId]); // otherwise if its NOT ticked, then tick it
        }
    }

    // SELECT ALL : ticks every entry in a list (or unticks them all, if they're all ticked)
    function selectAll(list) {
        let allTicked = true; // start by assuming each entry is ticked.
        for (const entry of list) {
            if (!selected.includes(entry.id)) allTicked = false; // if one entry is not ticked, allTicked becomes false.

        }
        const ids = [];
        for (const entry of list) ids.push(entry.id); // makes a list of just this group's IDs

        if (allTicked) { // if they're already all ticked, then untick them!
            setSelected(selected.filter((id) => !ids.includes(id)));
        } else { // otherwise, tick the whole group.
            const next = [...selected]; // copy into a new list
            for (const id of ids) {
                if (!next.includes(id)) next.push(id);
            }
            setSelected(next); // saves the new list
        }



    }

    // shortlists or rejects every ticked entry at once
    async function decideSelected(decision) {
        // rejecting flagged entries disqualifies them, so say so before doing it
        if (decision === "reject") {
            let flaggedCount = 0;
            for (const entry of entries) {
                if (selected.includes(entry.id) && isFlagged(entry)) flaggedCount++;
            }
            const message = 
                `Reject ${selected.length} ${selected.length === 1 ? "entry" : "entries"}` +
                (flaggedCount > 0
                    ? ` ${flaggedCount} of them ${flaggedCount === 1 ? "was" : "were"} flagged by screening, so ${flaggedCount === 1 ? "it" : "they"} will be disqualified and won't count toward the prizes you owe.`
                    : "") +
                " You can undo this until winners are paid.";
            if (!window.confirm(message)) return;   // if they dont confirm the message then just return.
        }
        setBulkSaving(true);

        try {
            // goes to the bulk route in index.js , which calls decideEntries in entries.js and actually updates the entry's status in Firestore
            const res = await authFetch(`${API_URL}/api/contests/${contestId}/decisions`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({entryIds: selected, decision}), // sends ticket IDs plus the decision (reject or shortlist)
            });
            if (!res.ok) setProblem((await res.json()).error);
            setSelected([]); // untick everything now
            await load(); // reload entries
        } catch {
          setProblem(`Couldn't save: ${err.message}`);  
        } finally {
            setBulkSaving(false);
        }
    }


    async function rescreen(entryId) {
        // screening takes a while, so dont wait for it; show as in progress and let polling follow along.
        authFetch(`${API_URL}/api/entries/${entryId}/screen?force=true`, {method: "POST"}).catch(() => {});
        setEntries((list) => list.map((e) => (e.id === entryId ? {...e, status: "screening", screeningStep: "transcribing"} : e)));
    }

    if (!entries) return <p className="notice">{problem || "Loading entries..."}</p>;
    const taste = trainTaste(entries);
    let tasteNote = "";
    if (taste.ready) {
        tasteNote = `Your taste: learned from your ${taste.decided} decisions in this contest. A guess to help you sort, never a rule.`;

    } else {
        tasteNote = `Your taste: after at least ${MIN_DECISIONS} decisions in this contest (with at 
        least one shortlist and one reject), each entry you haven't reviewed gets a guess at how you'd 
        decide, learned from your choices.`;

    }

    // cards only get the model once its ready
    let readyTaste = null;
    if (taste.ready) readyTaste = taste;


    return (
        <section>
            {problem && <p className="alert">{problem}</p>}
            {entries.length > 0 && <p className="hint taste-note">{tasteNote}</p>}
            {entries.length===0 && <p className="notice">No entries yet. Share your contest link to get some.</p>}

            {entries.length > 0 &&
                GROUPS.map((group) => {
                    const list = entries.filter((e) =>groupOf(e) === group.key);
                    if (list.length === 0 && !group.empty) return null;
                    return (
                        <div key={group.key} className="entry-group">
                        <div className="group-head">
                            <h3>
                                {group.title} <span className="muted">({list.length})</span>
                            </h3>
                            {/* quick selection, for groups whose entries can be decided */}
                            {list.length > 0 && group.key !== "screening" && group.key !== "error" && (
                                <div className="group-actions">
                                    <button className="btn-quiet" onClick={() => selectAll(list)}>Select all</button>
                                    {group.key === "review" && (
                                        <button className="btn-quiet" onClick={() => selectAll(list.filter(isHighRisk))}>
                                            Select high risk only
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                            {list.length === 0 ? (
                                <p className="hint">{group.empty}</p>
                            ) : (
                                <ul className="entry-list">
                                    {list.map((entry) => (
                                        <EntryCard
                                            key={entry.id}
                                            entry={entry}
                                            onDecide={decide}
                                            onRescreen={rescreen}
                                            selected={selected.includes(entry.id)}
                                            onToggle={() => toggle(entry.id)}
                                            taste={readyTaste}
                                        />                                    
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
                {/* the bulk bar: shows whenever anything is ticked, and stays at the bottom of the screen. */}
                {selected.length > 0 && (
                    <div className="bulk-bar" role="region" aria-label="Bulk actions">
                        <span><strong>{selected.length}</strong> selected</span>
                        <div className="actions">
                            <button className="btn-primary" disabled={bulkSaving} onClick={() => decideSelected("shortlist")}>Shortlist</button>
                            <button disabled={bulkSaving} onClick={() => decideSelected("reject")}>Reject</button>
                            <button className="btn-quiet" disabled={bulkSaving} onClick={() => setSelected([])}>Clear</button>
                        </div>
                    </div>
                )}
        </section>
    );
}