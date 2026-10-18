import {useEffect, useState} from "react";
import { API_URL } from "./api";
import {formatMoney} from "./format";

const STATUS_LABELS = {
    draft: "Draft",
    open: "Open for entries",
    closed: "Closed",
    paid: "Winners paid",
};

const SOURCE_LABELS = {
    required: "Required: entries must use clips from your episodes",
    optional: "Optional: your episodes can be used, and original content is welcome",
    none: "None: entirely original work",

};

function placeLabel(n) {
    return ["1st", "2nd", "3rd"][n-1] ?? `${n}th`;
}

function formatLength(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (minutes) {
        parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    }
    if (seconds || !minutes) {
        parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
    }
    return parts.join(" ");
}

// One contest showing prize, rules, status. 
// Draft contests show where the funding goes.
export default function ContestView({contestId, presets, onBack}) {
    const [contest, setContest] = useState(null);
    const [problem, setProblem] = useState("");

    useEffect(() => {
        fetch(`${API_URL}/api/contests/${contestId}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setContest(data);
            })
            .catch((err) => setProblem(err.message));
    }, [contestId]);

    if (!contest) {
        return (
            <section>
                <button className="btn-quiet" onClick={onBack}>
                    Back to contests
                </button>
                <p className={problem ? "alert" : "notice"} style={{marginTop: 16}}>
                    {problem || "Loading contest..."}
                </p>
            </section>
        );
    }

    
}