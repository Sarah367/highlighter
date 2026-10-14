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
        <section style={{maxWidth: 640, marginTop: 32}}>
            <h2>Episodes</h2>
            {episodes.length === 0 && <p>No episodes yet. Upload one above.</p>}
            <ul style={{listStyle: "none", padding: 0, display: "grid", gap: 8}}>
                {episodes.map((ep) => (
                    <li
                        key={ep.id}
                        style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12, display: "flex", gap: 12, alignItems: "center", textAlign: "left" }}
                    >
                        <div style={{ flex: 1 }}>
                        <strong>{ep.title}</strong>
                        <div style={{ fontSize: 14, opacity: 0.75 }}>
                            {STATUS_LABELS[ep.status] ?? ep.status}
                            {ep.durationSec ? ` · ${formatTime(ep.durationSec)} · ${ep.wordCount} words` : ""}
                            {ep.status === "error" && ep.error ? ` · ${ep.error}` : ""}
                        </div>
                        </div>
                        {(ep.status === "uploaded" || ep.status === "error") && (
                        <button onClick={() => transcribe(ep.id)}>{ep.status === "error" ? "Retry" : "Transcribe"}</button>
                        )}
                        <button onClick={() => onOpen(ep.id)}>Open</button>
                    </li>
                ))}
            </ul>
        </section>
    );
}