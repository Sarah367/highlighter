import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { API_URL } from "./api";
import { formatTime } from "./format";

const STATUS_LABELS = {
    uploaded: "Not transcribed",
    transcribing: "Transcribing...",
    ready: "Ready",
    error: "Failed",
};

export default function EpisodeList({onOpen}) {
    const [episodes, setEpisodes] = useState([]);
    const [loadError, setLoadError] = useState("");

    // live listener; list updates by itself when an episode is added or its status is changed
    // via "onSnapshot"
    useEffect(() => {
        const q = query(collection(db, "episodes"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => setEpisodes(snapshot.docs.map((d) => ({id: d.id, ...d.data()}))),
            (err) => setLoadError(err.message)
        );
        return unsubscribe; // stop listening when this component disappears.
    }, []);

    async function transcribe(id) {
        try {
            const res = await fetch(`${API_URL}/api/episodes/${id}/transcribe`, {method: "POST"});
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
        } catch (err) {
            alert(`Transcription failed: ${err.message}`);
        }
    }

    if (loadError) return <p>Couldn't load episodes: {loadError}</p>;

    return (
        <section className="block">
        <h2>Your episodes</h2>
        {loadError && <p className="alert">Couldn't load episodes: {loadError}</p>}
        {!loadError && episodes.length === 0 && <p>No episodes yet. Upload your first one above.</p>}
    
        {episodes.length > 0 && (
            <ul className="rows">
            {episodes.map((ep) => (
                <li key={ep.id} className="row">
                <div className="row-main">
                    <span className="row-title">{ep.title}</span>
                    <div className="meta">
                    <span className={`status status-${ep.status}`}>{STATUS_LABELS[ep.status] ?? ep.status}</span>
                    {ep.durationSec ? <span>{formatTime(ep.durationSec)}</span> : null}
                    {ep.wordCount ? <span>{ep.wordCount.toLocaleString()} words</span> : null}
                    {ep.status === "error" && ep.error ? <span>{ep.error}</span> : null}
                    </div>
                </div>
                {(ep.status === "uploaded" || ep.status === "error") && (
                    <button onClick={() => transcribe(ep.id)}>{ep.status === "error" ? "Retry" : "Transcribe"}</button>
                )}
                <button onClick={() => onOpen(ep.id)}>Open</button>
                </li>
            ))}
            </ul>
        )}
        </section>
    );
}