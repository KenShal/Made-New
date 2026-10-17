import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last-resort boundary. Shows a calm message and never renders stack traces to users. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    // Hook for error monitoring (e.g. Sentry). Keep payloads free of tokens and PII.
    if (import.meta.env.DEV) console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="mx-auto max-w-xl px-6 py-32">
          <p className="font-display text-[0.7rem] font-bold uppercase tracking-[0.18em] text-crimson">Something went wrong</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">This page hit a snag.</h1>
          <p className="mt-3 text-ink-muted">Please refresh. If it keeps happening, let us know and we&rsquo;ll fix it.</p>
          <button type="button" className="mt-8 h-12 bg-crimson px-7 font-display text-sm font-bold uppercase tracking-[0.14em] text-white" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
