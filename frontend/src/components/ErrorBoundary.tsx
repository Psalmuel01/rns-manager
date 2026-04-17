import { Component, ErrorInfo, ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Root error boundary caught an error.", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ink px-6 py-10 text-clay">
          <div className="mx-auto max-w-xl rounded-3xl border border-danger/30 bg-danger/10 p-8">
            <h1 className="font-display text-2xl text-white">Something went wrong</h1>
            <p className="mt-3 text-sm text-steel">
              Refresh the page and reconnect your wallet. If it keeps happening, check the browser
              console for the underlying error.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
