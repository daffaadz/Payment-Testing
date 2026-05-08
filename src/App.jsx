import { useState, useEffect, useRef, useCallback } from 'react'
import * as api from './api'
import { formatRupiah, formatDate, formatDateTime, statusLabel, bankName } from './utils'

const STEPS = ['Login', 'Pilih Tagihan', 'Checkout', 'Bayar', 'Selesai']

function useLogger() {
  const [logs, setLogs] = useState([])
  const addLog = useCallback((message, type = 'info') => {
    const ts = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [{ id: Date.now() + Math.random(), message, type, timestamp: ts }, ...prev])
  }, [])
  const clearLogs = useCallback(() => setLogs([]), [])
  return { logs, addLog, clearLogs }
}

function StepIndicator({ current }) {
  return (
    <div className="steps">
      {STEPS.map((s, i) => (
        <div key={s} className={`step ${i === current ? 'active' : ''} ${i < current ? 'completed' : ''}`}>
          <div className="step-number">{i < current ? '✓' : i + 1}</div>
          <div className="step-label">{s}</div>
        </div>
      ))}
    </div>
  )
}

function LogPanel({ logs, onClear }) {
  return (
    <div className="card">
      <div className="card-title" style={{ justifyContent: 'space-between' }}>
        <span><span className="icon">📋</span> Activity Log</span>
        {logs.length > 0 && (
          <button className="btn btn-outline btn-sm" onClick={onClear} style={{ width: 'auto' }}>Clear</button>
        )}
      </div>
      {logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <div className="empty-text">Belum ada aktivitas</div>
        </div>
      ) : (
        <div className="log-panel">
          {logs.map(l => (
            <div key={l.id} className={`log-entry ${l.type}`}>
              <span className="log-timestamp">{l.timestamp}</span>
              <span className="log-message">{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bills, setBills] = useState([])
  const [selectedBill, setSelectedBill] = useState(null)
  const [bank, setBank] = useState('bca')
  const [checkoutResult, setCheckoutResult] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [polling, setPolling] = useState(false)
  const pollRef = useRef(null)
  const [activeTab, setActiveTab] = useState('flow')
  const [lastResponse, setLastResponse] = useState(null)
  const { logs, addLog, clearLogs } = useLogger()

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const fetchBills = async () => {
    addLog('Mengambil daftar tagihan UKT...')
    try {
      const res = await api.getMyBills({ status: 'unpaid' })
      setLastResponse(res.data)
      if (res.ok) {
        const b = res.data?.data?.bills || res.data?.data || []
        setBills(b)
        addLog(`Ditemukan ${b.length} tagihan unpaid`, b.length > 0 ? 'success' : 'warning')
      } else {
        addLog(`Gagal ambil tagihan: ${res.data?.message}`, 'error')
      }
    } catch (e) { addLog(`Error: ${e.message}`, 'error') }
  }

  const handleLogin = async () => {
    setLoading(true)
    addLog(`Logging in as ${email}...`)
    try {
      const res = await api.login(email, password)
      setLastResponse(res.data)
      if (res.ok && res.data?.data?.access_token) {
        localStorage.setItem('auth_token', res.data.data.access_token)
        setUser(res.data.data.user || res.data.data)
        addLog('Login berhasil ✅', 'success')
        setStep(1)
        await fetchBills()
      } else {
        addLog(`Login gagal: ${res.data?.message || 'Unknown error'}`, 'error')
      }
    } catch (e) { addLog(`Login error: ${e.message}`, 'error') }
    setLoading(false)
  }

  const handleCheckout = async () => {
    if (!selectedBill) return
    setLoading(true)
    addLog(`Checkout tagihan #${selectedBill.id_tuition_fee} via ${bank.toUpperCase()}...`)
    try {
      const res = await api.checkout(selectedBill.id_tuition_fee, bank)
      setLastResponse(res.data)
      if (res.ok || res.status === 201) {
        const d = res.data?.data
        setCheckoutResult(d)
        addLog(`Checkout berhasil! Method: ${d?.method} ✅`, 'success')
        if (d?.va_number) addLog(`VA Number: ${d.va_number}`, 'info')
        if (d?.snap_token) addLog(`Snap Token diterima`, 'info')
        setStep(3)
      } else {
        addLog(`Checkout gagal: ${res.data?.message}`, 'error')
      }
    } catch (e) { addLog(`Checkout error: ${e.message}`, 'error') }
    setLoading(false)
  }

  const handleSnapPay = () => {
    if (!checkoutResult?.snap_token) return
    addLog('Membuka Midtrans Snap popup...')
    if (typeof window.snap !== 'undefined') {
      window.snap.pay(checkoutResult.snap_token, {
        onSuccess: (r) => { addLog('Pembayaran berhasil! ✅', 'success'); setLastResponse(r); setStep(4) },
        onPending: (r) => { addLog('Pembayaran pending ⏳', 'warning'); setLastResponse(r) },
        onError: (r) => { addLog('Pembayaran error ❌', 'error'); setLastResponse(r) },
        onClose: () => { addLog('Snap popup ditutup', 'warning') },
      })
    } else { addLog('Snap.js belum dimuat!', 'error') }
  }

  const handleCheckStatus = async () => {
    if (!selectedBill) return
    setLoading(true)
    addLog('Cek status pembayaran...')
    try {
      const res = await api.checkPaymentStatus(selectedBill.id_tuition_fee)
      setLastResponse(res.data)
      if (res.ok) {
        const d = res.data?.data
        setPaymentStatus(d)
        addLog(`Status: ${d?.verification_status}`, 'info')
        if (d?.verification_status === 'verified') { addLog('🎉 VERIFIED!', 'success'); setStep(4) }
      } else { addLog(`Gagal: ${res.data?.message}`, 'error') }
    } catch (e) { addLog(`Error: ${e.message}`, 'error') }
    setLoading(false)
  }

  const startPolling = () => {
    if (!selectedBill || polling) return
    setPolling(true)
    addLog('Polling dimulai (setiap 10 detik)...', 'info')
    const poll = async () => {
      try {
        const res = await api.checkPaymentStatus(selectedBill.id_tuition_fee)
        setLastResponse(res.data)
        const d = res.data?.data
        setPaymentStatus(d)
        const tx = d?.midtrans_status?.data?.transaction_status || d?.verification_status
        addLog(`Poll: ${d?.verification_status} / midtrans: ${tx}`, 'info')
        if (d?.verification_status === 'verified') {
          addLog('🎉 Pembayaran VERIFIED!', 'success')
          setStep(4); stopPolling()
        }
      } catch (e) { addLog(`Poll error: ${e.message}`, 'error') }
    }
    poll()
    pollRef.current = setInterval(poll, 10000)
  }

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setPolling(false)
    addLog('Polling dihentikan.', 'info')
  }

  const handleReset = () => {
    localStorage.removeItem('auth_token')
    stopPolling()
    setStep(0); setUser(null); setBills([]); setSelectedBill(null)
    setCheckoutResult(null); setPaymentStatus(null); setLastResponse(null)
    setEmail(''); setPassword('')
    clearLogs()
  }

  const copyVA = () => {
    if (checkoutResult?.va_number) {
      navigator.clipboard.writeText(checkoutResult.va_number)
      addLog('VA number disalin 📋', 'success')
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🧪 Midtrans Payment Tester</h1>
        <p className="subtitle">SIA-UGN — Simulasi Pembayaran UKT via Midtrans Sandbox</p>
        <div className="env-badge"><span className="dot"></span> Sandbox Mode</div>
      </header>

      <div className="main-grid">
        <aside className="sidebar">
          <div className="card">
            <div className="card-title"><span className="icon">🚀</span> Flow Pembayaran</div>
            <StepIndicator current={step} />
            {user && (
              <>
                <div className="divider" />
                <div className="info-row">
                  <span className="info-label">User</span>
                  <span className="info-value">{user.name || user.email}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Role</span>
                  <span className="info-value">{user.role || 'mahasiswa'}</span>
                </div>
                <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={handleReset}>
                  🔄 Reset Session
                </button>
              </>
            )}
          </div>
          <LogPanel logs={logs} onClear={clearLogs} />
        </aside>

        <main>
          <div className="card">
            <div className="tabs">
              <button className={`tab ${activeTab === 'flow' ? 'active' : ''}`} onClick={() => setActiveTab('flow')}>
                Payment Flow
              </button>
              <button className={`tab ${activeTab === 'response' ? 'active' : ''}`} onClick={() => setActiveTab('response')}>
                API Response
              </button>
            </div>

            {activeTab === 'flow' ? (
              <>
                {/* STEP 0: Login */}
                {step === 0 && (
                  <div>
                    <div className="card-title"><span className="icon">🔐</span> Login sebagai Mahasiswa</div>
                    <div className="form-group">
                      <label>Email</label>
                      <input type="email" placeholder="mahasiswa@ugn.ac.id" value={email}
                        onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <input type="password" placeholder="Password" value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                    </div>
                    <button className="btn btn-primary" onClick={handleLogin}
                      disabled={loading || !email || !password}>
                      {loading ? <><span className="spinner"></span> Logging in...</> : '🔑 Login'}
                    </button>
                    <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
                      Gunakan akun mahasiswa yang memiliki tagihan UKT aktif
                    </p>
                  </div>
                )}

                {/* STEP 1: Pilih Tagihan */}
                {step === 1 && (
                  <div>
                    <div className="card-title"><span className="icon">📄</span> Pilih Tagihan UKT</div>
                    {bills.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">📭</div>
                        <div className="empty-text">Tidak ada tagihan unpaid</div>
                        <button className="btn btn-outline btn-sm"
                          style={{ marginTop: 16, width: 'auto', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
                          onClick={fetchBills}>🔄 Refresh</button>
                      </div>
                    ) : (
                      <>
                        {bills.map(b => (
                          <div key={b.id_tuition_fee}
                            className={`bill-card ${selectedBill?.id_tuition_fee === b.id_tuition_fee ? 'selected' : ''}`}
                            onClick={() => setSelectedBill(b)}>
                            <div className="bill-period">
                              {b.academic_period?.name || `Periode #${b.id_academic_period}`}
                            </div>
                            <div className="bill-amount">{formatRupiah(b.final_amount)}</div>
                            <div className="bill-meta">
                              <span className={`badge ${statusLabel(b.status).cls}`}>
                                {statusLabel(b.status).text}
                              </span>
                              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                                Jatuh tempo: {formatDate(b.due_date)}
                              </span>
                            </div>
                          </div>
                        ))}
                        <button className="btn btn-primary" disabled={!selectedBill}
                          onClick={() => setStep(2)} style={{ marginTop: 12 }}>
                          Lanjut ke Checkout →
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* STEP 2: Checkout Config */}
                {step === 2 && selectedBill && (
                  <div>
                    <div className="card-title"><span className="icon">💳</span> Checkout Pembayaran</div>
                    <div className="info-row">
                      <span className="info-label">Tagihan</span>
                      <span className="info-value">#{selectedBill.id_tuition_fee}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Periode</span>
                      <span className="info-value">{selectedBill.academic_period?.name || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Jumlah</span>
                      <span className="info-value" style={{ color: 'var(--accent-cyan)' }}>
                        {formatRupiah(selectedBill.final_amount)}
                      </span>
                    </div>
                    <div className="divider" />
                    <div className="form-group">
                      <label>Pilih Bank VA</label>
                      <select value={bank} onChange={e => setBank(e.target.value)}>
                        <option value="bca">BCA</option>
                        <option value="bni">BNI</option>
                        <option value="bri">BRI</option>
                      </select>
                      <p className="hint">Bank untuk Virtual Account pembayaran</p>
                    </div>
                    <div className="action-group">
                      <button className="btn btn-outline" onClick={() => setStep(1)}>← Kembali</button>
                      <button className="btn btn-primary" onClick={handleCheckout} disabled={loading}>
                        {loading ? <><span className="spinner"></span> Processing...</> : '🚀 Checkout'}
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Payment */}
                {step === 3 && checkoutResult && (
                  <div>
                    <div className="card-title"><span className="icon">✅</span> Transaksi Dibuat</div>
                    <div className="info-row">
                      <span className="info-label">Method</span>
                      <span className={`badge ${checkoutResult.method === 'core_api' ? 'badge-success' : 'badge-info'}`}>
                        {checkoutResult.method === 'core_api' ? '🔧 Core API' : '📦 Snap Fallback'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Order ID</span>
                      <span className="info-value" style={{ fontFamily: 'monospace', fontSize: '.78rem' }}>
                        {checkoutResult.midtrans_order_id}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Bank</span>
                      <span className="info-value">{bankName(checkoutResult.midtrans_va_bank)}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Expiry</span>
                      <span className="info-value">{formatDateTime(checkoutResult.expiry_time)}</span>
                    </div>

                    {checkoutResult.method === 'core_api' && checkoutResult.va_number && (
                      <>
                        <div className="va-display">
                          <div className="bank-name">Bank {bankName(checkoutResult.midtrans_va_bank)}</div>
                          <div className="va-number">{checkoutResult.va_number}</div>
                          <button className="copy-btn" onClick={copyVA}>📋 Salin</button>
                          <div className="va-amount">{formatRupiah(checkoutResult.amount)}</div>
                          <div className="va-expiry">Berlaku sampai {formatDateTime(checkoutResult.expiry_time)}</div>
                        </div>
                        <div className="instructions">
                          <h4>Cara Bayar via {bankName(checkoutResult.midtrans_va_bank)}:</h4>
                          <ol>
                            <li>Buka ATM / m-banking {bankName(checkoutResult.midtrans_va_bank)}</li>
                            <li>Pilih menu <strong>Transfer</strong></li>
                            <li>Pilih <strong>{bankName(checkoutResult.midtrans_va_bank)} Virtual Account</strong></li>
                            <li>Masukkan VA: <strong>{checkoutResult.va_number}</strong></li>
                            <li>Konfirmasi sebesar <strong>{formatRupiah(checkoutResult.amount)}</strong></li>
                          </ol>
                        </div>
                        <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
                          💡 Gunakan{' '}
                          <a href="https://simulator.sandbox.midtrans.com/bca/va/index" target="_blank"
                            rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>
                            Midtrans Sandbox Simulator
                          </a>{' '}
                          untuk simulasi pembayaran
                        </p>
                      </>
                    )}

                    {checkoutResult.method === 'snap' && checkoutResult.snap_token && (
                      <div className="va-display" style={{
                        borderColor: 'rgba(139,92,246,0.3)',
                        background: 'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(59,130,246,0.08))'
                      }}>
                        <div className="bank-name" style={{ color: 'var(--accent-violet)' }}>Midtrans Snap</div>
                        <p style={{ fontSize: '.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                          Gunakan Snap popup atau redirect
                        </p>
                        <button className="btn btn-primary btn-sm"
                          style={{ width: 'auto', margin: '0 auto' }} onClick={handleSnapPay}>
                          🔓 Buka Snap Popup
                        </button>
                        {checkoutResult.redirect_url && (
                          <p style={{ marginTop: 8 }}>
                            <a href={checkoutResult.redirect_url} target="_blank" rel="noreferrer"
                              style={{ color: 'var(--accent-cyan)', fontSize: '.82rem' }}>
                              Atau buka halaman redirect →
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                    <div className="divider" />
                    <div className="action-group">
                      <button className="btn btn-outline" onClick={handleCheckStatus} disabled={loading}>
                        {loading ? <span className="spinner"></span> : '🔍'} Cek Status
                      </button>
                      <button className={`btn ${polling ? 'btn-warning' : 'btn-success'}`}
                        onClick={polling ? stopPolling : startPolling}>
                        {polling ? '⏹ Stop Polling' : '🔄 Auto Poll'}
                      </button>
                    </div>
                    {polling && (
                      <div className="poll-indicator">
                        <span className="poll-dot"></span> Polling setiap 10 detik...
                      </div>
                    )}

                    {paymentStatus && (
                      <>
                        <div className="divider" />
                        <div className="card-title"><span className="icon">📊</span> Status Pembayaran</div>
                        <div className="info-row">
                          <span className="info-label">Verification</span>
                          <span className={`badge ${statusLabel(paymentStatus.verification_status).cls}`}>
                            {statusLabel(paymentStatus.verification_status).text}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Midtrans</span>
                          <span className="info-value">
                            {paymentStatus.midtrans_status?.data?.transaction_status
                              || paymentStatus.midtrans_status?.transaction_status || '-'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* STEP 4: Done */}
                {step === 4 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
                    <h2 style={{
                      fontSize: '1.5rem', fontWeight: 700, marginBottom: 8,
                      background: 'var(--gradient-success)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                    }}>Pembayaran Berhasil!</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
                      Tagihan UKT telah dibayar dan diverifikasi
                    </p>
                    <button className="btn btn-primary" style={{ width: 'auto', margin: '0 auto' }}
                      onClick={handleReset}>🔄 Mulai Ulang</button>
                  </div>
                )}
              </>
            ) : (
              <div>
                <div className="card-title"><span className="icon">📡</span> Last API Response</div>
                {lastResponse ? (
                  <div className="response-viewer">
                    <pre>{JSON.stringify(lastResponse, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">📡</div>
                    <div className="empty-text">Belum ada response</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
