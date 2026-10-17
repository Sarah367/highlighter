import {useState} from "react";
import {API_URL} from "./api";
import {formatTime} from "./format";

// search box that finds every moment a word/phrase is said.

export default function TranscriptSearch({onResult, episodeIds}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState(null); // null means haven't searched yet.
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState("");

    async function search(e) {
        e.preventDefault(); // stop the form from reloading the page.
        if (!query.trim()) return;

        setSearching(true);
        setError("");
        try {
            const params = new URLSearchParams({q: query.trim()}); // builds address safely.
            if (episodeIds?.length) {
                params.set("episodes", episodeIds.join(","));
            }

            const res = await fetch(`${API_URL}/api/search?${params}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);
            setResults(data.results);
        } catch (err) {
            setError(err.message);
            setResults(null);

        } finally {
            setSearching(false); // turns off searching, whether it worked or not. 
        }
    }
    
    return (
        <section className="block">
        <h2>Search what was said</h2>
        <p>Find every moment a word or phrase comes up, then jump straight to it.</p>
    
        <form className="search" onSubmit={search}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Try a word or phrase, like "literally"' aria-label="Search transcripts" />
            <button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
            </button>
        </form>
    
        {error && <p className="alert">{error}</p>}
        {results && (
            <p className="hint">
            {results.length === 0
                ? "No matches. Try a different word or a shorter phrase."
                : `${results.length} moment${results.length === 1 ? "" : "s"} found${results.length >= 200 ? " (showing the first 200)" : ""}`}
            </p>
        )}
    
        {results?.length > 0 && (
            <ul className="rows">
            {results.map((r, i) => (
                <li key={i} className="result-item">
                <button className="result" onClick={() => onResult(r.episodeId, r.start)}>
                    <span className="result-meta">
                    {r.episodeTitle}, {formatTime(r.start)}
                    </span>
                    <span>
                    …{r.before} <mark>{r.match}</mark> {r.after}…
                    </span>
                </button>
                </li>
            ))}
            </ul>
        )}
        </section>
    );
}