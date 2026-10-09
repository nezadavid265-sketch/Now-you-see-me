import { Component } from 'react';
import { TriangleAlert } from 'lucide-react';

/** Catches rendering errors so one broken widget never blanks the whole app. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkError = /dynamically imported module|Loading chunk|Failed to fetch/i.test(String(this.state.error?.message));
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <TriangleAlert className="size-10 text-amber-500" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{chunkError ? 'A new version of Rivoshoppa is available' : 'Something went wrong'}</h1>
          <p className="mt-1 text-sm text-slate-500">{chunkError ? 'Reload the page to continue.' : 'Please reload the page. If the problem continues, contact support.'}</p>
        </div>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
          Reload page
        </button>
      </div>
    );
  }
}
