import React, { type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
          <div className="max-w-md w-full bg-slate-800 border border-red-500/20 rounded-lg p-6 shadow-lg">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-red-500 text-2xl">⚠️</div>
              <div>
                <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
                <p className="text-slate-400 text-sm mt-1">An unexpected error occurred</p>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
