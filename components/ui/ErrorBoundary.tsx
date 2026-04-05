"use client";

import React from "react";

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-500 text-sm mb-6 max-w-sm">
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, message: "" });
              window.location.reload();
            }}
            className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
