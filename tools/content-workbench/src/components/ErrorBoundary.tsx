import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Content workbench render failed", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-screen" role="alert">
          <section className="error-message" aria-labelledby="error-title">
            <h1 id="error-title">工作台暂时无法显示</h1>
            <p>请重新启动应用后再试。</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
