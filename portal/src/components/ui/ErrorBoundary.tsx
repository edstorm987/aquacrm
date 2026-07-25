"use client";

// ErrorBoundary — catches render errors in a subtree and shows a
// friendly fallback with a Retry button. Wraps each plugin page via
// the foundation's catch-all resolver so a bad render shows our UI
// instead of Next's default error page.
//
// React 19 still requires a class component for error boundaries.
// This is the only class component in the codebase by design.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // Optional human label so the fallback can mention which surface
  // failed (e.g. "Products page", "Hero block").
  label?: string;
  // Optional override fallback. When omitted, the default friendly
  // card renders.
  fallback?: (err: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaces in dev tools + Vercel logs. Production observability lands
    // with T6's Sentry integration; this is the bridge until then.
    if (typeof console !== "undefined") {
      console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`, error, info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback, label } = this.props;
    if (!error) return children;
    // Let Next's framework signals (notFound(), redirect()) bubble up
    // to its own not-found.tsx / redirect handler instead of trapping
    // them in our friendly card. Recognised via well-known message
    // prefixes + the `digest` field Next attaches to thrown sentinels.
    const digest = (error as { digest?: unknown }).digest?.toString();
    const msg = error.message ?? "";
    if (
      msg.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
      msg.startsWith("NEXT_REDIRECT") ||
      digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
      digest?.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    if (fallback) return fallback(error, this.reset);
    return (
      <div
        role="alert"
        className="mx-auto my-8 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center"
      >
        <h3 className="text-base font-semibold text-red-900">
          Something went wrong{label ? ` loading ${label}` : ""}.
        </h3>
        <p className="mt-2 text-sm text-red-800/80">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }
}
