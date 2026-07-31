import App from './App';

type AppErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-fallback">
          <h1>Perler Beads Generator</h1>
          <p>页面加载时遇到一个问题。</p>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()}>重新加载</button>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
