import {useState} from "react";
import {ref, uploadBytesResumable} from "firebase/storage";
import {collection, addDoc, serverTimestamp} from "firebase/firestore";
import {db, storage} from "./firebase";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB, same limit as Storage rules; just gives friendly message when user uploads more than 500 MB.

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
                    setStatus("done");
                    setMessage(`Saved! Episode ID: ${docRef.id}`); // lets user know file is saved to database
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
        <section style={{ maxWidth: 480, display: "grid", gap: 12}}>
            <h2>Upload an episode</h2>

            <label style={{display: "grid", gap: 4}}>
                Episode title
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Episode 1: The Pilot"
                    disabled={uploading} // nobody can change the title halfway through
                />
                <small>For long episodes, upload the audio file.</small>
            </label>

            <label style={{display: "grid", gap: 4}}>
                Video or audio file
                <input
                    key={inputKey}
                    type="file"
                    accept="video/*,audio/*"
                    onChange={handleFileChange}
                    disabled={uploading}
            />
            </label>
            {/* button is disabled when uploading */}
            <button onClick={handleUpload} disabled={uploading}> 
                {uploading ? "Uploading..." : "Upload Episode"}
            </button>
            {uploading && (
                <div>
                    <progress value={progress} max="100" style={{width: "100%"}} /> {progress}%
                </div>
            )}
            {message && <p>{message}</p>}
        </section>
    );
}