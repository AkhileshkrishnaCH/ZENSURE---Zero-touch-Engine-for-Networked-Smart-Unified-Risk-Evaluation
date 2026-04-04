import { useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LogIn, LogOut, Shield } from 'lucide-react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SPILIntegrationPage from './pages/SPILIntegrationPage'
import AIIMSEnginePage from './pages/AIIMSEnginePage'
import WalletPage from './pages/WalletPage'

const getAPIUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL?.trim()
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location.hostname.includes('loca.lt')) return 'https://zensure-api.loca.lt'
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) return ''
  // Production fallback — if no env var set, try relative (won't work cross-origin)
  return ''
}

const API_URL = getAPIUrl()

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem('zensure_auth')
    if (!stored) return null

    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  })
  const [currentAdminToken, setCurrentAdminToken] = useState(() => localStorage.getItem('zensure_admin_token'))

  const handleLogin = useCallback((worker) => {
    setCurrentUser(worker)
    localStorage.setItem('zensure_auth', JSON.stringify(worker))
  }, [])

  const handleLogout = useCallback(() => {
    setCurrentUser(null)
    setCurrentAdminToken(null)
    localStorage.removeItem('zensure_auth')
    localStorage.removeItem('zensure_admin_token')
  }, [])

  const handleAdminLogin = useCallback((token) => {
    setCurrentAdminToken(token)
    localStorage.setItem('zensure_admin_token', token)
  }, [])

  const handleAdminLogout = useCallback(() => {
    setCurrentAdminToken(null)
    localStorage.removeItem('zensure_admin_token')
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        {!currentUser ? (
          <Route path="/*" element={<LoginPage onLogin={handleLogin} apiUrl={API_URL} />} />
        ) : (
          <>
            <Route
              path="/"
              element={
                <PageLayout currentUser={currentUser} onLogout={handleLogout} adminToken={currentAdminToken} onAdminLogin={handleAdminLogin} onAdminLogout={handleAdminLogout} apiUrl={API_URL}>
                  <DashboardPage currentUser={currentUser} apiUrl={API_URL} adminToken={currentAdminToken} />
                </PageLayout>
              }
            />
            <Route
              path="/spil"
              element={
                <PageLayout currentUser={currentUser} onLogout={handleLogout} adminToken={currentAdminToken} onAdminLogin={handleAdminLogin} onAdminLogout={handleAdminLogout} apiUrl={API_URL}>
                  <SPILIntegrationPage
                    currentUser={currentUser}
                    adminToken={currentAdminToken}
                    onAdminLogin={handleAdminLogin}
                    onAdminLogout={handleAdminLogout}
                    apiUrl={API_URL}
                  />
                </PageLayout>
              }
            />
            <Route
              path="/aiims"
              element={
                <PageLayout currentUser={currentUser} onLogout={handleLogout} adminToken={currentAdminToken} onAdminLogin={handleAdminLogin} onAdminLogout={handleAdminLogout} apiUrl={API_URL}>
                  <AIIMSEnginePage currentUser={currentUser} apiUrl={API_URL} adminToken={currentAdminToken} onAdminLogin={handleAdminLogin} onAdminLogout={handleAdminLogout} />
                </PageLayout>
              }
            />
            <Route
              path="/wallet"
              element={
                <PageLayout currentUser={currentUser} onLogout={handleLogout} adminToken={currentAdminToken} onAdminLogin={handleAdminLogin} onAdminLogout={handleAdminLogout} apiUrl={API_URL}>
                  <WalletPage currentUser={currentUser} apiUrl={API_URL} />
                </PageLayout>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}

function PageLayout({ children, currentUser, onLogout, adminToken, onAdminLogin, onAdminLogout, apiUrl }) {
  const isActive = (path) => window.location.pathname === path
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    setAdminLoading(true)
    setAdminError('')
    try {
      const res = await fetch(`${apiUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Login failed')
      onAdminLogin(data.token)
      setShowAdminLogin(false)
      setAdminEmail('')
      setAdminPassword('')
    } catch (err) {
      setAdminError(err.message)
    } finally {
      setAdminLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <a href="/" className="flex items-center gap-2 text-2xl font-bold text-cyan-400 hover:text-cyan-300">
                <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                </svg>
                ZENSURE
              </a>

              <nav className="flex gap-1">
                <NavLink path="/" text="Dashboard" active={isActive('/')} />
                <NavLink path="/spil" text="SPIL Integration" active={isActive('/spil')} />
                <NavLink path="/wallet" text="ZenCoins" active={isActive('/wallet')} />
                <NavLink path="/aiims" text="AIIMS Engine" active={isActive('/aiims')} />
              </nav>
            </div>

            <div className="flex items-center gap-3">
              {adminToken ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200">
                    <Shield className="h-3 w-3" />
                    Admin
                  </span>
                  <button
                    onClick={onAdminLogout}
                    className="rounded-lg bg-amber-600/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-600/20"
                  >
                    Exit Admin
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAdminLogin(!showAdminLogin)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                >
                  <LogIn className="h-3 w-3" />
                  Admin
                </button>
              )}
              <div className="text-right">
                <div className="text-sm font-medium text-slate-200">{currentUser.name}</div>
                <div className="text-xs text-slate-400">{`${currentUser.platform} | ${currentUser.city}`}</div>
              </div>
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-600/20"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>

          {showAdminLogin && !adminToken ? (
            <form onSubmit={handleAdminLogin} className="mt-4 flex items-end gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-400">Admin Email</label>
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" required />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-400">Password</label>
                <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" required />
              </div>
              <button type="submit" disabled={adminLoading} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:bg-slate-700">
                {adminLoading ? '...' : 'Login'}
              </button>
              {adminError ? <span className="text-xs text-red-400">{adminError}</span> : null}
            </form>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}

function NavLink({ path, text, active }) {
  return (
    <a
      href={path}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
      }`}
    >
      {text}
    </a>
  )
}
