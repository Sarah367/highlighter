import {useState} from "react";
import {ref, uploadBytesResumable} from "firebase/storage";
import {storage} from "./firebase";
import {API_URL} from "./api";
import {formatLength} from "./contestDetails";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB , same as the server and the Storage rules
const EXTENSIONS = {video: ["mp4", "mov", "m4v", "webm"], audio: ["mp3", "m4a", "wav", "aac", "ogg"]};

// some computers don't report a file's type, so fall back to one based on its extension.
const TYPES = {
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg",
};

// Reads a video or audio file's length in the browser, before uploading. null if it can't tell.
function readDuration(file, isAudio) {
    return new Promise((resolve) => {
        const media = document.createElement(isAudio ? "audio" : "video");
        const url = URL.createObjectURL(file); // a temporary local address for the file
        media.preload = "metadata"; // only need file's details, not whole thing.
        media.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(Number.isFinite(media.duration) ? media.duration : null);
        };
        media.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        media.src = url;
    });
}

// Sends JSON to the server and returns its reply, or throws the server's error message.
async function postJson(path, body) {
    const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {"Content-Type" : "application/json"},
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export default function EntryForm({contest, onSubmitted}) {
    const allowed = contest.entryFormats.flatMap((format) => EXTENSIONS[format]);
    const [fanName, setFanName] = useState("");
    const [paypalEmail, setPaypalEmail] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [file, setFile] = useState(null);
    const [durationSec, setDurationSec] = useState(null);
    const [inputKey, setInputKey] = useState(0); // changing this clears the file picker.
    const [stage, setStage] = useState("form");
    const [progress, setProgress] = useState(0);
    const [problem, setProblem] = useState("");

    function rejectFile(message) {
        setProblem(message);
        setInputKey((k) => k+1);
    }


    // Check the file right away, so a wrong file is caught before a long upload...
    async function chooseFile(e) {
        const chosen = e.target.files[0];
        setFile(null);
        setDurationSec(null);
        setProblem("");
        if (!chosen) return;

        const extension = chosen.name.split(".").pop().toLowerCase();
        if (!allowed.includes(extension)) {
            return rejectFile(`This contest accepts ${allowed.map((x) => x.toUpperCase()).join(", ")} files.`);
        }

        if (chosen.size > MAX_BYTES) {
            return rejectFile("That file is over 2 GB. Export it at a lower quality, like 720p, and try again.");
        }

        const seconds = await readDuration(chosen, EXTENSIONS.audio.includes(extension));
        if (seconds !== null && (seconds < contest.minLengthSec || seconds > contest.maxLengthSec)) {
            return rejectFile(
                `Entries must be ${formatLength(contest.minLengthSec)} to ${formatLength(contest.maxLengthSec)} long. ` +
            `Yours is ${formatLength(Math.round(seconds))}.`
            );
        }
        setFile(chosen);
        setDurationSec(seconds);
    }

    async function submit(e) {
        e.preventDefault();
        setProblem("");
        if (!fanName.trim() || !paypalEmail.trim() || !file) {
            setProblem("Add your name, your PayPal email, and your entry file.");
            return;
        }

        try {
            // 1. check this fan can still enter, before uploading a possibly huge file.
            setStage("checking");
            await postJson(`/api/contests/${contest.id}/entries/check`, {paypalEmail});

            // 2. upload file straight to Firebase Storage, in this contest's folder.
            setStage("uploading");
            setProgress(0);
            const extension = file.name.split(".").pop().toLowerCase();
            const safeName = file.name.replace(/[^\w.-]/g, "-"); // spaces and symbols become dashes
            const storagePath = `entries/${contest.id}/${Date.now()}-${safeName}`;
            await new Promise((resolve, reject) => {
                const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type || TYPES[extension] });
                task.on(
                    "state_changed",
                    (snapshot) => setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
                    reject,
                    resolve
            );
        });


            // 3. ask the server to check every rule and save the entry.
            setStage("saving");
            const data = await postJson(`/api/contests/${contest.id}/entries`, {
                fanName,
                paypalEmail,
                title,
                description,
                storagePath,
                durationSec,
            });
            setStage("done");
            onSubmitted(data.entryCount);
        } catch (err) {
            setProblem(err.message);
            setStage("form");
        }
    }

    function enterAgain() {
        setTitle("");
        setDescription("");
        setFile(null);
        setDurationSec(null);
        setInputKey((k) => k+1);
        setStage("form");
    }

    if (stage === "done") {
        return (
        <div className="stack">
            <p>
            <strong>You're entered, {fanName.trim()}!</strong> The creator reviews entries after the deadline. If you win, your
            prize is sent by PayPal to {paypalEmail.trim()}.
            </p>
            {contest.maxEntriesPerFan > 1 && ( // if contest allows more than one entry 
            <div className="actions">
                <button onClick={enterAgain}>Submit another entry</button>
                <span className="hint">You can enter up to {contest.maxEntriesPerFan} times.</span>
            </div>
            )}
        </div>
        );
    }

    const busy = stage !== "form";
    const buttonText = {
        form: "Submit entry",
        checking: "Checking...",
        uploading: `Uploading... ${progress}%`,
        saving: "Saving...",
    }[stage];

    return (
            <form onSubmit={submit} className="stack">
        <div className="grid-2">
            <label className="field">
            <span className="label">Your name</span>
            <input value={fanName} onChange={(e) => setFanName(e.target.value)} placeholder="How you'll be credited" disabled={busy} />
            </label>
            <label className="field">
            <span className="label">PayPal email</span>
            <input
                type="email"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={busy}
            />
            <span className="hint">Where your prize is sent. Never shown publicly.</span>
            </label>
        </div>
    
        <label className="field">
            <span className="label">Your entry</span>
            <input key={inputKey} type="file" accept={allowed.map((x) => `.${x}`).join(",")} onChange={chooseFile} disabled={busy} />
            <span className="hint">
            {allowed.map((x) => x.toUpperCase()).join(", ")}, {formatLength(contest.minLengthSec)} to{" "}
            {formatLength(contest.maxLengthSec)}, up to 2 GB.
            {contest.maxLengthSec > 600 && " Long entries can be big files: if yours is over 2 GB, export it at a lower quality, like 720p."}
            </span>
        </label>
    
        <label className="field">
            <span className="label">Title (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} disabled={busy} />
        </label>
    
        <label className="field">
            <span className="label">Description (optional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} disabled={busy} />
        </label>
    
        {stage === "uploading" && <progress value={progress} max="100" />}
        {problem && <p className="alert">{problem}</p>}
    
        <div className="actions">
            <button type="submit" className="btn-primary" disabled={busy}>
            {buttonText}
            </button>
        </div>
        </form>
    );
}


