import { useState } from "react";
import { ref, uploadBytesResumable } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "./firebase";
import { API_URL } from "./api";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB, same limit as Storage rules; just gives friendly message when user uploads more than 500 MB.

// formats that play and jump properly in every major browser.
const PLAYABLE_FORMATS = ["mp4", "mov", "m4v", "webm", "mp3", "m4a", "wav", "aac", "ogg"];

export default function EpisodeUpload() {
    const [title, setTitle] = useState("");
    const [file, setFile] = useState(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("idle"); // uploading, done, or error.
    const [message, setMessage] = useState("");
    const [inputKey, setInputKey] = useState(0); // trick to clear the file picker.

    function handleFileChange(e) {
        const chosen = e.target.files[0];
        if (!chosen) return;
        const extension = chosen.name.split(".").pop().toLowerCase();
        if (!PLAYABLE_FORMATS.includes(extension)) {
            setFile(null);
            setMessage(
                `.${extension} files don't play properly in every browser. Please upload MP4, MOV, WebM, MP3, M4A, or WAV. ` +
                "(Recorded with OBS? File → Remux Recordings converts MKV to MP4 in seconds.)"
            );
            return;
        }
        if (chosen.size > MAX_BYTES) {
            setFile(null);
            setMessage("The file is over 500 MB. Try a shorter episode.");
            return;
        }
        setFile(chosen);
        setMessage("");
    }

    function handleUpload() {
        if (!title.trim() || !file) {
            setMessage("Add a title and choose a file first.");
            return;
        }

        // upload the file straight from the browser to Firebase Storage. 
        const storagePath = `episodes/${Date.now()}-${file.name}`; // date.now() makes path unique
        const task = uploadBytesResumable(ref(storage, storagePath), file, {
            contentType: file.type, // video or audio.
        });

        setStatus("uploading"); // switch to uploading now
        setProgress(0); // reset progress to 0
        setMessage("");

        task.on(
            "state_changed",
            // runs many times during the upload: update the progress bar.
            (snapshot) => {
                setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) *100));
            },
            // throw an error if the upload somehow fails.
            (error) => {
                setStatus("error");
                setMessage(`Upload failed: ${error.message}`);
            },
            // runs once upload finishes. 
            // Saves record of the episode in Firestore.
            async () => {
                try {
                    const docRef = await addDoc(collection(db, "episodes"), {
                        title: title.trim(),
                        fileName: file.name,
                        storagePath,
                        contentType: file.type,
                        sizeBytes: file.size,
                        status: "uploaded", // transcribed/ready will be later.
                        createdAt: serverTimestamp(),
                    });
                    // start transcription automatically
                    fetch(`${API_URL}/api/episodes/${docRef.id}/transcribe`, {method: "POST"}).catch(() => {});
                    setStatus("done");
                    setMessage("Saved! Transcription has started.");
                    setTitle("");
                    setFile(null);
                    setInputKey((k) => k+1);
                } catch (error) {
                    setStatus("error");
                    setMessage(`The file uploaded, but saving the episode failed: ${error.message}`);
                }
            }
        );
    }
    const uploading = status === "uploading";

    return (
        <section className="panel">
        <h2>Upload an episode</h2>
        <div className="stack">
            <label className="field">
            <span className="label">Episode title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode 12: The road trip" disabled={uploading} />
            </label>
    
            <label className="field">
            <span className="label">Video or audio file</span>
            <input key={inputKey} type="file" accept=".mp4,.mov,.m4v,.webm,.mp3,.m4a,.wav,.aac,.ogg" onChange={handleFileChange} disabled={uploading} />
            <span className="hint">MP4, MOV, WebM, MP3, M4A or WAV, up to 500 MB. For long episodes, upload the audio file.</span>
            </label>
    
            {uploading && (
            <div className="field">
                <progress value={progress} max="100" />
                <span className="hint">Uploading… {progress}%</span>
            </div>
            )}
    
            {message && <p className={status === "error" ? "alert" : "notice"}>{message}</p>}
    
            <div className="actions">
            <button className="btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload episode"}
            </button>
            </div>
        </div>
        </section>
    );
}