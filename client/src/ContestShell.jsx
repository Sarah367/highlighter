import {Link, NavLink} from "react-router-dom";

// header on a contest's fan pages.
export function FanHeader() {
    return (
        <header className="app-header">
            <div className="container header-inner">
                <Link to="/" className="brand">
                    <span className="marker">Highlighter</span>
                </Link>
                <Link to="/browse" className="hint">Browse contests</Link>
            </div>
        </header>
    );
}

// two tabs on every contest page: the contest itself, and searching its episodes
// "end" on the first tab: only highlighted on the contest's own page, not on the pages under it
export function ContestTabs({contestId}) {
    return (
        <nav className="contest-tabs" aria-label="Contest pages">
            <NavLink to={`/c/${contestId}`} end className="contest-tab">Contest</NavLink>
            <NavLink to={`/c/${contestId}/episodes`} className="contest-tab">Search the episodes</NavLink>
        </nav>
    );
}