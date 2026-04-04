import { useCallback, useState } from 'react'
import { CheckCircle2, LogIn, Shield, UserPlus } from 'lucide-react'

export default function LoginPage({ onLogin, apiUrl }) {
  const [authTab, setAuthTab] = useState('login')
  const [banner, setBanner] = useState('Use a password or your unique ZenPass QR to sign in.')
  const [loadingAction, setLoadingAction] = useState('')
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' })
  const [qrForm, setQrForm] = useState({ qr_data: '' })
  const LOCATION_ZONES = [
    'Bangalore', 'Hyderabad', 'Chennai', 'Vijayawada', 'Vishakapatnam',
    'Delhi', 'Mumbai', 'Kolkata', 'Agra', 'Noida',
    'Pune', 'Pondicherry', 'Thirpur', 'Puri', 'Goa',
  ]
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    platform: 'Swiggy',
    verification_code: '',
    location_zone: 'Hyderabad',
  })
  const [locationState, setLocationState] = useState({ status: 'GPS will be requested at login.', location: null })
  const [emailVerification, setEmailVerification] = useState(null)

  const apiRequest = useCallback(
    async (path, options = {}) => {
      let response
      try {
        response = await fetch(`${apiUrl}${path}`, options)
      } catch (error) {
        throw new Error(error?.message || 'Unable to reach the server')
      }
      const rawText = await response.text()
      const data = rawText
        ? (() => {
            try {
              return JSON.parse(rawText)
            } catch {
              return { message: rawText }
            }
          })()
        : {}
      if (!response.ok) {
        throw new Error(data.detail || data.message || `Request failed (${response.status})`)
      }
      return data
    },
    [apiUrl],
  )

  const requestLiveLocation = async () => {
    if (!navigator.geolocation) {
      throw new Error('This browser does not support GPS capture.')
    }
    setLocationState({ status: 'Requesting live GPS...', location: null })
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracy: position.coords.accuracy ? Number(position.coords.accuracy.toFixed(1)) : undefined,
          }
          setLocationState({ status: `GPS ready | ${location.latitude}, ${location.longitude}`, location })
          resolve(location)
        },
        (error) => {
          const messageMap = { 1: 'Location permission was denied.', 2: 'The device location is unavailable.', 3: 'Location request timed out.' }
          const message = messageMap[error.code] || 'Unable to capture live GPS.'
          setLocationState({ status: message, location: null })
          reject(new Error(message))
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      )
    })
  }

  const finishLogin = (payload, successMessage) => {
    setBanner(successMessage)
    onLogin(payload.session?.worker || payload.dashboard?.worker)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoadingAction('login')
    try {
      const location = await requestLiveLocation()
      const payload = await apiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginForm.identifier, password: loginForm.password, location }),
      })
      finishLogin(payload, 'Login successful! Redirecting to dashboard...')
    } catch (error) {
      setBanner(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleQrLogin = async (event) => {
    event.preventDefault()
    setLoadingAction('qr')
    try {
      const location = await requestLiveLocation()
      const payload = await apiRequest('/api/auth/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_data: qrForm.qr_data.trim(), location, scan_method: 'uri' }),
      })
      finishLogin(payload, 'QR login successful! Redirecting to dashboard...')
    } catch (error) {
      setBanner(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleRequestEmailCode = async () => {
    if (!registerForm.email) {
      setBanner('Enter an email to receive a verification code.')
      return
    }
    setLoadingAction('email-code')
    try {
      const payload = await apiRequest('/api/auth/request-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registerForm.email }),
      })
      setEmailVerification(payload.verification)
      setBanner(payload.message)
    } catch (error) {
      setBanner(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setLoadingAction('register')
    try {
      const location = await requestLiveLocation()
      const payload = await apiRequest('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...registerForm, location }),
      })
      finishLogin(payload, 'Registration successful! Redirecting to dashboard...')
    } catch (error) {
      setBanner(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-bold text-cyan-400">ZENSURE</h1>
          <p className="mt-2 text-xl text-slate-400">Zero-touch Engine for Networked Smart Unified Risk Evaluation</p>
          <p className="mt-1 text-slate-500">Protection for gig workers. No claims. No delays. Just protection.</p>
        </header>

        <div className="mb-8 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-6 py-4 text-center text-cyan-100">{banner}</div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="glass-card p-8">
              <h2 className="mb-4 text-2xl font-bold text-white">Welcome to ZENSURE</h2>
              <div className="space-y-3">
                {[
                  'Formula-based worker pricing after SPIL verification',
                  'ZenCoins wallet for buying plans and receiving payouts',
                  'GPS-secured login with revocable QR passes',
                  'AIIMS-ready enrollment snapshots for every subscribed worker',
                  'Transparent, explainable decisions',
                ].map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
                    <span className="text-slate-200">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-8">
              <h3 className="text-lg font-semibold text-white">QR Sign-In Flow</h3>
              <p className="mt-3 text-sm text-slate-300">
                Each worker gets a unique ZenPass QR after signing in. Paste the `zensure://login/...` link into the QR tab with live GPS to use the password-free login flow.
              </p>
            </div>
          </div>

          <div className="glass-card p-8">
            <div className="mb-6 flex rounded-2xl border border-white/10 bg-slate-900/70 p-1">
              {[
                { key: 'login', label: 'Login', icon: LogIn },
                { key: 'qr', label: 'QR Login', icon: Shield },
                { key: 'register', label: 'Register', icon: UserPlus },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setAuthTab(key)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    authTab === key ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {authTab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  type="text"
                  value={loginForm.identifier}
                  onChange={(event) => setLoginForm({ ...loginForm, identifier: event.target.value })}
                  placeholder="Email or phone"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                  required
                />
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  placeholder="Password"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                  required
                />
                <button type="submit" disabled={loadingAction === 'login'} className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700">
                  {loadingAction === 'login' ? 'Requesting GPS and signing in...' : 'Login'}
                </button>
              </form>
            ) : null}

            {authTab === 'qr' ? (
              <form onSubmit={handleQrLogin} className="space-y-4">
                <textarea
                  value={qrForm.qr_data}
                  onChange={(event) => setQrForm({ qr_data: event.target.value })}
                  placeholder="Paste your zensure://login/... QR link or raw token"
                  className="min-h-36 w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                  required
                />
                <div className="rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
                  QR login still verifies your live GPS before a session is issued.
                </div>
                <button type="submit" disabled={loadingAction === 'qr'} className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700">
                  {loadingAction === 'qr' ? 'Verifying QR and GPS...' : 'Login with ZenPass QR'}
                </button>
              </form>
            ) : null}

            {authTab === 'register' ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <input
                  type="text"
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                  required
                />
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                    placeholder="Email"
                    className="flex-1 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                    required
                  />
                  <button type="button" onClick={handleRequestEmailCode} disabled={loadingAction === 'email-code'} className="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:bg-slate-700">
                    {loadingAction === 'email-code' ? 'Sending...' : 'Request Code'}
                  </button>
                </div>
                {emailVerification ? (
                  <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/20 p-3 text-sm text-cyan-100">
                    {emailVerification.delivery_status === 'sent' ? 'Check your email for the verification code.' : `Demo code: ${emailVerification.demo_code || 'N/A'}`}
                  </div>
                ) : null}
                <input
                  type="text"
                  value={registerForm.verification_code}
                  onChange={(event) => setRegisterForm({ ...registerForm, verification_code: event.target.value })}
                  placeholder="Verification code"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                  required
                />
                <input
                  type="tel"
                  value={registerForm.phone}
                  onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })}
                  placeholder="Phone"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                  required
                />
                <select
                  value={registerForm.platform}
                  onChange={(event) => setRegisterForm({ ...registerForm, platform: event.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                >
                  <option>Swiggy</option>
                  <option>Zomato</option>
                  <option>Zepto</option>
                  <option>Blinkit</option>
                </select>
                <select
                  value={registerForm.location_zone}
                  onChange={(event) => setRegisterForm({ ...registerForm, location_zone: event.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                >
                  {LOCATION_ZONES.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                  placeholder="Password"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                  required
                />
                <button type="submit" disabled={loadingAction === 'register'} className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700">
                  {loadingAction === 'register' ? 'Creating account...' : 'Register'}
                </button>
              </form>
            ) : null}

            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
              <strong>Location status:</strong> {locationState.status}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
