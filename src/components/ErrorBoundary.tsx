import { Component, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  onGoHome: () => void;
}

interface State {
  error: Error | null;
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This screen failed to load. Your data is safe — try again, or go back to the
            dashboard.
          </p>
          <p className="mt-3 break-words rounded bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={this.reset}>
              <RotateCw className="h-4 w-4" /> Try again
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => {
                this.reset();
                this.props.onGoHome();
              }}
            >
              <Home className="h-4 w-4" /> Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Keyed on pathname so navigating away from a broken screen clears the error
 * instead of stranding the user on the fallback.
 */
const ErrorBoundary = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <ErrorBoundaryInner key={location.pathname} onGoHome={() => navigate('/')}>
      {children}
    </ErrorBoundaryInner>
  );
};

export default ErrorBoundary;
