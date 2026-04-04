import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Calendar, CheckCircle2, CloudRain, DollarSign, Eye, Flame, LogIn, Shield, TrendingUp, Wind, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const ANOMALY_ICONS = {
  heavy_rainfall: '🌧️',
  extreme_heat: '🔥',
  high_aqi: '😷',
  flooding: '🌊',
  curfew: '🚫',
  strike: '✊',
  zone_closure: '🚧',
}

export default function AIIMSEnginePage({ currentUser, apiUrl, adminToken, onAdminLogin, onAdminLogout }) {
  const [view, setView] = useState(adminToken ? 'admin' : 'worker')
  const [adminDashboard, setAdminDashboard] = useState(null)
  const [workerPayouts, setWorkerPayouts] = useState(null)
  const [walletData, setWalletData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Trigger form
  const [triggerType, setTriggerType] = useState('heavy_rainfall')
  const [triggerZone, setTriggerZone] = useState('hyderabad')
  const [triggerSeverity, setTriggerSeverity] = useState('')
  const [triggerHours, setTriggerHours] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState(null)

  // Event detail
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventDetail, setEventDetail] = useState(null)

  const apiRequest = useCallback(
    async (path, options = {}) => {
      const headers = { ...(options.headers || {}) }
      if (adminToken) headers.Authorization = `Bearer ${adminToken}`
      let response
      try {
        response = await fetch(`${apiUrl}${path}`, { ...options, headers })
      } catch (err) {
        throw new Error(err?.message || 'Unable to reach the server')
      }
      const rawText = await response.text()
      const data = rawText
        ? (() => {
            try { return JSON.parse(rawText) } catch { return { message: rawText } }
          })()
        : {}
      if (!response.ok) throw new Error(data.detail || data.message || `Request failed (${response.status})`)
      return data
    },
    [adminToken, apiUrl],
  )

  const loadAdminData = useCallback(async () => {
    if (!adminToken) return
    const dashboard = await apiRequest('/api/admin/aiims/dashboard')
    setAdminDashboard(dashboard)
  }, [adminToken, apiRequest])

  const loadWorkerData = useCallback(async () => {
    const [payoutData, walletPayload] = await Promise.all([
      apiRequest(`/api/user/aiims/payouts/${currentUser.id}`),
      apiRequest(`/api/user/wallet/${currentUser.id}`),
    ])
    setWorkerPayouts(payoutData)
    setWalletData(walletPayload)
  }, [apiRequest, currentUser.id])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        if (view === 'admin' && adminToken) {
          await loadAdminData()
        }
        await loadWorkerData()
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [view, adminToken, loadAdminData, loadWorkerData])

  const handleTrigger = async () => {
    setTriggering(true)
    setMessage('')
    setTriggerResult(null)
    try {
      const body = {
        anomaly_type: triggerType,
        zone_id: triggerZone,
      }
      if (triggerSeverity) body.severity = Number(triggerSeverity)
      if (triggerHours) body.hours_affected = Number(triggerHours)
      const result = await apiRequest('/api/admin/aiims/trigger-anomaly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setTriggerResult(result)
      setMessage(result.summary?.message || 'Anomaly triggered successfully.')
      await loadAdminData()
      await loadWorkerData()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setTriggering(false)
    }
  }

  const handleResolve = async (eventId) => {
    try {
      await apiRequest(`/api/admin/aiims/resolve/${eventId}`, { method: 'POST' })
      setMessage('Anomaly resolved.')
      await loadAdminData()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const handleViewEvent = async (eventId) => {
    try {
      const detail = await apiRequest(`/api/admin/aiims/events/${eventId}`)
      setEventDetail(detail)
      setSelectedEvent(eventId)
    } catch (err) {
      setMessage(err.message)
    }
  }

  if (loading) {
    return <div className="glass-card p-12 text-center text-slate-400">Loading AIIMS Engine...</div>
  }

  if (error && !adminDashboard && !workerPayouts) {
    return <div className="glass-card border border-red-400/20 bg-red-500/10 p-8 text-red-200">{error}</div>
  }

  const templates = adminDashboard?.anomaly_templates || {}
  const zoneLocations = adminDashboard?.zone_locations || {}
  const events = adminDashboard?.recent_events || []
  const payouts = workerPayouts?.payouts || []
  const totalAiimsPayout = workerPayouts?.total_aiims_payout || 0

  const chartData = payouts.map((p, i) => ({
    date: p.created_at?.split('T')[0] || `#${i + 1}`,
    amount: p.payout_zencoins || 0,
    severity: Math.round((p.severity || 0) * 100),
  }))

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-6 py-4 text-cyan-100">{message}</div> : null}

      {/* View Toggle */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2 rounded-xl border border-white/10 bg-slate-900/50 p-2">
          <button
            onClick={() => setView('worker')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === 'worker' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Activity className="mr-2 inline h-4 w-4" />
            Worker View
          </button>
          {adminToken ? (
            <button
              onClick={() => setView('admin')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === 'admin' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Shield className="mr-2 inline h-4 w-4" />
              Admin Control
            </button>
          ) : null}
        </div>
        {!adminToken ? (
          <span className="text-xs text-slate-500">Log in as admin from the header to access the anomaly trigger panel.</span>
        ) : null}
      </div>

      {/* =================== ADMIN VIEW =================== */}
      {view === 'admin' && adminToken && adminDashboard ? (
        <div className="space-y-6">
          {/* Admin Stats */}
          <div className="glass-card p-8">
            <h1 className="text-3xl font-bold text-white">AIIMS Admin Dashboard</h1>
            <p className="mt-2 text-slate-400">Trigger anomalies, monitor events, and track payouts across all workers.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-5">
              <StatCard icon={Zap} title="Total Events" value={adminDashboard.total_events} accent="cyan" />
              <StatCard icon={AlertTriangle} title="Active" value={adminDashboard.active_events} accent="amber" />
              <StatCard icon={CheckCircle2} title="Resolved" value={adminDashboard.resolved_events} accent="emerald" />
              <StatCard icon={TrendingUp} title="Workers Hit" value={adminDashboard.total_workers_affected} accent="purple" />
              <StatCard icon={DollarSign} title="Total Paid" value={`${adminDashboard.total_payout_zencoins} ZC`} accent="cyan" />
            </div>
          </div>

          {/* Trigger Panel */}
          <div className="glass-card p-8">
            <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-white">
              <Zap className="h-6 w-6 text-amber-400" />
              Trigger Anomaly Event
            </h2>
            <p className="mb-6 text-sm text-slate-400">
              Select an anomaly type and zone to simulate an external API signal. The AIIMS pipeline will automatically
              find affected subscribed workers and distribute ZenCoin payouts.
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Anomaly Type</label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-amber-400/50"
                >
                  {Object.entries(templates).map(([key, t]) => (
                    <option key={key} value={key}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Zone</label>
                <select
                  value={triggerZone}
                  onChange={(e) => setTriggerZone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-amber-400/50"
                >
                  {Object.entries(zoneLocations).map(([key, z]) => (
                    <option key={key} value={key}>{z.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Severity (0-1, optional)</label>
                <input
                  type="number" min="0" max="1" step="0.05" value={triggerSeverity}
                  onChange={(e) => setTriggerSeverity(e.target.value)}
                  placeholder={templates[triggerType]?.default_severity?.toString() || '0.7'}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-amber-400/50"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Hours Affected (optional)</label>
                <input
                  type="number" min="0.5" max="24" step="0.5" value={triggerHours}
                  onChange={(e) => setTriggerHours(e.target.value)}
                  placeholder={templates[triggerType]?.default_hours?.toString() || '4'}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-white outline-none focus:border-amber-400/50"
                />
              </div>
            </div>

            {templates[triggerType] ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/40 p-4">
                <p className="text-sm text-slate-300">
                  <span className="text-lg">{templates[triggerType].icon}</span>{' '}
                  <strong className="text-white">{templates[triggerType].label}</strong> — {templates[triggerType].description}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Default severity: {templates[triggerType].default_severity} | Default hours: {templates[triggerType].default_hours}
                </p>
              </div>
            ) : null}

            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/20 transition hover:from-amber-600 hover:to-orange-600 disabled:from-slate-700 disabled:to-slate-700 disabled:shadow-none"
            >
              {triggering ? 'Running AIIMS Pipeline...' : '⚡ Trigger Anomaly & Run Pipeline'}
            </button>
          </div>

          {/* Trigger Result */}
          {triggerResult ? (
            <div className="glass-card border border-amber-400/20 p-8">
              <h2 className="mb-4 text-xl font-bold text-white">Pipeline Result</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">Workers Affected</p>
                  <p className="text-2xl font-bold text-white">{triggerResult.summary?.workers_affected || 0}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">Total Payout</p>
                  <p className="text-2xl font-bold text-emerald-400">{triggerResult.summary?.total_payout || 0} ZC</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-sm text-slate-400">Event ID</p>
                  <p className="text-sm font-mono text-slate-300">{triggerResult.event?.id}</p>
                </div>
              </div>
              {triggerResult.summary?.payouts?.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-slate-300">Individual Payouts:</p>
                  {triggerResult.summary.payouts.map((p) => (
                    <div key={p.worker_id} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/30 p-3">
                      <div>
                        <span className="font-medium text-white">{p.name}</span>
                        <span className="ml-2 text-xs text-slate-400">{p.worker_id}</span>
                      </div>
                      <span className="font-semibold text-emerald-400">+{p.payout} ZC</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">{triggerResult.summary?.message}</p>
              )}
            </div>
          ) : null}

          {/* Events List */}
          <div className="glass-card p-8">
            <h2 className="mb-6 text-2xl font-bold text-white">Anomaly Events</h2>
            {events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 p-4">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{ANOMALY_ICONS[event.anomaly_type] || '⚠️'}</span>
                      <div>
                        <p className="font-medium text-white">{event.location_name}</p>
                        <p className="text-sm text-slate-400">
                          {event.anomaly_type.replace(/_/g, ' ')} · Severity: {Math.round(event.severity * 100)}% · {event.hours_affected}h
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-emerald-400">{event.total_payout} ZC</p>
                        <p className="text-xs text-slate-400">{event.workers_affected} worker(s)</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${event.status === 'active' ? 'bg-amber-500/20 text-amber-300' : event.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
                        {event.status}
                      </span>
                      <button
                        onClick={() => handleViewEvent(event.id)}
                        className="rounded-lg bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60"
                      >
                        <Eye className="inline h-3 w-3" /> View
                      </button>
                      {event.status === 'active' ? (
                        <button
                          onClick={() => handleResolve(event.id)}
                          className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/30"
                        >
                          Resolve
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400">No anomaly events triggered yet.</p>
            )}
          </div>

          {/* Event Detail Modal */}
          {eventDetail && selectedEvent ? (
            <div className="glass-card border border-cyan-400/20 p-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Event Detail: {eventDetail.event?.id}</h2>
                <button onClick={() => { setEventDetail(null); setSelectedEvent(null) }} className="text-sm text-slate-400 hover:text-white">Close</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm">
                <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-slate-400">Type</p>
                  <p className="font-medium text-white">{eventDetail.event?.anomaly_type}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-slate-400">Zone</p>
                  <p className="font-medium text-white">{eventDetail.event?.location_name}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-slate-400">Severity</p>
                  <p className="font-medium text-white">{Math.round((eventDetail.event?.severity || 0) * 100)}%</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-slate-400">Hours</p>
                  <p className="font-medium text-white">{eventDetail.event?.hours_affected}h</p>
                </div>
              </div>
              {eventDetail.payouts?.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-slate-300">Payout Breakdown:</p>
                  {eventDetail.payouts.map((p) => (
                    <div key={p.id} className="rounded-lg border border-white/10 bg-slate-900/30 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-white">{p.worker_name}</span>
                          <span className="ml-2 text-xs text-slate-400">{p.plan_name}</span>
                        </div>
                        <span className="font-semibold text-emerald-400">+{p.payout_zencoins} ZC</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{p.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">No payouts for this event.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* =================== WORKER VIEW =================== */}
      {view === 'worker' ? (
        <div className="space-y-6">
          <div className="glass-card p-8">
            <h1 className="text-3xl font-bold text-white">AIIMS Engine — Your Payouts</h1>
            <p className="mt-2 text-slate-400">AI-driven anomaly detection payouts credited automatically to your ZenCoin wallet.</p>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <StatCard icon={DollarSign} title="Total AIIMS Payouts" value={`${totalAiimsPayout} ZC`} accent="cyan" />
              <StatCard icon={TrendingUp} title="Events Paid" value={payouts.length} accent="emerald" />
              <StatCard icon={Calendar} title="Avg Payout" value={payouts.length > 0 ? `${Math.round(totalAiimsPayout / payouts.length)} ZC` : '0 ZC'} accent="purple" />
              <StatCard icon={Activity} title="Wallet Balance" value={`${walletData?.wallet?.balance || 0} ZC`} accent="cyan" />
            </div>
          </div>

          {/* Payout Timeline */}
          {chartData.length > 0 ? (
            <div className="glass-card p-8">
              <h2 className="mb-6 text-2xl font-bold text-white">Payout Timeline</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} formatter={(v) => `${v} ZC`} />
                  <Line type="monotone" dataKey="amount" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Payout History */}
          <div className="glass-card p-8">
            <h2 className="mb-6 text-2xl font-bold text-white">Payout History</h2>
            {payouts.length > 0 ? (
              <div className="space-y-3">
                {payouts.map((p) => (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{ANOMALY_ICONS[p.event_id?.split('-')[0]] || '⚡'}</span>
                        <div>
                          <p className="font-medium text-white">{p.plan_name}</p>
                          <p className="text-sm text-slate-400">
                            Severity: {Math.round((p.severity || 0) * 100)}% · {p.hours_affected}h affected
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-400">+{p.payout_zencoins} ZC</p>
                        <p className="text-xs text-slate-500">{p.created_at?.split('T')[0]}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{p.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-8 text-center">
                <p className="text-slate-400">No AIIMS payouts received yet. Payouts are triggered automatically when anomaly events affect your zone.</p>
              </div>
            )}
          </div>

          {/* Distribution Chart */}
          {chartData.length > 1 ? (
            <div className="glass-card p-8">
              <h2 className="mb-6 text-2xl font-bold text-white">Payout Distribution</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} formatter={(v) => `${v} ZC`} />
                  <Bar dataKey="amount" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function StatCard({ icon: Icon, title, value, accent = 'cyan' }) {
  const accentColors = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400',
  }
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-slate-400">{title}</p>
        <Icon className={`h-4 w-4 ${accentColors[accent] || 'text-cyan-400'}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}
