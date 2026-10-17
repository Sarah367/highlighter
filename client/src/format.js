// turns seconds into a readable time
export function formatTime(totalSeconds) {
    const s = Math.floor(totalSeconds ?? 0);
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = String(s%60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;

}

// Turns cents into dollars for display: 17500 -> "$175.00"
export function formatMoney(cents) {
  return ((cents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}