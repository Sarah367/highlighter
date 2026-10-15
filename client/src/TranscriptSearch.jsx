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
        <section style={{ maxWidth: 640, marginTop: 32, textAlign: "left" }}>
            <h2>Search what was said</h2>

            <form onSubmit={search} style={{ display: "flex", gap: 8 }}>
            <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='A word or phrase, like "literally"'
                style={{ flex: 1 }}
            />
            <button type="submit" disabled={searching}>
                {searching ? "Searching…" : "Search"}
            </button>
            </form>
            {error && <p>Problem: {error}</p>}
            {results && (
            <p>
                {results.length === 0
                ? "No matches."
                : `${results.length} moment${results.length === 1 ? "" : "s"} found${results.length >= 200 ? " (showing the first 200)" : ""}.`}
            </p>
            )}
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {results?.map((r, i) => (
            <li key={i}>
                <button
                onClick={() => onResult(r.episodeId, r.start)}
                style={{ width: "100%", textAlign: "left", padding: "8px 10px", cursor: "pointer" }}
                >
                <span style={{ opacity: 0.7, fontSize: 13 }}>
                    {r.episodeTitle} · {formatTime(r.start)}
                </span>
                <br />
                …{r.before} <mark>{r.match}</mark> {r.after}…
                </button>
            </li>
            ))}
        </ul>
        </section>
  );

}