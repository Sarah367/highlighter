import {Link} from "react-router-dom";
import {useAuth} from "./auth";
import UpgradeButton from "./UpgradeButton";

// "Run contests" in a fan's header: what creators can do, and the button to become one.
export default function StartCreatingPage() {
    const {isCreator} = useAuth();

    // already a creator? nothing to upgrade.
    if (isCreator) {
        return (
            <div className="page-head">
                <h1>You're already a creator</h1>
                <p>
                    <Link to="/contests">Go to your contests</Link>.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="page-head">
                <h1>Run your own contests</h1>
                <p>Turn your episodes into fan contests, with the busywork handled for you.</p>
            </div>
            <section className="panel">
                <ul className="steps-list">
                    <li><strong>Upload your episodes.</strong> They're transcribed automatically, so fans can search everything you've said.</li>
                    <li><strong>Post a contest and fund the prizes with PayPal,</strong> so fans know the prizes are real.</li>
                    <li><strong>Review entries in one place.</strong> AI screens each one, flagging fake quotes, duplicates, and junk, with a reason for every flag.</li>
                    <li><strong>Pick your winners,</strong> and PayPal pays them all at once.</li>
                </ul>
                <div className="stack">
                    <p className="hint">You'll keep everything you can do now, like entering other creators' contests.</p>
                    <UpgradeButton/>
                </div>
            </section>
        </>
    )
}