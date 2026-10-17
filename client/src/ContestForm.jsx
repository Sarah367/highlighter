import {useEffect, useState} from "react";
import {API_URL} from "./api";
import {formatMoney} from "./format";

// starting values for a custom contest (and before any preset is picked)
const CUSTOM_DEFAULTS = {
    entryFormats: ["video"],
    minLengthSec: 15,
    maxLengthSec: 600,
    sourceRule: "optional",
    fakeQuoteCheck: true,
    maxEntriesPerFan: 1,
};

// three options 
const SOURCE_OPTIONS = [
    { value: "required", label: "Required", hint: "Entries must use clips from your episodes (compilations)." },
    { value: "optional", label: "Optional", hint: "Fans can use your episodes, but original content is welcome (roasts, music videos)." },
    { value: "none", label: "None", hint: "Entirely original work." },
];

function oneWeekFromNow() {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function placeLabel(n) {
    return ["1st", "2nd", "3rd"][n-1] ?? `${n}th`;
}

export default function ContestForm({presets, onCreated}) {
    const [presetKey, setPresetKey] = useState("custom");
    const [title, setTitle] = useState("");
    const [brief, setBrief] = useState("");
    const [settings, setSettings] = useState(CUSTOM_DEFAULTS);
    const [useAllEpisodes, setUseAllEpisodes] = useState(true);
    const [selectedEpisodeIds, setSelectedEpisodeIds] = useState([]);
    const [episodes, setEpisodes] = useState([]);
    const [deadline, setDeadline] = useState(oneWeekFromNow());
    const [prizes, setPrizes] = useState(["100", "50", "25"]); // just placeholder text while typing
    const [errors, setErrors] = useState([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");


// creator's transcribed episodes, in case they want to narrow the scope of the contest.
// will only be needed if creator unchecks "Use all my episodes" or something like that.
useEffect(() => {
    fetch(`${API_URL}/api/episodes`)
        .then((res) => res.json())
        .then((list) => setEpisodes(list.filter((ep) => ep.status === "ready")))
        .catch(() => setEpisodes([]));
}, []);

// picking a preset fills in its settings. Everything else stays editable.
function choosePreset(key) {
    setPresetKey(key);
    if (key === "custom") return; // keep whatever is already filled in
    const {label, ...values} = presets[key]; // everything except the label since label isnt a setting.
    setSettings(values);
}

function update(field, value) {
    setSettings((s) => ({ ...s, [field]: value}));
}

function toggleFormat(format) {
    const has = settings.entryFormats.includes(format);
    update("entryFormats", has ? settings.entryFormats.filter((f) => f !== format) : [...settings.entryFormats, format]);

}

function toggleEpisode(id) {
    setSelectedEpisodeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
}

// shown live as the creator types (display only). real total is calculated by server...
const totalCents = prizes.reduce((sum, p) => sum + Math.round(Number(p || 0) * 100), 0);

async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErrors([]);
    setMessage("");

    const body = {
        title,
        brief,
        preset: presetKey,
        ...settings,
        eligibleEpisodeIds: useAllEpisodes ? null : selectedEpisodeIds, // episodes are null unless specific ones are picked.
        deadline: deadline ? new Date(deadline).toISOString() : "",
        prizes: prizes.map(Number),
    };

    try {
        const res = await fetch(`${API_URL}/api/contests`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
            setErrors(data.details ?? [data.error]);
            return;
        }

        setMessage(`Saved "${data.title}" as a draft. Next, you'll fund the prize pool with PayPal.`);
        setTitle("");
        setBrief("");
        onCreated(data);
    }catch(err) {
        setErrors([err.message]);

    } finally {
        setSaving(false);
    }
}


    const fieldStyle = { display: "grid", gap: 4 };
    const boxStyle = { border: "1px solid #ccc", borderRadius: 8, padding: 12, display: "grid", gap: 8 };

  return (
    <section className="panel">
      <h2>Create a contest</h2>
 
      <form onSubmit={save} className="stack" style={{ gap: 24 }}>
        <fieldset>
          <legend>Start from a preset</legend>
          <div className="chips">
            {[["custom", { label: "Custom" }], ...Object.entries(presets)].map(([key, p]) => (
              <button key={key} type="button" className="chip" aria-pressed={presetKey === key} onClick={() => choosePreset(key)}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Optional. A preset fills in the settings below, and you can change any of them.
          </p>
        </fieldset>
 
        <div className="stack">
          <label className="field">
            <span className="label">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Best roast music video" />
          </label>
          <label className="field">
            <span className="label">Brief</span>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder="Make the funniest roast music video about me using clips from this month's episodes."
            />
            <span className="hint">Tell fans what you want them to make.</span>
          </label>
        </div>
 
        <fieldset className="form-section">
          <legend>Entries</legend>
          <div className="stack">
            <div className="check-row">
              {["video", "audio"].map((format) => (
                <label key={format} className="check">
                  <input type="checkbox" checked={settings.entryFormats.includes(format)} onChange={() => toggleFormat(format)} />
                  {format === "video" ? "Video" : "Audio"}
                </label>
              ))}
            </div>
            <div className="grid-3">
              <label className="field">
                <span className="label">Minimum length</span>
                <input type="number" min="0" value={settings.minLengthSec} onChange={(e) => update("minLengthSec", Number(e.target.value))} />
                <span className="hint">Seconds</span>
              </label>
              <label className="field">
                <span className="label">Maximum length</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="0.5"
                  value={settings.maxLengthSec / 60}
                  onChange={(e) => update("maxLengthSec", Math.round(Number(e.target.value) * 60))}
                />
                <span className="hint">Minutes</span>
              </label>
              <label className="field">
                <span className="label">Entries per fan</span>
                <input type="number" min="1" max="10" value={settings.maxEntriesPerFan} onChange={(e) => update("maxEntriesPerFan", Number(e.target.value))} />
                <span className="hint">1 to 10</span>
              </label>
            </div>
          </div>
        </fieldset>
 
        <fieldset className="form-section">
          <legend>Source material</legend>
          {SOURCE_OPTIONS.map((opt) => (
            <label key={opt.value} className="option">
              <input type="radio" name="sourceRule" checked={settings.sourceRule === opt.value} onChange={() => update("sourceRule", opt.value)} />
              <span>
                <strong>{opt.label}</strong>
                <span className="hint">{opt.hint}</span>
              </span>
            </label>
          ))}
 
          <div className="stack" style={{ marginTop: 12 }}>
            {settings.sourceRule !== "none" && (
              <>
                <label className="check">
                  <input type="checkbox" checked={useAllEpisodes} onChange={(e) => setUseAllEpisodes(e.target.checked)} />
                  Use all my episodes
                </label>
                {!useAllEpisodes && (
                  <div className="stack" style={{ gap: 8, paddingLeft: 26 }}>
                    {episodes.length === 0 && <span className="hint">No transcribed episodes yet.</span>}
                    {episodes.map((ep) => (
                      <label key={ep.id} className="check">
                        <input type="checkbox" checked={selectedEpisodeIds.includes(ep.id)} onChange={() => toggleEpisode(ep.id)} />
                        {ep.title}
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
 
            <label className="check" style={{ opacity: settings.sourceRule === "none" ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={settings.sourceRule !== "none" && settings.fakeQuoteCheck}
                disabled={settings.sourceRule === "none"}
                onChange={(e) => update("fakeQuoteCheck", e.target.checked)}
              />
              Flag fake quotes: edits that make me say things I never said
            </label>
          </div>
        </fieldset>
 
        <fieldset className="form-section">
          <legend>Deadline and prizes</legend>
          <div className="stack">
            <label className="field">
              <span className="label">Deadline</span>
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
 
            <div className="field">
              <span className="label">Prizes</span>
              <div className="stack" style={{ gap: 8 }}>
                {prizes.map((amount, i) => (
                  <div key={i} className="prize-row">
                    <span className="muted">{placeLabel(i + 1)}</span>
                    <div className="money">
                      <span>$</span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={amount}
                        aria-label={`${placeLabel(i + 1)} place prize`}
                        onChange={(e) => setPrizes((list) => list.map((p, j) => (j === i ? e.target.value : p)))}
                      />
                    </div>
                    {prizes.length > 1 ? (
                      <button type="button" className="btn-quiet" onClick={() => setPrizes((list) => list.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
              <div className="actions" style={{ justifyContent: "space-between", marginTop: 4 }}>
                {prizes.length < 10 ? (
                  <button type="button" className="btn-quiet" onClick={() => setPrizes((list) => [...list, ""])}>
                    Add a prize
                  </button>
                ) : (
                  <span />
                )}
                <span className="total">Prize pool {formatMoney(totalCents)}</span>
              </div>
            </div>
          </div>
        </fieldset>
 
        {errors.length > 0 && (
          <div className="alert" role="alert">
            <strong>Fix these to save:</strong>
            <ul>
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}
        {message && <p className="notice">{message}</p>}
 
        <div className="actions form-section">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save as draft"}
          </button>
          <span className="hint">You'll fund the prize pool with PayPal next.</span>
        </div>
      </form>
    </section>
  );
}