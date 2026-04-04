import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Plus, Users } from 'lucide-react'

const LOCATION_ZONES = [
  'Bangalore', 'Hyderabad', 'Chennai', 'Vijayawada', 'Vishakapatnam',
  'Delhi', 'Mumbai', 'Kolkata', 'Agra', 'Noida',
  'Pune', 'Pondicherry', 'Thirpur', 'Puri', 'Goa',
]

const ZONE_COORDS = {
  Bangalore: { lat: 12.9716, lon: 77.5946 },
  Hyderabad: { lat: 17.3850, lon: 78.4867 },
  Chennai: { lat: 13.0827, lon: 80.2707 },
  Vijayawada: { lat: 16.5062, lon: 80.6480 },
  Vishakapatnam: { lat: 17.6868, lon: 83.2185 },
  Delhi: { lat: 28.7041, lon: 77.1025 },
  Mumbai: { lat: 19.0760, lon: 72.8777 },
  Kolkata: { lat: 22.5726, lon: 88.3639 },
  Agra: { lat: 27.1767, lon: 78.0081 },
  Noida: { lat: 28.5355, lon: 77.3910 },
  Pune: { lat: 18.5204, lon: 73.8567 },
  Pondicherry: { lat: 11.9416, lon: 79.8083 },
  Thirpur: { lat: 11.1085, lon: 77.3411 },
  Puri: { lat: 19.7983, lon: 85.8249 },
  Goa: { lat: 15.2993, lon: 74.1240 },
}

const defaultForm = {
  external_worker_id: '',
  name: '',
  employer_name: 'Partner Workforce Grid',
  platform: 'Swiggy',
  employment_type: 'Gig',
  shift_pattern: 'Peak-hour flexible',
  experience_years: 1,
  incident_count: 0,
  attendance_score: 0.9,
  reliability_score: 0.88,
  risk_band: 'Medium',
  notes: '',
  avg_working_hours_per_week: 40,
  rating: 4.5,
  location_name: 'Hyderabad',
  location_latitude: 17.385,
  location_longitude: 78.4867,
  location_risk_score: 0.5,
  salary_per_week: 6000,
  deliveries_per_week: 60,
  night_shift_percentage: 0.2,
  safety_behavior_score: 0.85,
  platform_tenure_years: 1.5,
  fraud_flag: false,
  insurance_claimed_count: 0,
}

export default function SPILIntegrationPage({ currentUser, adminToken, onAdminLogin, onAdminLogout, apiUrl }) {
  const [view, setView] = useState(adminToken ? 'admin' : 'worker')
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState('')
  const [spilWorkers, setSpilWorkers] = useState([])
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [creatingWorker, setCreatingWorker] = useState(false)
  const [newWorkerForm, setNewWorkerForm] = useState(defaultForm)
  const [connecting, setConnecting] = useState(null)
  const [premiumResult, setPremiumResult] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)

  const plans = useMemo(
    () => [
      { plan_id: 'basic', plan_name: 'Basic Weather Shield', premium_zencoins: 0, max_weekly_payout_zencoins: 0 },
      { plan_id: 'super', plan_name: 'Super Shield Plus', premium_zencoins: 0, max_weekly_payout_zencoins: 0 },
    ],
    [],
  )

  const apiRequest = useCallback(
    async (path, options = {}) => {
      const headers = { ...(options.headers || {}) }
      if (adminToken) headers.Authorization = `Bearer ${adminToken}`

      let response
      try {
        response = await fetch(`${apiUrl}${path}`, { ...options, headers })
      } catch (error) {
        throw new Error(error?.message || 'Unable to reach the server')
      }

      const rawText = await response.text()
      let data = {}
      if (rawText) {
        try {
          data = JSON.parse(rawText)
        } catch {
          data = { message: rawText }
        }
      }

      if (!response.ok) {
        throw new Error(data.detail || data.message || `Request failed (${response.status})`)
      }

      return data
    },
    [adminToken, apiUrl],
  )

  const loadWorkers = useCallback(async () => {
    const path = adminToken && view === 'admin' ? '/api/admin/spil-workers' : '/api/spil/records'
    const payload = await apiRequest(path)
    setSpilWorkers(Array.isArray(payload) ? payload : payload.records || [])
  }, [adminToken, apiRequest, view])

  const loadWallet = useCallback(async () => {
    if (!currentUser?.id) return
    const payload = await apiRequest(`/api/user/wallet/${currentUser.id}`)
    setWalletBalance(payload.wallet?.balance || 0)
    if (payload.aiims_warning) {
      setWarning(payload.aiims_warning)
    }
  }, [apiRequest, currentUser?.id])

  useEffect(() => {
    const run = async () => {
      setWarning('')
      try {
        await loadWorkers()
        if (view === 'worker') {
          try {
            await loadWallet()
          } catch (error) {
            setWarning(`Wallet details could not be refreshed: ${error.message}`)
          }
        }
        setMessage('')
      } catch (error) {
        setMessage(error.message)
      }
    }
    run()
  }, [loadWallet, loadWorkers, view])

  const handleLocationChange = (locationName) => {
    const coords = ZONE_COORDS[locationName] || { lat: 17.385, lon: 78.4867 }
    setNewWorkerForm({
      ...newWorkerForm,
      location_name: locationName,
      location_latitude: coords.lat,
      location_longitude: coords.lon,
    })
  }

  const handleCreateSPILWorker = async (event) => {
    event.preventDefault()
    setCreatingWorker(true)
    setMessage('')
    setWarning('')
    try {
      await apiRequest('/api/admin/spil-workers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newWorkerForm,
          experience_years: Number(newWorkerForm.experience_years),
          incident_count: Number(newWorkerForm.incident_count),
          attendance_score: Number(newWorkerForm.attendance_score),
          reliability_score: Number(newWorkerForm.reliability_score),
          avg_working_hours_per_week: Number(newWorkerForm.avg_working_hours_per_week),
          rating: Number(newWorkerForm.rating),
          location_latitude: Number(newWorkerForm.location_latitude),
          location_longitude: Number(newWorkerForm.location_longitude),
          location_risk_score: Number(newWorkerForm.location_risk_score),
          salary_per_week: Number(newWorkerForm.salary_per_week),
          deliveries_per_week: Number(newWorkerForm.deliveries_per_week),
          night_shift_percentage: Number(newWorkerForm.night_shift_percentage),
          safety_behavior_score: Number(newWorkerForm.safety_behavior_score),
          platform_tenure_years: Number(newWorkerForm.platform_tenure_years),
          insurance_claimed_count: Number(newWorkerForm.insurance_claimed_count),
        }),
      })
      setMessage('SPIL worker created successfully.')
      setNewWorkerForm(defaultForm)
      await loadWorkers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCreatingWorker(false)
    }
  }

  const handleAdminConnect = async (spilId) => {
    setConnecting(spilId)
    setMessage('')
    setWarning('')
    try {
      const payload = await apiRequest(`/api/admin/spil-workers/${spilId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      setMessage(`Connected successfully. Premium ready: ${payload.premium_quote?.weekly_premium_zencoins || payload.premium_quote?.weekly_premium || 0} ZC/week.`)
      await loadWorkers()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setConnecting(null)
    }
  }

  const handleWorkerConnect = async (worker) => {
    setConnecting(worker.id)
    setMessage('')
    setWarning('')
    try {
      const payload = await apiRequest(`/api/user/spil/connect/${worker.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.id }),
      })
      setSelectedWorker(payload.spil_record)
      setPremiumResult(payload.premium_quote)
      setSelectedPlan(payload.premium_quote?.recommended_plan_id || '')
      setMessage('SPIL integration completed. Pricing is now unlocked.')
      await loadWorkers()
      try {
        await loadWallet()
      } catch (error) {
        setWarning(`SPIL linked, but wallet details could not refresh: ${error.message}`)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setConnecting(null)
    }
  }

  const handleCheckout = async (planId) => {
    setCheckoutLoading(true)
    setMessage('')
    setWarning('')
    try {
      const selected = (premiumResult?.available_plans || plans).find((plan) => plan.plan_id === planId)
      if (!selected) throw new Error('Selected plan is not available')
      const shortfall = Math.max(0, Number(selected.premium_zencoins || 0) - Number(walletBalance))
      if (shortfall > 0) throw new Error(`Need ${shortfall} more ZenCoins before subscribing.`)
      await apiRequest('/api/user/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.id, plan_id: planId, ip_address: window.location.hostname }),
      })
      setMessage('Plan activated successfully. Redirecting to dashboard.')
      window.setTimeout(() => {
        window.location.href = '/'
      }, 700)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  const availablePlans = premiumResult?.available_plans || plans

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-6 py-4 text-cyan-100">{message}</div> : null}
      {warning ? <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-6 py-4 text-amber-100">{warning}</div> : null}

      <div className="flex w-fit gap-2 rounded-xl border border-white/10 bg-slate-900/50 p-2">
        <button onClick={() => setView('worker')} className={`rounded-lg px-4 py-2 font-medium transition ${view === 'worker' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
          <Users className="mr-2 inline h-4 w-4" />
          Worker View
        </button>
        {adminToken ? (
          <>
            <button onClick={() => setView('admin')} className={`rounded-lg px-4 py-2 font-medium transition ${view === 'admin' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Users className="mr-2 inline h-4 w-4" />
              Admin View
            </button>
            <button
              onClick={() => {
                onAdminLogout()
                setView('worker')
              }}
              className="rounded-lg px-4 py-2 font-medium text-red-400 transition hover:text-red-300"
            >
              Logout Admin
            </button>
          </>
        ) : (
          <span className="flex items-center px-3 text-xs text-slate-500">Log in as admin from the header to manage SPIL workers.</span>
        )}
      </div>

      {view === 'admin' && adminToken ? (
        <div className="space-y-6">
          <div className="glass-card p-8">
            <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-white">
              <Plus className="h-6 w-6 text-cyan-400" />
              Create SPIL Worker Record
            </h2>
            <form onSubmit={handleCreateSPILWorker} className="grid gap-4 md:grid-cols-2">
              <TextField label="External Worker ID" value={newWorkerForm.external_worker_id} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, external_worker_id: value })} required />
              <TextField label="Worker Name" value={newWorkerForm.name} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, name: value })} required />
              <TextField label="Employer" value={newWorkerForm.employer_name} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, employer_name: value })} required />
              <SelectField label="Platform" value={newWorkerForm.platform} options={['Swiggy', 'Zomato', 'Zepto', 'Blinkit']} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, platform: value })} />
              <SelectField label="Employment Type" value={newWorkerForm.employment_type} options={['Gig', 'Fleet', 'Contract', 'Full-time']} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, employment_type: value })} />
              <SelectField label="Risk Band" value={newWorkerForm.risk_band} options={['Low', 'Medium', 'High']} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, risk_band: value })} />
              <TextField label="Shift Pattern" value={newWorkerForm.shift_pattern} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, shift_pattern: value })} required />
              <SelectField label="Location" value={newWorkerForm.location_name} options={LOCATION_ZONES} onChange={handleLocationChange} />
              <NumberField label="Experience (years)" value={newWorkerForm.experience_years} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, experience_years: value })} step="0.1" />
              <NumberField label="Incident Count" value={newWorkerForm.incident_count} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, incident_count: value })} />
              <NumberField label="Attendance Score" value={newWorkerForm.attendance_score} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, attendance_score: value })} min="0" max="1" step="0.01" />
              <NumberField label="Reliability Score" value={newWorkerForm.reliability_score} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, reliability_score: value })} min="0" max="1" step="0.01" />
              <NumberField label="Working Hours / Week" value={newWorkerForm.avg_working_hours_per_week} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, avg_working_hours_per_week: value })} />
              <NumberField label="Rating" value={newWorkerForm.rating} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, rating: value })} min="0" max="5" step="0.1" />
              <NumberField label="Salary / Week" value={newWorkerForm.salary_per_week} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, salary_per_week: value })} />
              <NumberField label="Deliveries / Week" value={newWorkerForm.deliveries_per_week} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, deliveries_per_week: value })} />
              <NumberField label="Night Shift %" value={newWorkerForm.night_shift_percentage} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, night_shift_percentage: value })} min="0" max="1" step="0.01" />
              <NumberField label="Safety Score" value={newWorkerForm.safety_behavior_score} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, safety_behavior_score: value })} min="0" max="1" step="0.01" />
              <NumberField label="Tenure (years)" value={newWorkerForm.platform_tenure_years} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, platform_tenure_years: value })} min="0" step="0.1" />
              <NumberField label="Location Risk" value={newWorkerForm.location_risk_score} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, location_risk_score: value })} min="0" max="1" step="0.01" />
              <NumberField label="Claims Count" value={newWorkerForm.insurance_claimed_count} onChange={(value) => setNewWorkerForm({ ...newWorkerForm, insurance_claimed_count: value })} />
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-200">Notes</span>
                <textarea value={newWorkerForm.notes} onChange={(event) => setNewWorkerForm({ ...newWorkerForm, notes: event.target.value })} className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50" />
              </label>
              <button type="submit" disabled={creatingWorker} className="md:col-span-2 rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700">
                {creatingWorker ? 'Creating...' : 'Create SPIL Worker'}
              </button>
            </form>
          </div>

          <RecordGrid
            title="Existing SPIL Workers"
            records={spilWorkers}
            selected={selectedWorker}
            onSelect={setSelectedWorker}
            action={(worker) => (
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  handleAdminConnect(worker.id)
                }}
                disabled={connecting === worker.id || worker.status === 'connected'}
                className="rounded-lg bg-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/30 disabled:bg-slate-700/30 disabled:text-slate-500"
              >
                {connecting === worker.id ? 'Connecting...' : worker.status === 'connected' ? 'Connected' : 'Connect'}
              </button>
            )}
          />
        </div>
      ) : null}

      {view === 'worker' ? (
        <div className="space-y-6">
          <div className="glass-card p-8">
            <h2 className="mb-4 text-2xl font-bold text-white">Connect Your Work Profile</h2>
            <p className="text-slate-300">Only admin-created SPIL records appear here. Plans unlock after one successful SPIL integration.</p>
          </div>

          {spilWorkers.length === 0 ? (
            <div className="glass-card p-8 text-slate-300">No SPIL profiles are available yet. Ask an admin to create a worker record first.</div>
          ) : (
            <RecordGrid
              title="Available SPIL Profiles"
              records={spilWorkers}
              selected={selectedWorker}
              onSelect={(worker) => {
                setSelectedWorker(worker)
                setPremiumResult(null)
                setSelectedPlan('')
              }}
              action={(worker) => (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    handleWorkerConnect(worker)
                  }}
                  disabled={connecting === worker.id || Boolean(worker.worker_id)}
                  className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700"
                >
                  {connecting === worker.id ? 'Connecting...' : worker.worker_id ? 'Already Linked' : 'Connect Profile'}
                </button>
              )}
            />
          )}

          {premiumResult && selectedWorker ? (
            <div className="glass-card p-8">
              <h2 className="mb-6 text-2xl font-bold text-white">Unlocked Plans</h2>
              <p className="mb-4 text-sm text-slate-400">Current wallet balance: {walletBalance} ZenCoins</p>
              <div className="mb-6 grid gap-4 md:grid-cols-2">
                {availablePlans.map((plan) => (
                  <button
                    key={plan.plan_id}
                    onClick={() => setSelectedPlan(plan.plan_id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      selectedPlan === plan.plan_id ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-white/10 bg-slate-900/50 hover:border-cyan-400/30'
                    }`}
                  >
                    <h4 className="text-sm font-semibold text-white">{plan.plan_name}</h4>
                    <div className="mt-3 space-y-1 text-xs text-slate-300">
                      <p>Premium: {plan.premium_zencoins} ZenCoins/week</p>
                      <p>Max Payout: {plan.max_weekly_payout_zencoins} ZenCoins</p>
                      <p>Platform Subsidy: INR {plan.platform_subsidy_inr}</p>
                    </div>
                  </button>
                ))}
              </div>
              {selectedPlan ? (
                <button onClick={() => handleCheckout(selectedPlan)} disabled={checkoutLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-4 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700">
                  {checkoutLoading ? 'Activating plan...' : <>Activate Plan <ArrowRight className="h-4 w-4" /></>}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RecordGrid({ title, records, selected, onSelect, action }) {
  return (
    <div className="glass-card p-8">
      <h2 className="mb-6 text-2xl font-bold text-white">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {records.map((record) => (
          <div
            key={record.id}
            onClick={() => onSelect(record)}
            className={`rounded-xl border p-6 transition ${
              selected?.id === record.id ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-white/10 bg-slate-900/50 hover:border-cyan-400/30'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{record.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{record.platform}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs ${record.status === 'connected' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {record.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div>Rating: {record.rating}</div>
              <div>{record.avg_working_hours_per_week}h/week</div>
              <div>{record.location_name}</div>
              <div>INR {record.salary_per_week}/week</div>
            </div>
            {record.notes ? <p className="mt-4 text-xs text-slate-500">{record.notes}</p> : null}
            <div className="mt-4">{action(record)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, required = false }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50" required={required} />
    </label>
  )
}

function NumberField({ label, value, onChange, ...rest }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50" {...rest} />
    </label>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-cyan-400/50">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
