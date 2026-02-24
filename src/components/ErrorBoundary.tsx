import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="mx-auto h-14 w-14 rounded-xl bg-destructive/10 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-destructive"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Something went wrong
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                An unexpected error occurred. Our team has been notified.
                <br />
                Please try reloading the page.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre className="text-xs text-left bg-muted rounded-lg p-4 overflow-auto max-h-40 text-destructive">
                {this.state.error.message}
              </pre>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Go to dashboard
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Reload page
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              SignalStack by Pot Labs
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
