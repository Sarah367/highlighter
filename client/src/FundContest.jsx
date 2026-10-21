import { useEffect, useRef, useState } from "react";
import { getPayPalSdk } from "./paypalSdk";
import { API_URL } from "./api";

// paypal button funds a contest's prize pool.
// onFunded(contest) runs with the updated contest once payment is captured
export default function FundContest({contest, onFunded}) {
    const buttonRef = useRef(null);
    const [stage, setStage] = useState("loading");
    const [problem, setProblem] = useState("");

    useEffect(() => {
        let cancelled = false; // true once this component leaves the screen
        let detach = () => {};
        async function setUp() {
            const sdk = await getPayPalSdk();
            const methods = await sdk.findEligibleMethods({currencyCode: "USD"});
            if (cancelled) return;
            if (!methods.isEligible("paypal")) {
                setStage("unavailable");
                return;
            }

            // checkout session holds what happens next (creator approves, cancels, or get error )
            const session = sdk.createPayPalOneTimePaymentSession({
                onApprove: async ({orderId}) => {
                    setStage("paying");
                    try {
                        const res = await fetch(`${API_URL}/api/contests/${contest.id}/capture`, {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({orderId}),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        onFunded(data);
                    } catch (err) {
                        setProblem(err.message);
                        setStage("ready");
                    }
                },
                onCancel: () => setProblem("Checkout was cancelled. Your contest is still a draft."),
                onError: (err) => setProblem(err?.message || "PayPal ran into a problem. Please try again."),
            });
            
            // asks server to create order
            async function createOrder() {
                const res = await fetch(`${API_URL}/api/contests/${contest.id}/order`, {method: "POST" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                return {orderId: data.orderId};
            }
            const button = buttonRef.current;
            async function handleClick() {
                setProblem("");
                try {
                    // pass createOrder() (called), not createOrder: PayPal opens right away and waits for the order
                    await session.start({presentationMode: "auto"}, createOrder());

                } catch (err) {
                    setProblem(err.message);
                }
            }
            button.addEventListener("click", handleClick);
            detach = () => button.removeEventListener("click", handleClick);
            setStage("ready");
        }
        setUp().catch((err) => {
            if (!cancelled) {
                setProblem(err.message);
                setStage("unavailable");
            }
        });

        return () => {
            cancelled = true;
            detach();
        };
    }, [contest.id, onFunded]);

    return (
        <div className="stack">
        {stage === "loading" && <p className="hint">Loading PayPal…</p>}
        {stage === "paying" && <p className="notice">Confirming your payment…</p>}
        {stage === "unavailable" && !problem && <p className="alert">PayPal checkout isn't available right now.</p>}
    
        {/* PayPal's own button. It stays hidden until the SDK is ready. */}
        <div className="paypal-slot">
            <paypal-button ref={buttonRef} type="pay" hidden={stage !== "ready"}></paypal-button>
        </div>
    
        {problem && <p className="alert">{problem}</p>}
        </div>
  );
}
