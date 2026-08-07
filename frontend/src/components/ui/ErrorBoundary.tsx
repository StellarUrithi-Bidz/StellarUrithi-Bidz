"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

// ── Props ─────────────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI — overrides the default error display */
  fallback?: ReactNode;
  /** Called when an error is caught (e.g., for analytics/logging) */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ── Component ─────────────────────────────────────────────────────────────────────

/**
 * React Error Boundary that catches unhandled render errors.
 * Prevents a single component crash from taking down the entire page.
 *
 * Features:
 * - Renders a user-friendly fallback UI with recovery options
 * - Displays the error message for debugging (in dev)
 * - Reset button to attempt recovery
 * - Navigation links to return Home or refresh
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console in development
    console.error("[ErrorBoundary] Uncaught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

    // Notify parent handler if provided (e.g., analytics)
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="glass-card max-w-lg w-full p-8 text-center space-y-6">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">
                Something went wrong
              </h2>
              <p className="text-sm text-white/50 leading-relaxed">
                An unexpected error occurred while rendering this page.
                This is not your fault — our team has been notified.
              </p>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-3 text-left">
                  <summary className="text-xs text-white/30 cursor-pointer hover:text-white/50 transition-colors">
                    Error details (dev only)
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-slate-900/80 border border-red-500/20 text-xs text-red-300 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                    {this.state.error.message}
                    {"\n\n"}
                    {this.state.error.stack?.slice(0, 800)}
                  </pre>
                </details>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ochre-500/20 text-ochre-400 border border-ochre-500/30 hover:bg-ochre-500/30 transition-all text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <Link
                href="/"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
