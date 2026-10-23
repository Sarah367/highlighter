import {useEffect, useMemo, useRef, useState} from "react";
import {doc, onSnapshot} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import {db, storage} from "./firebase";
import {API_URL} from "./api";
import {formatTime} from "./format";

// groups words into sentences, so long transcripts are readable
function toSentences(words) {
    const sentences = [];
    let current = [];
    for (const w of words) {
        current.push(w);
        if (/[.?!]$/.test(w.word) || current.length >= 40) {
            sentences.push(current);
            current = [];
        }
    }
    // gets any leftover sentences from current
    if (current.length) sentences.push(current);
    return sentences.map((ws) => ({ start: ws[0].start, words: ws, text: ws.map((w) => w.word).join(" ") }));
}

export default function EpisodeView({episodeId, startAt = 0, onBack, backLabel="Back to episodes"}) {
    const [episode, setEpisode] = useState(null);
    const [mediaUrl, setMediaUrl] = useState("");
    const [words, setWords] = useState([]);
    const [problem, setProblem] = useState("");
    const [currentTime, setCurrentTime] = useState(0);
    const mediaRef = useRef(null); // handle on the <video> or <audio> element
    const listRef = useRef(null); // a handle on the scrolling transcript box.

    // 1. watch the episode's record live, so status changes appear immediately.
    useEffect(() => {
        return onSnapshot(
        doc(db, "episodes", episodeId),
        (snap) => {
            if (snap.exists()) {
            setEpisode({ id: snap.id, ...snap.data() });
            } else {
            setProblem(`No episode found with ID "${episodeId}".`);
            }
        },
        (err) => setProblem(err.message) // e.g. a permissions or database error
        );
    }, [episodeId]);

    // get playable link to the file in Storage.
    useEffect(() => {
        if (!episode?.storagePath) return;
        getDownloadURL(ref(storage, episode.storagePath))
            .then(setMediaUrl)
            .catch((err) => setProblem(err.message));
    }, [episode?.storagePath]);

    // once episode is ready, load its transcript from the server.
    useEffect(() => {
        if (episode?.status !== "ready") return;
        fetch(`${API_URL}/api/episodes/${episodeId}/transcript`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setWords(data.words);
            })
            .catch((err) => setProblem(err.message));
    }, [episodeId, episode?.status]);

    // if opened from a search result, jump to that moment once the player is ready.
    useEffect(() => {
        const media = mediaRef.current;
        if (!media || !mediaUrl || startAt <= 0) return;

        function seek() {
            media.currentTime = Math.max(0, startAt-1); // a second early, to hear the audio
            media.play().catch(() => {}); // some browsers block autoplay; just make the user press play.
        }

        if (media.readyState >= 1) {
            seek();
        } else {
            media.addEventListener("loadedmetadata", seek, { once: true });
            return () => media.removeEventListener("loadedmetadata", seek);
        }
    }, [mediaUrl, startAt]);



    // only recalculate sentences when the words change
    const sentences = useMemo(() => toSentences(words), [words]);

    // sentence being played right now: last one that started before currentTime.
    let activeIndex = -1;
    for (let i = 0; i < sentences.length; i++) {
        if (sentences[i].start <= currentTime) activeIndex = i;
        else break;
    }

    // keep the playing sentence in view if it's above or below the visible part
    // of the transcript box, scroll the box so it sits about a third of the way down.
    useEffect(() => {
        const list = listRef.current;
        const el = list?.querySelector(`[data-index="${activeIndex}"]`);
        if (!list || !el) return;

        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        const visibleTop = list.scrollTop;
        const visibleBottom = visibleTop + list.clientHeight;

        if (top < visibleTop || bottom > visibleBottom) {
            list.scrollTo({ top: top - list.clientHeight / 3, behavior: "smooth" });
        }
    }, [activeIndex]);

    function jumpTo(seconds) {
        const media = mediaRef.current;
        if (!media)return;
        media.currentTime = seconds;
        media.play();
    }

    if (!episode) {
        return (
            <section>
                <button className="btn-quiet" onClick={onBack}>
                    {backLabel}
                </button>
                <p className={problem ? "alert" : "notice"} style={{ marginTop: 16 }}>
                    {problem || "Loading episode…"}
                </p>
            </section>
        );
    }
    const MediaTag = episode.contentType?.startsWith("audio/") ? "audio" : "video";

    return (
        <section>
        <button className="btn-quiet" onClick={onBack}>
            {backLabel}
        </button>
        <div className="page-head" style={{ marginTop: 8 }}>
            <h1>{episode.title}</h1>
        </div>
    
        {mediaUrl && (
            <MediaTag
            ref={mediaRef}
            className="player"
            src={mediaUrl}
            controls
            onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
            />
        )}
    
        <div className="block" style={{ marginTop: 40 }}>
            <h2>Transcript</h2>
            <p>Click any sentence or word to jump there.</p>
    
            {episode.status === "transcribing" && <p className="notice">Transcribing. The transcript will appear here by itself.</p>}
            {episode.status === "uploaded" && <p className="notice">Not transcribed yet. Go back and click Transcribe.</p>}
            {episode.status === "error" && <p className="alert">Transcription failed. Go back and click Retry.</p>}
            {problem && <p className="alert">{problem}</p>}
    
            {sentences.length > 0 && (
            <div ref={listRef} className="transcript">
                {sentences.map((s, i) => (
                <p key={i} data-index={i} className={`sentence${i === activeIndex ? " active" : ""}`} onClick={() => jumpTo(s.start)}>
                    <span className="ts">{formatTime(s.start)}</span>
                    {i === activeIndex
                    ? s.words.map((w, j) => (
                        <span
                            key={j}
                            className={`word${currentTime >= w.start && currentTime < w.end ? " current" : ""}`}
                            onClick={(e) => {
                            e.stopPropagation(); // don't also trigger the sentence's click
                            jumpTo(w.start);
                            }}
                        >
                            {w.word}{" "}
                        </span>
                        ))
                    : s.text}
                </p>
                ))}
            </div>
            )}
        </div>
        </section>
    );
}