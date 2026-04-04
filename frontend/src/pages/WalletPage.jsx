import { useCallback, useEffect, useState } from 'react'
import { ArrowRightLeft, Coins, ShieldCheck, Wallet } from 'lucide-react'

export default function WalletPage({ currentUser, apiUrl }) {
  const [walletData, setWalletData] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [message, setMessage] = useState('')
  const [loadingAction, setLoadingAction] = useState('')
  const [topUpAmount, setTopUpAmount] = useState(100)
  const [convertAmount, setConvertAmount] = useState(50)

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
    const [walletPayload, dashboardPayload] = await Promise.all([
      apiRequest(`/api/user/wallet/${currentUser.id}`),
      apiRequest(`/api/dashboard/${currentUser.id}`),
    ])
    setWalletData(walletPayload)
    setDashboard(dashboardPayload)
  }, [apiRequest, currentUser.id])

  useEffect(() => {
    loadData().catch((error) => setMessage(error.message))
  }, [loadData])

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
      setMessage(`Purchased ${topUpAmount} ZenCoins with mock Razorpay.`)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  const handleConvert = async () => {
    setLoadingAction('convert')
    try {
      await apiRequest('/api/user/zencoins/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: currentUser.id,
          zencoins: Number(convertAmount),
        }),
      })
      setMessage(`Converted ${convertAmount} ZenCoins into INR.`)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingAction('')
    }
  }

  if (!walletData || !dashboard) {
    return <div className="glass-card p-12 text-center text-slate-400">Loading ZenCoins panel...</div>
  }

  const recommendedPlan = (dashboard.premium_quote?.available_plans || []).find(
    (plan) => plan.plan_id === dashboard.premium_quote?.recommended_plan_id,
  )
  const walletBalance = walletData.wallet?.balance || 0

  return (
    <div className="space-y-8">
      {message ? (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-6 py-4 text-cyan-100">{message}</div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-card p-8">
          <h1 className="text-3xl font-bold text-white">ZenCoins Wallet</h1>
          <p className="mt-2 text-slate-400">
            Buy plans and receive approved payouts in ZenCoins. Conversion is currently mocked at 1 ZenCoin = INR 1.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <SummaryCard icon={Coins} title="Balance" value={`${walletBalance} ZC`} caption="Available to spend" />
            <SummaryCard icon={ArrowRightLeft} title="Conversion Rate" value="1:1" caption="ZenCoin to INR" />
            <SummaryCard
              icon={ShieldCheck}
              title="Recommended Plan"
              value={recommendedPlan ? `${recommendedPlan.premium_zencoins} ZC/week` : 'Pending'}
              caption={recommendedPlan?.plan_name || 'Connect SPIL first'}
            />
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
              <h2 className="text-lg font-semibold text-white">Buy ZenCoins</h2>
              <p className="mt-2 text-sm text-slate-400">Mock Razorpay purchase flow for wallet funding.</p>
              <input
                type="number"
                min="10"
                step="10"
                value={topUpAmount}
                onChange={(event) => setTopUpAmount(event.target.value)}
                className="mt-4 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
              />
              <button
                onClick={handleTopUp}
                disabled={loadingAction === 'topup'}
                className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white transition hover:bg-cyan-600 disabled:bg-slate-700"
              >
                {loadingAction === 'topup' ? 'Processing...' : 'Purchase with Mock Razorpay'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
              <h2 className="text-lg font-semibold text-white">Convert to INR</h2>
              <p className="mt-2 text-sm text-slate-400">Approved payouts can be converted back to real currency.</p>
              <input
                type="number"
                min="1"
                max={walletBalance}
                value={convertAmount}
                onChange={(event) => setConvertAmount(event.target.value)}
                className="mt-4 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
              />
              <button
                onClick={handleConvert}
                disabled={loadingAction === 'convert' || walletBalance <= 0}
                className="mt-4 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {loadingAction === 'convert' ? 'Converting...' : 'Convert ZenCoins'}
              </button>
            </div>
          </div>
        </div>

        <div className="glass-card p-8">
          <h2 className="text-2xl font-bold text-white">Transaction History</h2>
          <div className="mt-6 space-y-3">
            {(walletData.transactions || []).length > 0 ? (
              walletData.transactions.slice(0, 12).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium capitalize text-white">{String(entry.transaction_type).replace(/_/g, ' ')}</p>
                    <p className={entry.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {entry.amount >= 0 ? '+' : ''}
                      {entry.amount} ZC
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Reference: {entry.reference || 'N/A'}</p>
                  <p className="text-xs text-slate-500">Balance after: {entry.balance_after} ZC</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-sm text-slate-400">
                No ZenCoin activity yet.
              </div>
            )}
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">AIIMS Enrollment Snapshots</h3>
            </div>
            <div className="mt-4 space-y-3">
              {(walletData.aiims_snapshots || []).length > 0 ? (
                walletData.aiims_snapshots.slice(0, 6).map((snapshot) => (
                  <div key={snapshot.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <p className="font-medium text-white">{snapshot.plan_name}</p>
                    <p className="mt-1 text-sm text-slate-400">Premium: {snapshot.premium_amount} {snapshot.wallet_currency}</p>
                    <p className="text-xs text-slate-500">IP: {snapshot.ip_address}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No subscription snapshots stored yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, title, value, caption }) {
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
