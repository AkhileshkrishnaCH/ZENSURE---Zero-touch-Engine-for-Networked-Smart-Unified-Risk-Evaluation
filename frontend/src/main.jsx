import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected render failure',
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ZENSURE render error:', error, errorInfo)
  }

  handleReset = () => {
    try {
      localStorage.removeItem('zensure-session')
      localStorage.removeItem('zensure_auth')
      localStorage.removeItem('zensure_admin_token')
    } catch {
      // Ignore storage cleanup issues.
    }

    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
          <div className="mx-auto max-w-2xl rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6 shadow-2xl shadow-slate-950/30">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-200">ZENSURE recovery mode</p>
            <h1 className="mt-3 text-2xl font-bold text-white">The app hit a render issue.</h1>
            <p className="mt-2 text-slate-200">
              A safe fallback is now active so the screen no longer stays blank.
            </p>
            <p className="mt-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
              <strong>Error:</strong> {this.state.errorMessage || 'Unknown UI error'}
            </p>
            <button
              onClick={this.handleReset}
              className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Reset session and reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
