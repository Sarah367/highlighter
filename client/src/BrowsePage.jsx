import {useEffect, useState} from "react";
import { Link } from "react-router-dom";
import { API_URL } from "./api";
import { formatMoney } from "./format";
import { timeLeft } from "./contestDetails";

// every contest that fans can enter right now. Public : no account needed
export default function BrowsePage() {
    const [contests, setContests]=useState(null);
    const [problem,setProblem]=useState("");

    useEffect(() => {
        fetch(`${API_URL}/api/public/contests`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setContests(data);
            })
            .catch((err) => setProblem(err.message));
    }, []);
    
    return (
        <>
            <div className="page-head">
                <h1>Open contests</h1>
                <p>Pick a contest, read the brief, and send in your edit. Prizes are funded up front with PayPal.</p>
            </div>
 
            {problem && <p className="alert">Couldn't load contests: {problem}</p>}
            {!contests && !problem && <p className="notice">Loading contests...</p>}
            {contests && contests.length === 0 && <p className="notice">No contests are open right now. Check back soon.</p>}
 
            {contests && contests.length > 0 && (
                <ul className="rows">
                    {contests.map((c) => {
                        const entries = c.entryCount || 0;
                        return (
                            <li key={c.id} className="row">
                                <div className="row-main">
                                    <span className="row-title">{c.title}</span>
                                    <div className="meta">
                                        <span>{formatMoney(c.prizeTotalCents)} in prizes</span>
                                        <span>{entries} {entries === 1 ? "entry" : "entries"}</span>
                                        <span>{timeLeft(c.deadline)}</span>
                                    </div>
                                </div>
                                <div className="row-actions">
                                    <Link className="button-link" to={`/c/${c.id}/episodes`}>Search episodes</Link>
                                    <Link className="button-link" to={`/c/${c.id}`}>View contest</Link>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
    
}