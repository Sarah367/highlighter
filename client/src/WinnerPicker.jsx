import {useEffect, useState} from "react";
import { API_URL, authFetch } from "./api";
import {formatMoney} from "./format";
import {placeLabel} from "./contestDetails";

// picking winnners for a closed contest: one entry for each prize place, from 1st place down
// server enforces every rule too; this is just UI...
// version: goes up whenever entries change (like a review decision) , so options reload 

export default function WinnerPicker({contestId, version}) {
    const [options, setOptions] = useState(null);  // from the server: who can win, how many winners, whats blocking
    const [choices, setChoices] = useState([]);// entry ID chosen for each place ("" = not chosen yet)
    const [problem, setProblem] = useState(""); 
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);

    // reloads after contestId (switching to a different contest in the dropdown) or version
    // (shortlist or reject a contest) is done. 
    useEffect(() => {
        // sends request to winnerOptions function in winners.js, which sorts every entry in buckets and gives:
        // candidates in good standing, how many winners are needed, whats blocking (still screening, needs review),
        // the prize amounts, and any saved winners. 
        authFetch(`${API_URL}/api/contests/${contestId}/winner-options`)  
            .then(async (res) => {
                const data = await res.json(); // gets server's candidates
                if (!res.ok) throw new Error(data.error);
                setOptions(data); // remember the options

                // keep creator's choices when the options reload, as long as each one can still win.
                // otherwise, start from the saved winners (if any)
                setChoices((previous) => { // previous is the current choices so far
                    // true when this entry is still in good standing (one of the candidates).
                    function canWin(entryId) {
                        for (const c of data.candidates) {
                            if (c.id === entryId) return true;
                        }
                        return false;
                    }

                    const next = [];
                    for (let place=0; place < data.winnersNeeded; place++) {
                        const current = previous[place]; // whats picked on screen right now (not saved yet)
                        let saved = ""; // the winner saved earlier for this place, if any
                        if (data.winners && data.winners[place]) saved = data.winners[place].entryId;

                        if (current && canWin(current)) next.push(current); // keep the creator's current pick
                        else if (saved && canWin(saved)) next.push(saved); // or fall back to the saved winner
                        else next.push(""); // or nothing chosen yet.
                    }
                    return next;
                });
            })
            .catch((err) => setProblem(err.message));
    }, [contestId, version]); 

    function choose(place, entryId) {
        const next = [...choices];
        next[place] = entryId;
        setChoices(next);
        setMessage("");
    }
    async function save() {
        setSaving(true);
        setProblem("");
        setMessage("");
        try {
            const res = await authFetch(`${API_URL}/api/contests/${contestId}/winners`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({entryIds: choices}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setOptions({...options, winners: data.winners});
            setMessage("Winners saved. Next, you'll pay them with PayPal.");
        } catch (err) {
            setProblem(err.message);
        } finally {
            setSaving(false);
        }
    }
    if (!options) { // perhaps still loading? or there is a problem
        return <p className="notice">{problem || "Loading winner options..."}</p>;
    }
    // anything that has to happen before winners can be picked

    // blocked is true if any entry is still being screened, or any flagged entry hasn't been reviewed yet.
    const blocked = options.stillScreening > 0 || options.needsReview > 0;

    // adds up every prize, used in the "full refund" message if nobody can win.
    let totalCents = 0;
    for (const cents of options.prizesCents) totalCents += cents;

    // lower prizes nobody is left to win: refunded to the creator: "$x in lower prizes will be refunded to you"
    let unusedCents = 0;
    // starts at amount of winners, and then goes till the rest
    // 2 winners, so i = 2... there are 3 prize places, so 2 < 3, meaning that only the 3rd place wasn't filled.
    for (let i = options.winnersNeeded; i < options.prizesCents.length; i++) {
        unusedCents += options.prizesCents[i];
    }

    //how many entries the creator didn't reject. If that's fewer than the winners needed,
    // some winners will have to be entries they rejected for taste
    let notRejected = 0;
    for (const c of options.candidates) {
        if (!c.rejected) notRejected++;
    }

    let allChosen = true;
    for (const chosen of choices) {
        if (!chosen) allChosen = false;
    }
    return (
        <section className="panel">
            <h2>Pick your winners</h2>
            <div className="stack">
            <p>Choose one entry for each prize, from 1st place down. Every prize goes to an entry, as long as there are entries in good standing to award it to.</p>
            
            {options.stillScreening > 0 && (
                <p className="notice">
                    {options.stillScreening === 1 ? "1 entry is" : `${options.stillScreening} entries are`} still being screened. You can pick winners once screening finishes.
                </p>
            )}
            {options.needsReview > 0 && !options.stillScreening && (
                <p className="notice">
                    {options.needsReview === 1
                        ? "First, review the flagged entry below: shortlist or reject it."
                        : `First, review the ${options.needsReview} flagged entries below: shortlist or reject each one.`}
                </p>
            )}
            {options.stillScreening > 0 ? null : options.winnersNeeded === 0 ? (
                <p className="notice">
                    First, review the {options.needsReview === 1 ? "flagged entry" : `${options.needsReview} flagged entries`} below: shortlist or reject each one.
                </p>    
            
            ) : (
                <div className="stack">
                    {choices.map((chosen, place) => (
                        <label key={place} className="winner-row">
                            <span className="winner-place">
                                {placeLabel(place + 1)} place <span className="muted">{formatMoney(options.prizesCents[place])}</span>
                            </span>
                            <select value={chosen} onChange={(e) => choose(place, e.target.value)} disabled={blocked}>
                                <option value="">Choose an entry...</option>
                                {options.candidates.map((c) => {
                                    // an entry already chosen for a different place can't win twice.
                                    const takenElsewhere = choices.includes(c.id) && chosen !== c.id;
                                    return (
                                        <option key={c.id} value={c.id} disabled={takenElsewhere}>
                                            {c.title}, by {c.fanName}
                                            {c.rejected ? " (you rejected this one)" : ""}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>
                    ))}
            </div>
            )}

            {options.winnersNeeded > 0 && unusedCents > 0 && (
                <p className="hint">
                    Only {options.winnersNeeded === 1 ? "1 entry is" : `${options.winnersNeeded} entries are`} in good standing, so {formatMoney(unusedCents)} in lower prizes will be refunded to you.
                </p>
            )}
            {notRejected < options.winnersNeeded && (
                <p className="hint">
                    Some winners will have to be entries you rejected. Screening didn't flag them, so they still count toward the prizes you promised.
                </p>
            )}
            {problem && <p className="alert">{problem}</p>}
            {message && <p className="notice">{message}</p>}
 
            <div className="actions">
                <button className="btn-primary" onClick={save} disabled={blocked || saving || !allChosen}>
                    {saving ? "Saving..." : options.winnersNeeded === 0 && !options.stillScreening ? "Confirm no winners" : "Save winners"}
                </button>
            </div>
            </div>
        </section>
    )
}