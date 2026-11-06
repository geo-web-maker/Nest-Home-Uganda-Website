import React, { type ErrorInfo, type ReactNode } from 'react';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';
import { reportNurseClientError } from '../lib/clientErrors';

type Props = { children: ReactNode };
type State = { failed: boolean; incidentId: string };

export class ClientErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, incidentId: '' };
  static getDerivedStateFromError(): Partial<State> { return { failed: true, incidentId: globalThis.crypto?.randomUUID?.() ?? `incident-${Date.now()}` }; }
  componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportNurseClientError({ name: error.name, message: error.message, stack: error.stack, source: 'react.error_boundary' });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" aria-live="assertive" style={{ padding: '1rem', maxWidth: 560, margin: '2rem auto' }}>
      <Card><h1>We could not open this screen</h1><p>Your saved work has not been cleared. The technical issue has been reported.</p><p>Reference: <strong>{this.state.incidentId}</strong></p><PillButton tone="forest" onClick={() => window.location.reload()}>Reload the app</PillButton></Card>
    </main>;
  }
}
