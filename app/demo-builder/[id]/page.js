'use client'
import { useState, use } from 'react'

const C = {
  bg: '#0f0f0f', surface: '#1a1a1a', border: '#2a2a2a',
  accent: '#00d4ff', text: '#ffffff', muted: '#888888', error: '#ff4444',
}

const DEMO_LABELS = {
  signup_login:                 'Signup + Login',
  wizard_website_templates:     'Setup Wizard + Website + Templates',
  products:                     'Products & Services',
  orders:                       'Orders',
  promotions:                   'Promotions',
  customers:                    'Customers',
  announcements:                'Announcements',
  payments_stripe_connect:      'Payment Setup (Stripe Connect)',
  store_agreement:              'Store Agreement',
  ai_mentor_action_plans:       'AI Mentor + Action Plans',
  referrals_referrer_dashboard: 'Referrals + Referrer Dashboard',
  staff:                        'Staff',
  billing_upgrade:              'Billing + Upgrade',
  account:                      'Account',
  main_dashboard:               'Main Dashboard',
}

const SCHEMAS = {
  signup_login: [
    { id: 'demo_full_name',   label: 'Full name',   placeholder: 'Sarah Tan' },
    { id: 'demo_email',       label: 'Email',        placeholder: 'sarah@example.com' },
    { id: 'demo_phone',       label: 'Phone',        placeholder: '91234567' },
    { id: 'demo_address',     label: 'Address',      placeholder: '123 Orchard Road' },
    { id: 'demo_postal_code', label: 'Postal code',  placeholder: '238858' },
    { id: 'demo_password',    label: 'Password',     placeholder: 'Demo@12345' },
  ],
}

export default function DemoBuilderForm({ params }) {
  const { id: demoId } = use(params)
  const schema = SCHEMAS[demoId] || []
  const label  = DEMO_LABELS[demoId] || demoId

  const [fields, setFields]   = useState({})
  const [jobId, setJobId]     = useState(null)
  const [error, setError]     = useState(null)
  const [status, setStatus]   = useState('idle') // idle | generating | done | error

  function setField(id, val) {
    setFields(f => ({ ...f, [id]: val }))
  }

  const allFilled = schema.every(f => fields[f.id]?.trim())

  async function generate() {
    setStatus('generating')
    setError(null)
    try {
      const res  = await fetch('/api/start-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_type: 4, demo_type: demoId, variables: fields }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setJobId(data.job_id)
      poll(data.job_id)
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  function poll(id) {
    const iv = setInterval(async () => {
      const res  = await fetch(`/api/job-status?id=${id}`)
      const data = await res.json()
      if (data.status === 'done' || data.status === 'complete') {
        clearInterval(iv)
        setStatus('done')
      } else if (data.status === 'error' || data.status === 'failed') {
        clearInterval(iv)
        setError(data.error || 'Job failed')
        setStatus('error')
      }
    }, 10000)
  }

  const inputStyle = {
    width: '100%', background: C.surface, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: '8px',
    padding: '10px 12px', fontSize: '14px',
    boxSizing: 'border-box', outline: 'none', marginBottom: '16px',
  }

  const btnStyle = (disabled) => ({
    width: '100%', background: disabled ? '#333' : C.accent,
    color: disabled ? C.muted : '#000', border: 'none',
    borderRadius: '8px', padding: '14px', fontSize: '16px',
    fontWeight: '700', cursor: disabled ? 'not-allowed' : 'pointer', marginTop: '8px',
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: '560px', margin: '0 auto' }}>
      <div style={{ fontSize: '13px', color: C.muted, marginBottom: '20px' }}>
        <a href="/demo-builder" style={{ color: C.muted, textDecoration: 'none' }}>← All demos</a>
      </div>

      <div style={{ fontSize: '22px', fontWeight: '800', color: C.accent, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>Fill in the details below to generate this demo video.</div>

      {status === 'idle' || status === 'error' ? (
        <>
          {schema.length > 0 ? (
            <>
              {schema.map(f => (
                <div key={f.id}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>{f.label}</div>
                  <input
                    type="text"
                    placeholder={f.placeholder}
                    value={fields[f.id] || ''}
                    onChange={e => setField(f.id, e.target.value)}
                    style={inputStyle}
                  />
                </div>
              ))}
              {error && <div style={{ color: C.error, fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
              <button onClick={generate} disabled={!allFilled} style={btnStyle(!allFilled)}>
                Generate Demo
              </button>
            </>
          ) : (
            <div style={{ color: C.muted, fontStyle: 'italic' }}>This demo form is coming soon.</div>
          )}
        </>
      ) : status === 'generating' ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Generating demo...</div>
          <div style={{ fontSize: '13px', color: C.muted }}>Takes ~5–10 min. You can close this tab and check the Video Library later.</div>
          {jobId && <div style={{ fontSize: '11px', color: C.muted, marginTop: '12px' }}>Job ID: {jobId}</div>}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Demo ready!</div>
          <a href="/videos" style={{ ...btnStyle(false), textDecoration: 'none', display: 'inline-block' }}>📁 Go to Video Library</a>
        </div>
      )}
    </div>
  )
}
