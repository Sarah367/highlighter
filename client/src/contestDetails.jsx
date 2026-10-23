// shared pieces for showing a contest: used by the fan page (and can be by the creator's page too).
import {formatMoney} from "./format";

export const STATUS_LABELS = {
    draft: "Draft",
    open: "Open for entries",
    closed: "Closed",
    paid: "Winners paid",
};

const SOURCE_LABELS = {
    required: "Required: entries must use clips from the episodes below",
    optional: "Optional: you can use the episodes below, and original content is welcome",
    none: "None: entirely original work",
};

// 1 --> "1st", 2 --> "2nd", 3 --> "3rd", 4 --> "4th"
export function placeLabel(n) {
    return ["1st", "2nd", "3rd"][n-1] ?? `${n}th`;
}

// 45 --> "45 seconds", 600 --> "10 minutes", 90 --> "1 minute 30 seconds"
export function formatLength(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (seconds || !minutes) parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// How long until the deadline, in words: "6 days left", "5 hours left", "Ended"
export function timeLeft(deadline) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const minutes = Math.ceil(ms / (60 * 1000));
  return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
}

export function PrizeList({prizesCents, prizeTotalCents}) {
    return (
        <ul className="rows">
            {prizesCents.map((cents,i) => (
                <li key={i} className="row">
                    <span className="row-main">{placeLabel(i+1)} place</span>
                    <span>{formatMoney(cents)}</span>
                </li>
            ))}
            <li className="row">
                <span className = "row-main total">Prize pool</span>
                <span className = "total">{formatMoney(prizeTotalCents)}</span>
            </li>
        </ul>
    );
}

export function RulesList({contest}) {
    const formats = contest.entryFormats.map((f) => (f === "video" ? "Video" : "Audio")).join(" or ");
    return (
        <dl className="details">
            <dt>Entry format</dt>
            <dd>{formats}</dd>

            <dt>Length</dt>
            <dd>
                {formatLength(contest.minLengthSec)} to {formatLength(contest.maxLengthSec)}
            </dd>

            <dt>Entries per fan</dt>
            <dd>{contest.maxEntriesPerFan}</dd>

            <dt>Source material</dt>
            <dd>{SOURCE_LABELS[contest.sourceRule]}</dd>

            {contest.fakeQuoteCheck && (
                <>
                    <dt>Fake quotes</dt>
                    <dd>Not allowed: edits that make the creator say things they never said are flagged.</dd>
                </>
            )}
        </dl>
    );
}