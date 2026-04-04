import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, BadgeIndianRupee, Coins, RefreshCw, ShieldCheck, Zap } from 'lucide-react'
import { QRCode } from 'react-qr-code'

export default function DashboardPage({ currentUser, apiUrl, adminToken }) {
  const [dashboard, setDashboard] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [walletData, setWalletData] = useState(null)
  const [loadingAction, setLoadingAction] = useState('')
  const [message, setMessage] = useState('')
  const [topUpAmount, setTopUpAmount] = useState(100)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [planConsent, setPlanConsent] = useState(false)
  const [autoSub, setAutoSub] = useState(null)
  const [autoSubLoading, setAutoSubLoading] = useState(false)
  const [aiimsPayouts, setAiimsPayouts] = useState([])

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

  const loadData = useCallback(async () => {
    const [dashData, subData, walletPayload, autoSubData, aiimsData] = await Promise.all([
      apiRequest(`/api/dashboard/${currentUser.id}`),
      apiRequest(`/api/user/subscription-status/${currentUser.id}`),
      apiRequest(`/api/user/wallet/${currentUser.id}`),
      apiRequest(`/api/user/auto-subscription/${currentUser.id}`).catch(() => ({ enabled: false })),
      apiRequest(`/api/user/aiims/payouts/${currentUser.id}`).catch(() => ({ payouts: [], total_aiims_payout: 0 })),
    ])
    setDashboard(dashData)
    setSubscription(subData)
    setWalletData(walletPayload)
    setAutoSub(autoSubData)
    setAiimsPayouts(aiimsData.payouts || [])
  }, [apiRequest, currentUser.id])

  useEffect(() => {
    loadData().catch((error) => setMessage(error.message))
  }, [loadData])

  const handleToggleAutoSub = async () => {
    setAutoSubLoading(true)
    try {
      const currentPlanId = subscription?.plan_name?.toLowerCase().includes('super') ? 'super' : 'basic'
      const newEnabled = !(autoSub?.enabled)
      const result = await apiRequest('/api/user/auto-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: currentUser.id,
          plan_id: currentPlanId,
          enabled: newEnabled,
        }),
      })
      setAutoSub(result.auto_subscription || { enabled: newEnabled })
      setMessage(newEnabled ? 'Auto-renewal enabled. Your plan will renew every Sunday at 8 PM.' : 'Auto-renewal disabled.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setAutoSubLoading(false)
    }
  }

  const handleTopUp = async () => {
    setLoadingAction('topup')
    try {
      await apiRequest('/api/user/zencoins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: currentUser.id,
          rupee_amount: Number(topUpAmount),
        }),
      })
      setMessage(`Purchased ${topUpAmount} ZenCoins using mock Razorpay.`)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleConvert = async (amount) => {
    setLoadingAction('convert')
    try {
      await apiRequest('/api/user/zencoins/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: currentUser.id,
          zencoins: amount,
        }),
      })
      setMessage(`Converted ${amount} ZenCoins back to INR.`)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleRegenerateQr = async () => {
    setLoadingAction('qr')
    try {
      const payload = await apiRequest('/api/auth/regenerate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.id, reason: 'Manual worker refresh' }),
      })
      setDashboard((previous) => (previous ? { ...previous, qr_login: payload.qr_login } : previous))
      setMessage('ZenPass QR refreshed. Older QR links are now invalid.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleCopyQr = async () => {
    const qrUri = dashboard?.qr_login?.uri
    if (!qrUri) return
    try {
      await navigator.clipboard.writeText(qrUri)
      setMessage('ZenPass QR link copied.')
    } catch {
      setMessage('Unable to copy automatically. You can still use the QR or manual text below.')
    }
  }

  const handleSubscribe = async () => {
    if (!selectedPlanId) return
    setLoadingAction('subscribe')
    try {
      const payload = await apiRequest('/api/user/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: currentUser.id,
          plan_id: selectedPlanId,
          ip_address: window.location.hostname,
        }),
      })
      setMessage(payload.message || 'Policy updated successfully.')
      setPlanConsent(false)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleCancelPolicy = async () => {
    setLoadingAction('cancel')
    try {
      const payload = await apiRequest('/api/user/cancel-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.id }),
      })
      setMessage(payload.message || 'Policy cancelled successfully.')
      setPlanConsent(false)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const premium = dashboard?.premium_quote
  const plans = premium?.available_plans || []
  const walletBalance = walletData?.wallet?.balance || 0
  const hasSpil = Boolean(dashboard?.spil_profile)
  const hasSubscription = Boolean(subscription?.subscribed)
  const qrLogin = dashboard?.qr_login

  useEffect(() => {
    if (!plans.length) {
      setSelectedPlanId('')
      return
    }
    setSelectedPlanId((previous) => previous || subscriptionPlanId(plans, subscription?.plan_name) || premium?.recommended_plan_id || plans[0]?.plan_id || '')
  }, [plans, premium?.recommended_plan_id, subscription?.plan_name])

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.plan_id === selectedPlanId) || null,
    [plans, selectedPlanId],
  )

  const currentPlan = useMemo(
    () => plans.find((plan) => plan.plan_name === subscription?.plan_name) || null,
    [plans, subscription?.plan_name],
  )

  const highestPlan = useMemo(() => {
    if (!plans.length) return null
    return [...plans].sort((left, right) => Number(right.upgrade_rank || 0) - Number(left.upgrade_rank || 0))[0]
  }, [plans])

  const isUpgrade = Boolean(hasSubscription && currentPlan && selectedPlan && Number(selectedPlan.upgrade_rank || 0) > Number(currentPlan.upgrade_rank || 0))
  const isCurrentPlan = Boolean(hasSubscription && currentPlan && selectedPlan && currentPlan.plan_id === selectedPlan.plan_id)
  const canUpgrade = Boolean(hasSubscription && currentPlan && highestPlan && currentPlan.plan_id !== highestPlan.plan_id)
  const shortfall = selectedPlan ? Math.max(0, Number(selectedPlan.premium_zencoins || 0) - Number(walletBalance)) : 0

  if (!dashboard || !walletData) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-slate-400">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {message ? (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-6 py-4 text-cyan-100">{message}</div>
      ) : null}

      <div className="glass-card p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Dashboard</p>
            <h1 className="mt-1 text-3xl font-bold text-white">{currentUser.name}'s Protection Profile</h1>
          </div>
          <div className={`rounded-full border px-4 py-2 text-sm font-medium ${hasSubscription ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
            {hasSubscription ? 'Subscribed' : 'Not Subscribed'}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Coins} title="ZenCoin Balance" value={`${walletBalance}`} caption="Used directly for policy purchase" />
          <StatCard icon={BadgeIndianRupee} title="Recommended Premium" value={premium ? `${premium.weekly_premium_zencoins} ZC` : 'Pending'} caption={premium?.recommended_plan_name || 'After SPIL integration'} />
          <StatCard icon={ShieldCheck} title="Max Payout" value={premium ? `${premium.max_weekly_payout} ZC` : 'Pending'} caption="Paid in ZenCoins" />
          <StatCard icon={Activity} title="Risk Score" value={premium ? premium.risk_score : '--'} caption={premium ? `Risk level: ${premium.risk_level}` : 'Needs SPIL data'} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-8">
          <div className="glass-card p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Current Policy</h2>
                <p className="mt-2 text-slate-400">Choose a plan, review the full details, confirm you have read it, then subscribe using existing ZenCoins.</p>
              </div>
              {hasSubscription ? (
                <button
                  onClick={handleCancelPolicy}
                  disabled={loadingAction === 'cancel'}
                  className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 font-semibold text-red-100 transition hover:bg-red-500/20 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {loadingAction === 'cancel' ? 'Cancelling...' : 'Cancel Policy'}
                </button>
              ) : null}
            </div>

            {hasSubscription ? (
              <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-6">
                <p className="text-sm uppercase tracking-wide text-emerald-300">Active Cover</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{subscription.plan_name}</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm text-slate-200">
                  <div>Premium: {subscription.premium_amount} ZC</div>
                  <div>Start: {subscription.subscription_start?.split('T')[0]}</div>
                  <div>End: {subscription.subscription_end?.split('T')[0]}</div>
                </div>
                <p className="mt-4 text-sm text-slate-400">
                  {canUpgrade ? 'A higher-tier upgrade is available from your current policy.' : 'You are already on the highest available policy tier.'}
                </p>

                {/* Auto-Subber Toggle */}
                <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-3">
                    <RefreshCw className={`h-5 w-5 ${autoSub?.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div>
                      <p className="text-sm font-medium text-white">Auto Subber</p>
                      <p className="text-xs text-slate-400">Automatically renew every Sunday at 8 PM if wallet has funds</p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAutoSub}
                    disabled={autoSubLoading}
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      autoSub?.enabled ? 'bg-emerald-500' : 'bg-slate-600'
                    } disabled:opacity-50`}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        autoSub?.enabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-6 text-amber-100">
                No active policy yet. Review a plan below and subscribe using your ZenCoin balance.
              </div>
            )}
          </div>

          <div className="glass-card p-8">
            <h2 className="mb-6 text-2xl font-bold text-white">Formula-Based Plans</h2>
            {!hasSpil ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-6 text-amber-100">
                Complete SPIL integration first. Only admin-created SPIL records can unlock pricing, and plan prices stay hidden until then.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.plan_id}
                      onClick={() => {
                        setSelectedPlanId(plan.plan_id)
                        setPlanConsent(false)
                      }}
                      className={`rounded-2xl border p-6 text-left transition ${selectedPlanId === plan.plan_id ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-white/10 bg-slate-900/50 hover:border-cyan-400/30'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold text-white">{plan.plan_name}</h3>
                          <p className="mt-2 text-sm text-slate-400">{plan.summary}</p>
                        </div>
                        {currentPlan?.plan_id === plan.plan_id ? (
                          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">Current</span>
                        ) : null}
                      </div>
                      <div className="mt-5 grid gap-2 text-sm text-slate-300">
                        <p>Premium: {plan.premium_zencoins} ZC/week</p>
                        <p>Coverage Window: {plan.coverage_hours} hours</p>
                        <p>Max Weekly Payout: {plan.max_weekly_payout_zencoins} ZC</p>
                        <p>Platform Subsidy: INR {plan.platform_subsidy_inr}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedPlan ? (
                  <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm uppercase tracking-wide text-cyan-300">Plan Details</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">{selectedPlan.plan_name}</h3>
                        <p className="mt-3 text-slate-300">{selectedPlan.summary}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-right text-sm text-slate-200">
                        <div>{selectedPlan.premium_zencoins} ZC / week</div>
                        <div className="text-slate-400">{selectedPlan.max_weekly_payout_zencoins} ZC max payout</div>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-6 md:grid-cols-2">
                      <DetailList title="Benefits" items={selectedPlan.benefits || []} />
                      <DetailList title="Exclusions" items={selectedPlan.exclusions || []} />
                    </div>

                    <div className="mt-6">
                      <DetailList title="Claim Rules" items={selectedPlan.claim_rules || []} />
                    </div>

                    <div className="mt-6 rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
                      <p>Coverage Hours: {selectedPlan.coverage_hours}</p>
                      <p>Platform Subsidy: INR {selectedPlan.platform_subsidy_inr}</p>
                      <p>Wallet Balance: {walletBalance} ZC</p>
                      {shortfall > 0 ? <p className="text-amber-300">Need {shortfall} more ZenCoins before subscribing.</p> : null}
                    </div>

                    <label className="mt-6 flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={planConsent}
                        onChange={(event) => setPlanConsent(event.target.checked)}
                        className="mt-1 h-4 w-4 accent-cyan-500"
                      />
                      <span>{selectedPlan.terms_confirmation || 'I have read the full plan details and agree to continue.'}</span>
                    </label>

                    <div className="mt-6 flex flex-wrap gap-3">
                      {!hasSubscription ? (
                        <button
                          onClick={handleSubscribe}
                          disabled={loadingAction === 'subscribe' || !planConsent || shortfall > 0}
                          className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700"
                        >
                          {loadingAction === 'subscribe' ? 'Subscribing...' : 'Subscribe with ZenCoins'}
                        </button>
                      ) : null}

                      {isUpgrade ? (
                        <button
                          onClick={handleSubscribe}
                          disabled={loadingAction === 'subscribe' || !planConsent || shortfall > 0}
                          className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700"
                        >
                          {loadingAction === 'subscribe' ? 'Upgrading...' : 'Upgrade Policy'}
                        </button>
                      ) : null}

                      {isCurrentPlan ? (
                        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100">
                          Already subscribed to this plan
                        </div>
                      ) : null}

                      {hasSubscription && !isUpgrade && !isCurrentPlan ? (
                        <div className="rounded-xl border border-white/10 bg-slate-950/40 px-5 py-3 text-sm text-slate-400">
                          Downgrade is disabled. Cancel the current policy first if you want to move down a tier.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="glass-card p-8">
            <h2 className="mb-6 text-2xl font-bold text-white">ZenPass QR Login</h2>
            <div className="rounded-2xl border border-white/10 bg-white p-4">
              <QRCode value={qrLogin?.uri || 'zensure://login/unavailable'} size={180} className="mx-auto h-auto w-full max-w-48" />
            </div>
            <p className="mt-4 text-sm text-slate-300">
              This QR is unique to your account and works with the QR login tab on the sign-in screen.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/50 p-4 text-sm text-slate-300">
              <p><strong className="text-white">Version:</strong> {qrLogin?.version}</p>
              <p><strong className="text-white">Rotated:</strong> {qrLogin?.rotated_at?.split('T')[0] || 'Just now'}</p>
            </div>
            <textarea
              readOnly
              value={qrLogin?.uri || ''}
              className="mt-4 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300 outline-none"
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button onClick={handleCopyQr} className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 font-semibold text-white transition hover:border-cyan-400/40">
                Copy QR Link
              </button>
              <button
                onClick={handleRegenerateQr}
                disabled={loadingAction === 'qr'}
                className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700"
              >
                {loadingAction === 'qr' ? 'Refreshing...' : 'Regenerate Unique QR'}
              </button>
            </div>
          </div>

          <div className="glass-card p-8">
            <h2 className="mb-6 text-2xl font-bold text-white">ZenCoins Wallet</h2>
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <p className="text-sm text-slate-400">Top up your wallet first, then subscribe directly with ZenCoins from the plan details section.</p>
              <label className="mt-4 block text-sm font-medium text-slate-200">Top-up Amount (INR)</label>
              <input
                type="number"
                min="10"
                step="10"
                value={topUpAmount}
                onChange={(event) => setTopUpAmount(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
              />
              <button
                onClick={handleTopUp}
                disabled={loadingAction === 'topup'}
                className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700"
              >
                {loadingAction === 'topup' ? 'Processing...' : 'Buy ZenCoins'}
              </button>
              <button
                onClick={() => handleConvert(Math.min(50, walletBalance))}
                disabled={loadingAction === 'convert' || walletBalance <= 0}
                className="mt-3 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {loadingAction === 'convert' ? 'Converting...' : `Convert up to ${Math.min(50, walletBalance)} ZenCoins`}
              </button>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-lg font-semibold text-white">Recent Wallet Activity</h3>
              <div className="space-y-3">
                {(walletData.transactions || []).slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium capitalize text-white">{String(entry.transaction_type).replace(/_/g, ' ')}</p>
                      <p className={entry.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {entry.amount >= 0 ? '+' : ''}{entry.amount} ZC
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Balance after: {entry.balance_after} ZC</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-8">
        <h2 className="mb-6 text-2xl font-bold text-white">Recent Payouts</h2>

        {/* AIIMS Anomaly Payouts */}
        {aiimsPayouts.length > 0 ? (
          <div className="mb-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <Zap className="h-5 w-5 text-amber-400" />
              AIIMS Anomaly Payouts
            </h3>
            <div className="space-y-2">
              {aiimsPayouts.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-amber-400/10 bg-amber-500/5 p-4">
                  <div>
                    <p className="font-medium text-white">{p.plan_name}</p>
                    <p className="text-sm text-slate-400">
                      Severity: {Math.round((p.severity || 0) * 100)}% · {p.hours_affected}h affected
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-400">+{p.payout_zencoins} ZC</p>
                    <p className="text-xs text-slate-500">{p.created_at?.split('T')[0]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Manual Claims */}
        {dashboard.claims && dashboard.claims.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Scenario Claims</h3>
            {dashboard.claims.slice(0, 5).map((claim) => (
              <div key={claim.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 p-4">
                <div>
                  <p className="font-medium text-white">{claim.title}</p>
                  <p className="text-sm text-slate-400">{claim.created_at?.split('T')[0]}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${claim.status === 'Approved' ? 'text-emerald-400' : claim.status === 'Review' ? 'text-amber-400' : 'text-red-400'}`}>
                    {claim.status}
                  </p>
                  <p className="text-sm text-slate-400">{claim.payout_amount} ZC</p>
                </div>
              </div>
            ))}
          </div>
        ) : aiimsPayouts.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-slate-900/50 p-8 text-center">
            <p className="text-slate-400">No claims or AIIMS payouts yet. Approved payouts will be credited to the ZenCoins wallet.</p>
          </div>
        ) : null}
      </div>

      {!hasSpil ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-6 py-4 text-amber-100">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          SPIL must be completed once before plans can be purchased. Reconnecting is intentionally disabled after the first successful link.
        </div>
      ) : null}
    </div>
  )
}

function subscriptionPlanId(plans, planName) {
  return plans.find((plan) => plan.plan_name === planName)?.plan_id || ''
}

function DetailList({ title, items }) {
  return (
    <div>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-cyan-300">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
            {item}
          </p>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, title, value, caption }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-slate-400">{title}</p>
        <Icon className="h-4 w-4 text-cyan-400" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{caption}</p>
    </div>
  )
}
