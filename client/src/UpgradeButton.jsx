import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAuth} from "./auth";

// "start running contests": turns a fan's account into a creator account, then opens Contests
// creators keep everything fans can do, so it only adds tools, and there's no going back...
export default function UpgradeButton() {
    const {becomeCreator} = useAuth();
    const navigate = useNavigate();
    const [upgrading, setUpgrading] = useState(false);
    const [problem, setProblem] = useState("");

    async function startRunningContests() {
        setUpgrading(true);
        setProblem("");
        try {
            await becomeCreator();
            navigate("/contests");
        } catch (err) {
            setProblem(err.message);
            setUpgrading(false);
        }
    }

    return (
        <div className="stack">
            {problem && <p className="alert">{problem}</p>}
            <div className="actions">
                <button className="btn-primary" onClick={startRunningContests} disabled={upgrading}>
                    {upgrading ? "One moment..." : "Start running contests"}
                </button>
            </div>
        </div>
    );
}