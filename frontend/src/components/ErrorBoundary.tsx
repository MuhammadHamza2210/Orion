import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback. Defaults to a small inline error card. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/effect errors in the subtree so a single broken component
 * (e.g. the chart) shows a recoverable message instead of unmounting the entire
 * app to a blank screen.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-sm font-semibold text-white/80">
            Something went wrong rendering this view.
          </div>
          <div className="max-w-md text-xs text-white/45">
            {this.state.error.message}
          </div>
          <button
            onClick={this.reset}
            className="rounded-lg border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium hover:bg-white/20"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
