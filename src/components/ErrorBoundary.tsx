import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * The experience leans on WebGL, Web Audio and video seeking, none of which are
 * guaranteed on an unknown device. A thrown error must degrade into a readable
 * page rather than a black screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('The Vault failed to run the containment sequence.', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="fatal">
        <p className="eyebrow">CONTAINMENT SYSTEM V-07</p>
        <h1>SEQUENCE UNAVAILABLE</h1>
        <p className="fatal__lead">
          This browser could not run the containment sequence. Reloading, or opening the page in a
          recent version of Chrome, Edge, Firefox or Safari, usually resolves it.
        </p>
        <button className="outline-button" type="button" onClick={() => window.location.reload()}>
          RELOAD
        </button>
      </main>
    );
  }
}
