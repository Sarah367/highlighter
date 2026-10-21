// adds paypal's v6 script to page and creates one SDK instance with Client ID.
// promise is saved so script will load only once (efficient to avoid duplicate copies of paypal's script)

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

let sdkPromise = null; 

export function getPayPalSdk() {
    if (!sdkPromise) { // checks if this is the first time its been called, otherwise skips straight to returning sdkPromise
        sdkPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = SDK_URL;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Couldn't load PayPal checkout. Check your connection and refresh."));
            document.head.appendChild(script);
        }).then(() => 
            window.paypal.createInstance({
                clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID, 
                components: ["paypal-payments"],
                pageType: "checkout",
            })
        );
        sdkPromise.catch(() => {
            sdkPromise = null; // if loading failed, let the next attempt try again.
        });
    }
    return sdkPromise;
}

