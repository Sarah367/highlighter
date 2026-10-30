import {useEffect, useState} from "react";
import EntryReview from "./EntryReview";
import { API_URL } from "./api";

// entries tab: pick a contest, then review its entries
// contestId: which contest to show (set when arriving from a contest's "Review entries" button).
// onChangeContest(id): called when the creator picks a different contest
export default function EntriesPage({contestId, onChangeContest}) {
    const [contests, setContests]= useState(null);
    const [problem, setProblem] = useState("");

    // only funded contests can have entries, so drafts are left out of the list.

    useEffect(() => {
        fetch(`${API_URL}/api/contests`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setContests(data.filter((c) => c.status !== "draft"));
            })
            .catch((err) => setProblem(err.message));
    }, []);

    // if nothing is picked, start with newest funded contest (default)
    useEffect(() => {
        if (!contestId && contests?.length > 0) onChangeContest(contests[0].id);

    }, [contestId, contests, onChangeContest]);

    return (
        <>
            <div className="page-head">
                <h1>Entries</h1>
                <p>The AI flags possible problems. You make every call: shortlist or reject any entry, flagged or not.</p>
            </div>

            {problem && <p className="alert">Couldn't load contests: {problem}</p>}
            {!contests && !problem && <p className="notice">Loading contests...</p>}
            {contests?.length === 0 && (
                <p className="notice">No funded contests yet. Entries show up here once a contest is funded and fans start entering.</p>
            )}

            {contests?.length > 0 && (
                <>
                    <label className="field contest-picker">
                        <span className="label">Contest</span>
                        <select value={contestId ?? ""} onChange={(e) => onChangeContest(e.target.value)}>
                            {contests.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.title} ({(c.entryCount ?? 0).toLocaleString()} {c.entryCount === 1 ? "entry" : "entries"})
                                </option>
                            ))}
                        </select>
                    </label>

                    {/*key={contestId} gives each contest a fresh review screen, so switching never mixes up their entries.*/}
                    {contestId && <EntryReview key={contestId} contestId={contestId}/>}
                </>
            )}
        </>
    );
}