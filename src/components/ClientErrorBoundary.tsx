import React, { type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';
import { reportClientError } from '../lib/api/clientErrors';

type Props = { children: ReactNode };
type State = { failed: boolean; incidentId: string };

export class ClientErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, incidentId: '' };
  static getDerivedStateFromError(): Partial<State> { return { failed: true, incidentId: globalThis.crypto?.randomUUID?.() ?? `incident-${Date.now()}` }; }
  componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportClientError({ name: error.name, message: error.message, stack: error.stack, source: 'react.error_boundary' });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" aria-live="assertive" style={{ maxWidth: 720, margin: '3rem auto', padding: '1.5rem' }}>
      <h1>Something went wrong</h1>
      <p>This screen could not be displayed. The technical error has been reported to the support diagnostics centre.</p>
      <p>Reference: <strong>{this.state.incidentId}</strong></p>
      <Button onClick={() => window.location.reload()}>Reload the application</Button>{' '}
      <Button href="/" variant="outline">Back to home</Button>
    </section>;
  }
}
