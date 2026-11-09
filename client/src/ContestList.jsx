import {useEffect, useState} from "react";
import { API_URL, authFetch } from "./api";
import {formatMoney} from "./format";

const STATUS_LABELS = {
    draft: "Draft",
    open: "Open for entries",
    closed: "Closed",
    paid: "Winners paid",
};

// creator's contests (newest first). reloads when refreshKey changes.
// onOpen(id) runs when a contest's Open button is clicked by the user.
export default function ContestList({presets, refreshKey, onOpen}) {
    const [contests, setContests] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        authFetch(`${API_URL}/api/contests`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setContests(data);
            })
            .catch((err) => setError(err.message));
    }, [refreshKey]);

    if (error) return <p>Couldn't load contests: {error}</p>;
    if (!contests) return <p>Loading contests...</p>;


    // one card per contest.
    return (
        <section className="block">
          <h2>Your contests</h2>
          {error && <p className="alert">Couldn't load contests: {error}</p>}
          {!error && !contests && <p>Loading contests…</p>}
          {contests?.length === 0 && <p>No contests yet. Create your first one above.</p>}
     
          {contests?.length > 0 && (
            <ul className="rows">
              {contests.map((c) => {
                // an open contest past its deadline shows as closed, even before anything updates it in the database.
                const statusKey = c.closed && c.status === "open" ? "closed" : c.status;
                return (
                  <li key={c.id} className="row">
                    <div className="row-main">
                      <span className="row-title">{c.title}</span>
                      <div className="meta">
                        <span className={`status status-${statusKey}`}>{STATUS_LABELS[statusKey] ?? statusKey}</span>
                        <span>{presets[c.preset]?.label ?? "Custom"}</span>
                        <span>{formatMoney(c.prizeTotalCents)} in prizes</span>
                        <span>Ends {new Date(c.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                      </div>
                    </div>
                    <button onClick={() => onOpen(c.id)}>Open</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
    );
}

