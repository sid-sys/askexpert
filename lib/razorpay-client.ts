// Client-side helper to load Razorpay Checkout.js once and open the modal.
// Used by frontend call sites that need to branch from Stripe (redirect)
// to Razorpay (in-page modal).

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const RZP_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptLoadingPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay can only be loaded in the browser"));
  if (window.Razorpay) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src   = RZP_SCRIPT_SRC;
    script.async = true;
    script.onload  = () => resolve();
    script.onerror = () => {
      scriptLoadingPromise = null;
      reject(new Error("Failed to load Razorpay Checkout.js"));
    };
    document.head.appendChild(script);
  });
  return scriptLoadingPromise;
}

export type RazorpayOneTimeOptions = {
  orderId:    string;
  keyId:      string;
  amount:     number;       // paise
  currency:   string;       // "INR"
  name?:      string;       // merchant display name
  description?: string;
  prefill?:   { name?: string; email?: string; contact?: string };
  successRedirect?: string; // url to navigate to on success
  onDismiss?: () => void;
};

export type RazorpaySubscriptionOptions = {
  subscriptionId: string;
  keyId:          string;
  name?:          string;
  description?:   string;
  prefill?:       { name?: string; email?: string; contact?: string };
  successRedirect?: string;
  onDismiss?:     () => void;
};

// Open the Razorpay modal for a one-time payment. Resolves once the modal
// closes (either after successful payment or user dismissal).
export async function openRazorpayOneTime(opts: RazorpayOneTimeOptions): Promise<void> {
  await loadRazorpayScript();
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key:         opts.keyId,
      order_id:    opts.orderId,
      amount:      opts.amount,
      currency:    opts.currency,
      name:        opts.name        ?? "AskExpert",
      description: opts.description ?? "Expert Question",
      prefill:     opts.prefill ?? {},
      handler: function (_response: any) {
        // Payment captured. Webhook will write the question doc; we just
        // navigate the fan to a confirmation/dashboard page.
        if (opts.successRedirect) {
          window.location.href = opts.successRedirect;
        }
        resolve();
      },
      modal: {
        ondismiss: () => {
          opts.onDismiss?.();
          resolve();
        },
      },
      theme: { color: "#0d9488" },
    });
    rzp.open();
  });
}

// Open the Razorpay modal for a subscription (fan→creator OR platform plan).
export async function openRazorpaySubscription(opts: RazorpaySubscriptionOptions): Promise<void> {
  await loadRazorpayScript();
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key:             opts.keyId,
      subscription_id: opts.subscriptionId,
      name:            opts.name        ?? "AskExpert",
      description:     opts.description ?? "Monthly Subscription",
      prefill:         opts.prefill ?? {},
      handler: function (_response: any) {
        if (opts.successRedirect) {
          window.location.href = opts.successRedirect;
        }
        resolve();
      },
      modal: {
        ondismiss: () => {
          opts.onDismiss?.();
          resolve();
        },
      },
      theme: { color: "#0d9488" },
    });
    rzp.open();
  });
}
