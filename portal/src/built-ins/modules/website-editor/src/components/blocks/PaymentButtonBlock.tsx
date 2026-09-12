"use client";

// PaymentButton — POSTs the current cart to the ecommerce plugin's
// Stripe Checkout endpoint and follows the redirect URL. Editor mode
// is no-op; live mode invokes the bridge's `goToStripeCheckout` and
// surfaces the error if Stripe isn't configured.

import { useEffect, useRef, useState } from "react";
import {
  BotChallenge,
  type BotChallengeHandle,
  usePublicBotChallengeConfig,
} from "@/components/security/BotChallenge";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { goToStripeCheckout, quoteCheckout, useCart } from "../ecommerceBridge";

export default function PaymentButtonBlock({ block, editorMode, context }: BlockRenderProps) {
  const label = (block.props.label as string | undefined) ?? "Pay now";
  const provider = (block.props.provider as string | undefined) ?? "stripe";
  const successUrl = (block.props.successUrl as string | undefined);
  const cancelUrl = (block.props.cancelUrl as string | undefined);

  const cart = useCart();
  const challenge = usePublicBotChallengeConfig();
  const challengeRef = useRef<BotChallengeHandle | null>(null);
  const protectedStorefront = context?.publishedWebsite === true;
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [checkoutKind, setCheckoutKind] = useState<"paid" | "free" | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cartFingerprint = JSON.stringify(cart.items.map(item => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
  })));

  useEffect(() => {
    setCaptchaToken(null);
    challengeRef.current?.reset();
    if (editorMode || cart.count === 0 || !protectedStorefront) {
      setCheckoutKind(!editorMode && cart.count > 0 && !protectedStorefront ? "paid" : null);
      setQuoteLoading(false);
      return;
    }
    let active = true;
    setQuoteLoading(true);
    void quoteCheckout(JSON.parse(cartFingerprint) as Array<{ productId?: string; variantId?: string; quantity: number }>)
      .then(result => {
        if (!active) return;
        if (!result.quote) {
          setCheckoutKind(null);
          setError(result.error ?? "The checkout total is unavailable.");
          return;
        }
        setError(null);
        setCheckoutKind(result.quote.amountTotal === 0 ? "free" : "paid");
      })
      .finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [cart.count, cartFingerprint, editorMode, protectedStorefront]);

  async function handleClick() {
    if (editorMode) return;
    if (cart.count === 0) {
      setError("Your cart is empty.");
      return;
    }
    if (!checkoutKind) {
      setError("The checkout total is not ready yet. Please try again.");
      return;
    }
    if (protectedStorefront && (challenge.required || challenge.error) && !challenge.siteKey) {
      setError("Verification is temporarily unavailable. Please try again later.");
      return;
    }
    if (protectedStorefront && challenge.siteKey && !captchaToken) {
      setError("Complete the verification challenge before checkout.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await goToStripeCheckout({
        successUrl,
        cancelUrl,
        checkoutKind,
        captchaToken: captchaToken ?? undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't start checkout. Please try again.");
      }
      // On success the bridge has already navigated.
    } finally {
      setCaptchaToken(null);
      challengeRef.current?.reset();
      setSubmitting(false);
    }
  }

  const colors: Record<string, string> = {
    stripe:   "#635bff",
    paypal:   "#003087",
    applepay: "#000",
  };
  const bg = colors[provider] ?? "var(--brand-accent, #ff6b35)";

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "14px 24px",
    borderRadius: 12,
    border: "none",
    background: bg,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: editorMode || submitting || quoteLoading ? "default" : "pointer",
    minWidth: 240,
    opacity: submitting ? 0.6 : 1,
    ...blockStylesToCss(block.styles),
  };

  return (
    <div data-block-type="payment-button" data-provider={provider}>
      {!editorMode && protectedStorefront && checkoutKind ? (
        <BotChallenge
          key={checkoutKind}
          ref={challengeRef}
          siteKey={challenge.siteKey}
          required={challenge.required || challenge.error}
          action={checkoutKind === "free" ? "storefront-free-order" : "storefront-checkout"}
          onToken={setCaptchaToken}
        />
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        disabled={
          editorMode
          || submitting
          || quoteLoading
          || !checkoutKind
          || (protectedStorefront && challenge.loading)
          || (protectedStorefront && (challenge.required || challenge.error) && !challenge.siteKey)
          || (protectedStorefront && Boolean(challenge.siteKey) && !captchaToken)
        }
        style={style}
      >
        {provider === "applepay" ? <span aria-hidden="true"></span> : null}
        <span>{submitting ? "Loading…" : quoteLoading ? "Checking total…" : label}</span>
      </button>
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: "#fca5a5" }}>
          {error}
        </p>
      )}
    </div>
  );
}
