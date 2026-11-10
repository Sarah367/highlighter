import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL, authFetch } from "./api";
import { useAuth } from "./auth";
import { formatMoney } from "./format";
import {STATUS_LABELS, statusKeyOf, timeLeft} from "./contestDetails";
import {describe} from "./MyEntriesPage";

function Reveal({ children }) {
    const ref = useRef(null);
    const [shown, setShown] = useState(false);
 
    useEffect(() => {
        const element = ref.current;
        if (!element || !("IntersectionObserver" in window)) {
            setShown(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setShown(true);
                    observer.disconnect(); // only once: it stays visible after that
                }
            },
            { threshold: 0.15 } // when 15% of it is on screen
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
 
    return (
        <div ref={ref} className={shown ? "reveal is-shown" : "reveal"}>
            {children}
        </div>
    );
}
// two main buttons, depending on who's visiting
function MainButtons() {
    const { user, isCreator, loading } = useAuth();
    if (loading) return null; // wait until we know who's here, so the buttons don't flicker
 
    if (isCreator) {
        return (
            <div className="actions">
                <Link className="button-link btn-primary" to="/contests">Go to your contests</Link>
                <Link className="button-link" to="/browse">Browse contests</Link>
            </div>
        );
    }
    if (user) {
        return (
            <div className="actions">
                <Link className="button-link btn-primary" to="/browse">Browse open contests</Link>
                <Link className="button-link" to="/start-creating">Run contests</Link>
            </div>
        );
    }
    return (
        <div className="actions">
            <Link className="button-link btn-primary" to="/signup?role=creator">Start a contest</Link>
            <Link className="button-link" to="/browse">Browse open contests</Link>
        </div>
    );
}

// the review screen, for the top of the page
function ReviewPreview() {
    return (
        <div className="preview-card" aria-label="Example of the entry review screen">
            <div className="preview-head">
                <strong>Entries · Favorite Compilations</strong>
                <span className="muted">3 entries</span>
            </div>
            <div className="preview-row">
                <span><strong>Every "literally" in October</strong> <span className="muted">by Cy</span></span>
                <span className="pill pill-good">Shortlisted</span>
            </div>
            <div className="preview-row preview-row-flagged">
                <div className="preview-row-top">
                    <span><strong>Crazy week montage</strong> <span className="muted">by Ava</span></span>
                    <span className="pill pill-bad">High risk</span>
                </div>
                <span className="preview-reason">Possibly out of context: "I hate my fans." The creator was denying a rumor.</span>
            </div>
            <div className="preview-row">
                <span><strong>Best moments v2</strong> <span className="muted">by Jo</span></span>
                <span className="pill pill-warn">Duplicate</span>
            </div>
        </div>
    );
}
function FundPanel() {
    return (
        <div className="mini-screen">
            <strong>New contest · Favorite Compilations</strong>
            <div className="mini-line"><span>1st place</span><strong>$100.00</strong></div>
            <div className="mini-line"><span>2nd place</span><strong>$50.00</strong></div>
            <div className="mini-line"><span>3rd place</span><strong>$25.00</strong></div>
            <div className="mini-line mini-total"><span>Prize pool</span><strong>$175.00</strong></div>
            <span className="mini-paypal">Pay with PayPal</span>
            <span className="mini-note">Funded up front, so fans know the prizes are real.</span>
        </div>
    );
}
 
function SearchPanel() {
    return (
        <div className="mini-screen">
            <strong>Fans search everything you've said</strong>
            <div className="mini-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-4-4" />
                </svg>
                literally
            </div>
            <div className="mini-result">
                <span className="muted">Episode 12 · 0:18</span>
                <span>some of them were <mark>literally</mark> hilarious</span>
            </div>
            <div className="mini-result">
                <span className="muted">Episode 12 · 0:41</span>
                <span>I <mark>literally</mark> spent three days</span>
            </div>
            <span className="mini-submit">Submit entry</span>
        </div>
    );
}
 
function FlagPanel() {
    return (
        <div className="mini-screen">
            <strong>Entries · 1 to review</strong>
            <div className="preview-row-top">
                <span><strong>Crazy week montage</strong> <span className="muted">by Ava</span></span>
                <span className="pill pill-bad">High risk</span>
            </div>
            <p className="mini-quote">
                "<s>Some people say </s><mark>I hate my fans</mark><s>, but that's not true at all.</s>"
            </p>
            <div className="flag flag-high">
                <span className="flag-type">Context, high risk</span>
                <span>Cutting the denial makes it sound like an admission.</span>
            </div>
            <div className="mini-buttons">
                <span>Shortlist</span>
                <span>Reject</span>
            </div>
            <span className="mini-note">Flagged for your review. You decide what happens next.</span>
        </div>
    );
}
 
function PaidPanel() {
    return (
        <div className="mini-screen">
            <strong>Winners paid</strong>
            <div className="mini-line"><span>1st place · Cy</span><span className="mini-amount"><strong>$100.00</strong><span className="pill pill-good">Paid</span></span></div>
            <div className="mini-line"><span>2nd place · Sarah</span><span className="mini-amount"><strong>$50.00</strong><span className="pill pill-good">Paid</span></span></div>
            <span className="mini-note">$25.00 in unused prizes was refunded to you.</span>
            <span className="mini-note">One click, one PayPal batch payout.</span>
        </div>
    );
}
 
const STEPS = [
    { title: "Fund the prizes", text: "Post a contest and pay the prize pool up front with PayPal, so fans know the prizes are real.", Panel: FundPanel },
    { title: "Fans enter in one place", text: "No more digging through comments and DMs. Fans search everything you've said, find the moments they want, and send in their edits.", Panel: SearchPanel },
    { title: "AI pre-screens entries", text: "Duplicates, junk, and edits that twist your words get flagged for your review, each with a plain-English reason. Like a fan cutting \"Some people say I hate my fans, but that's not true at all\" down to \"I hate my fans.\"", Panel: FlagPanel },
    { title: "Pick winners, PayPal pays", text: "You make every call. One click pays every winner at once, and unused prizes come back to you.", Panel: PaidPanel },
];

function HowItWorks() {
    const [active, setActive] = useState(0); // which step is in the middle of the screen
    const stepRefs = useRef([]); // a handle on each step, to watch it and to scroll to it
 
    // the step crossing the middle of the screen becomes the active one.
    useEffect(() => {
        if (!("IntersectionObserver" in window)) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActive(Number(entry.target.dataset.step));
                }
            },
            // shrink the watched area to a thin band across the middle of the screen
            { rootMargin: "-45% 0px -45% 0px" }
        );
        for (const element of stepRefs.current) {
            if (element) observer.observe(element);
        }
        return () => observer.disconnect();
    }, []);

    function scrollToStep(i) {
        stepRefs.current[i].scrollIntoView({ behavior: "smooth", block: "center" });
    }
 
    const ActivePanel = STEPS[active].Panel;
 
    return (
        <section className="home-section">
            <p className="eyebrow">How it works</p>
            <h2 className="home-title">From prize pool to paid winners.</h2>
            <div className="sticky-layout">
                <ol className="sticky-steps">
                    {STEPS.map((step, i) => (
                        <li
                            key={step.title}
                            data-step={i}
                            ref={(element) => (stepRefs.current[i] = element)}
                            className={i === active ? "sticky-step is-active" : "sticky-step"}
                        >
                            <span className="how-number">{i + 1}</span>
                            <div className="sticky-step-text">
                                <strong>{step.title}</strong>
                                <span>{step.text}</span>
                                {/* phones: no pinned panel, so each step shows its own mini screen */}
                                <div className="step-inline-panel">
                                    <step.Panel />
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
 
                <div className="sticky-panel-column">
                    <div className="sticky-panel">
                        {/* key={active} makes React redraw the panel when the step changes, which replays its fade */}
                        <div key={active} className="sticky-panel-inner">
                            <ActivePanel />
                        </div>
                        <div className="sticky-dots">
                            {STEPS.map((step, i) => (
                                <button
                                    key={step.title}
                                    className={i === active ? "sticky-dot is-active" : "sticky-dot"}
                                    onClick={() => scrollToStep(i)}
                                    aria-label={`Step ${i + 1}: ${step.title}`}
                                    aria-current={i === active ? "step" : undefined}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

const QUESTIONS = [
    {
        q: "Does the AI pick the winners?",
        a: "No. It pre-screens every entry and flags possible problems, like duplicates, junk, clips that don't match your episodes, and edits that change what you meant, each with a reason. You shortlist, reject, and pick every winner yourself.",
    },
    {
        q: "Do fans need an account to enter?",
        a: "No. Fans can enter with just a name and a PayPal email. With a free account, their details fill in automatically, and they can follow their entries on My entries.",
    },
    {
        q: "How does Highlighter catch fake quotes?",
        a: "Every entry is transcribed and traced back to the exact moments in your episodes. AI then compares each clip with what you actually said around it, and flags edits that change your meaning.",
    },
    {
        q: "What happens to unused prize money?",
        a: "Prizes are funded up front. If there aren't enough entries in good standing to fill every place, the unused prizes are refunded to you when you pay your winners. A contest with no entries gets its whole prize pool back.",
    },
    {
        q: "How are winners paid?",
        a: "With one PayPal payout to every winner at once, sent to the PayPal email on their entry. A winner without a PayPal account gets an email from PayPal to claim it.",
    },
];

// signed in? a starting point

// loads JSON from the server with the sign-in token, or throws the server's error message
async function getJson(path) {
    const res = await authFetch(`${API_URL}${path}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

// for each contest status, the next thing the creator would do, and where it happens...
function nextStep(contest) {
    const key = statusKeyOf(contest);
    if (key === "draft") return {label: "Fund the prizes", to: `/contests/${contest.id}`};
    if (key === "open") return {label: "Review entries", to: `/entries/${contest.id}`};
    if (key === "closed") return {label: "Pick winners", to: `/entries/${contest.id}`};
    return {label: "View", to: `/contests/${contest.id}`}; // paying or paid.
}

function SignedInHome() {
    const {profile, isCreator} = useAuth();
    const firstName = profile && profile.name ? profile.name.split(" ")[0] : "there";

    const [contests, setContests] = useState(null); // creators: their contests (null = loading)
    const [entries, setEntries]= useState(null); // fans: their entries
    const [openContests, setOpenContests] = useState(null); // fans: whats open now

    useEffect(() => {
        if (isCreator) {
            getJson("/api/contests").then(setContests).catch(() => setContests([]));
        } else {
            getJson("/api/me/entries").then(setEntries).catch(() => setEntries([]));
            fetch(`${API_URL}/api/public/contests`)
                .then((res) => res.json())
                .then((data) => setOpenContests(Array.isArray(data) ? data.slice(0,3) : []))
                .catch(() => setOpenContests([]));
        }
    }, [isCreator]);

    if (isCreator) {
        // contests that still need something from the creator (paid contests are last in priority)
        // up to 5 contests are displayed
        const active = (contests || []).filter((c) => c.status !== "paid");
        const shown = active.slice(0,5);

        return (
            <>
                <section className="welcome">
                    <h1>
                        Hey {firstName}, <span className="marker">ready to start creating?</span>
                    </h1>
                    <div className="actions">
                        <Link className="button-link btn-primary" to="/contests">Start a contest</Link>
                        <Link className="button-link" to="/episodes">Upload an episode</Link>
                    </div>
                </section>

                <section className="home-section">
                    <div className="section-head">
                        <h2>Your contests</h2>
                        <Link to="/account">See all</Link>
                    </div>
                    {!contests && <p className="notice">Loading your contests...</p>}
                    {contests && shown.length === 0 && (
                        <p className="notice">
                            {contests.length === 0
                                ? "You haven't started a contest yet. Upload an episode first, so fans have something to search, then start your first contest."
                                : "Nothing needs you right now. Every contest has paid its winners."
                            }
                        </p>
                    )}
                    {shown.length > 0 && (
                        <ul className="rows">
                            {shown.map((c) => {
                                const key = statusKeyOf(c);
                                const next = nextStep(c);
                                return (
                                    <li key={c.id} className="row">
                                        <div className="row-main">
                                            <span className="row-title">{c.title}</span>
                                            <div className="meta">
                                                <span className={`status status-${key}`}>{STATUS_LABELS[key] ?? key}</span>
                                                <span>{c.entryCount || 0} {c.entryCount === 1 ? "entry" : "entries"}</span>
                                                {key === "open" && <span>{timeLeft(c.deadline)}</span>}
                                            </div>
                                        </div>
                                        <Link className="button-link" to={next.to}>{next.label}</Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </>
        );
    }
    
    // a signed-in fan
    const latest = (entries || []).slice(0,3);
    return (
        <>
            <section className="welcome">
                <h1>
                    Hey {firstName}, <span className="marker">ready to make something?</span>
                </h1>
                <p className="hero-lede">Find a contest, search the episodes for the moments you want, and send in your edit.</p>
                <div className="actions">
                    <Link className="button-link btn-primary" to="/browse">Browse open contests</Link>
                    <Link className="button-link" to="/my-entries">My entries</Link>
                </div>
            
            </section>
            {latest.length > 0 && (
                <section className="home-section">
                    <div className="section-head">
                        <h2>Your latest entries</h2>
                        <Link to="/my-entries">See all</Link>
                    </div>
                    <ul className="rows">
                        {latest.map((entry) => (
                            <li key={entry.id} className="row">
                                <div className="row-main">
                                    <span className="row-title">{entry.title}</span>
                                    <div className="meta">
                                        <Link to={`/c/${entry.contestId}`}>{entry.contestTitle}</Link>
                                    </div>
                                    <span className="entry-result">
                                        <span className={entry.win ? "entry-won" : ""}>{describe(entry)}</span>
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {openContests && openContests.length > 0 && (
                <section className="home-section">
                    <div className="section-head">
                        <h2>Open now</h2>
                        <Link to="/browse">See all contests</Link>
                    </div>
                    <ul className="rows">
                        {openContests.map((c) => (
                            <li key={c.id} className="row">
                                <div className="row-main">
                                    <span className="row-title">{c.title}</span>
                                    <div className="meta">
                                        <span>{formatMoney(c.prizeTotalCents)} in prizes</span>
                                        <span>{timeLeft(c.deadline)}</span>
                                    </div>
                                </div>
                                <div className="row-actions">
                                    <Link className="button-link" to={`/c/${c.id}/episodes`}>Search episodes</Link>
                                    <Link className="button-link" to={`/c/${c.id}`}>View contest</Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}

export default function HomePage() {
    const {user,loading} = useAuth();
    if (loading) return null;
    if (user) return <SignedInHome/>;

    return <MarketingHome/>;
}

// SIGNED OUT.. This is what new people see when they first enter the website... 
// What is highlighter? how it work? why should i try it?
function MarketingHome() {
    const [contests, setContests] = useState(null); // null = still loading
 
    // a few open contests to show. If loading fails, the section is simply left out.
    useEffect(() => {
        fetch(`${API_URL}/api/public/contests`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setContests(data.slice(0, 3)); // the three ending soonest
            })
            .catch(() => setContests([]));
    }, []);

    return (
    <>
        {/* what Highlighter is, with a preview of the real review screen */}
        <section className="hero">
            <div className="hero-text">
                <h1>
                    Fan contests, <span className="marker">without the inbox chaos.</span>
                </h1>
                <p className="hero-lede">
                    Fans search everything you've said and send in their edits. AI pre-screens every entry for junk and twisted
                    quotes, you pick the winners, and PayPal pays them all at once.
                </p>
                <MainButtons />
            </div>
            <ReviewPreview />
        </section>

                    <Reveal>
                <HowItWorks />
            </Reveal>

            {contests && contests.length > 0 && (
                <Reveal>
                    <section className="home-section">
                        <div className="section-head">
                            <h2>Open now</h2>
                            <Link to="/browse">See all contests</Link>
                        </div>
                        <ul className="rows">
                            {contests.map((c) => {
                                const entries = c.entryCount || 0;
                                return (
                                    <li key={c.id} className="row">
                                        <div className="row-main">
                                            <span className="row-title">{c.title}</span>
                                            <div className="meta">
                                                <span>{formatMoney(c.prizeTotalCents)} in prizes</span>
                                                <span>{entries} {entries === 1 ? "entry" : "entries"}</span>
                                                <span>{timeLeft(c.deadline)}</span>
                                            </div>
                                        </div>
                                        <div className="row-actions">
                                            <Link className="button-link" to={`/c/${c.id}/episodes`}>Search episodes</Link>
                                            <Link className="button-link" to={`/c/${c.id}`}>View contest</Link>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </Reveal>
            )}
            
            <Reveal>
                <section className="home-section faq">
                    <h2 className="home-title">Questions</h2>
                    {/* <details> opens and closes by itself: no JavaScript needed, and it works with a keyboard */}
                    {QUESTIONS.map((item, i) => (
                        <details key={item.q} open={i === 0}>
                            <summary>{item.q}</summary>
                            <p>{item.a}</p>
                        </details>
                    ))}
                </section>
            </Reveal>

            <Reveal>
                <section className="closing">
                    <h2>
                        Your fans are already making edits. <span className="closing-mark">Give them a contest.</span>
                    </h2>
                    <MainButtons />
                </section>
            </Reveal>

            <footer className="home-footer">
                <span>Highlighter · Built for the PayPal AI Hackathon</span>
                <span>Payments run in PayPal's sandbox</span>
            </footer>
        </>
    );
}