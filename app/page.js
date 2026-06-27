'use client'
import { useState, useEffect } from 'react'

const C = {
  bg: '#0f0f0f',
  surface: '#1a1a1a',
  border: '#2a2a2a',
  accent: '#00d4ff',
  accentDim: '#00d4ff22',
  text: '#ffffff',
  muted: '#888888',
  error: '#ff4444',
}

const S = {
  container: { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: '640px', margin: '0 auto' },
  wordmark: { color: C.accent, fontSize: '26px', fontWeight: '800', marginBottom: '8px', textAlign: 'center', letterSpacing: '-0.5px' },
  sub: { color: C.muted, fontSize: '13px', textAlign: 'center', marginBottom: '32px' },
  section: { marginBottom: '28px' },
  label: { color: C.muted, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' },
  textarea: { width: '100%', background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px', fontSize: '15px', minHeight: '90px', resize: 'vertical', boxSizing: 'border-box', outline: 'none' },
  button: { width: '100%', background: C.accent, color: '#000', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '17px', fontWeight: '700', cursor: 'pointer', marginTop: '12px' },
  buttonOutline: { background: 'transparent', color: C.accent, border: `1px solid ${C.accent}`, borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  badge: { display: 'inline-block', background: C.accentDim, color: C.accent, border: `1px solid ${C.accent}44`, borderRadius: '20px', padding: '4px 14px', fontSize: '13px', fontWeight: '600', margin: '16px 0 4px' },
  estimate: { color: C.muted, fontSize: '12px', marginBottom: '16px' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' },
  modalBox: { background: '#111', border: `1px solid ${C.border}`, borderRadius: '14px', padding: '28px', maxWidth: '420px', width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { color: C.accent, fontSize: '20px', fontWeight: '700', marginTop: 0, marginBottom: '6px' },
  optionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0 18px' },
  input: { width: '100%', background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', marginBottom: '16px' },
  avatarGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px', marginBottom: '12px' },
  avatarCard: (selected) => ({
    border: `2px solid ${selected ? C.accent : C.border}`,
    borderRadius: '10px',
    overflow: 'hidden',
    cursor: 'pointer',
    background: selected ? C.accentDim : C.surface,
    transition: 'border-color 0.15s',
  }),
  avatarImg: { width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' },
  avatarLabel: { fontSize: '11px', color: C.muted, textAlign: 'center', padding: '4px 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  noAvatar: (selected) => ({
    border: `2px solid ${selected ? C.accent : C.border}`,
    borderRadius: '10px',
    cursor: 'pointer',
    background: selected ? C.accentDim : C.surface,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    aspectRatio: '9/16', fontSize: '22px',
  }),
  stepRow: (state) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', color: state === 'done' ? C.accent : state === 'active' ? C.text : '#444' }),
  errorBox: { color: C.error, marginTop: '16px', padding: '12px', background: '#1a0000', border: '1px solid #440000', borderRadius: '8px', fontSize: '14px' },
  video: { width: '100%', borderRadius: '10px', marginTop: '20px' },
  downloadLink: { display: 'block', textAlign: 'center', marginTop: '10px', color: C.accent, textDecoration: 'none', fontWeight: '700', fontSize: '14px' },
  divider: { border: 'none', borderTop: `1px solid ${C.border}`, margin: '24px 0' },
  fieldLabel: { fontWeight: '600', marginBottom: '6px', fontSize: '14px', color: C.text },
  quotaBadge: { fontSize: '12px', color: C.muted, marginBottom: '12px' },
  typeRow: { display: 'flex', gap: '8px', marginBottom: '24px' },
  typeCard: (selected) => ({
    flex: 1,
    border: `2px solid ${selected ? C.accent : C.border}`,
    borderRadius: '10px',
    padding: '14px 10px',
    cursor: 'pointer',
    background: selected ? C.accentDim : C.surface,
    textAlign: 'center',
  }),
  typeTitle: { fontWeight: '700', fontSize: '13px', marginBottom: '4px' },
  typeDesc: { fontSize: '11px', color: C.muted },
}

function optionBtn(selected) {
  return { padding: '8px 14px', borderRadius: '6px', border: `1px solid ${selected ? C.accent : '#444'}`, background: selected ? C.accent : 'transparent', color: selected ? '#000' : C.text, cursor: 'pointer', fontSize: '13px', fontWeight: selected ? '700' : '400' }
}

const STEPS = {
  avatar_lipsync: ['Generating Script', 'Generating Voiceover', 'Animating Actor', 'Encoding', 'Ready'],
  avatar_scene:   ['Generating Script', 'Generating Scenes', 'Compositing', 'Encoding', 'Ready'],
  scene:          ['Generating Script', 'Generating Scenes', 'Stitching', 'Encoding', 'Ready'],
}

const STATUS_IDX = {
  avatar_lipsync: { pending: 0, classified: 1, voice_ready: 2, video_ready: 3, complete: 4 },
  avatar_scene:   { pending: 0, classified: 1, clips_ready: 2, video_ready: 3, complete: 4 },
  scene:          { pending: 0, classified: 1, clips_ready: 2, video_ready: 3, complete: 4 },
}

const VIDEO_TYPES = [
  { id: 1, mode: 'avatar_lipsync', title: 'Talking Actor', desc: 'Pick an actor, paste a script', needsActor: true },
  { id: 2, mode: 'avatar_scene',   title: 'Scene + Actor', desc: 'Pick an actor, describe a scene', needsActor: true },
  { id: 3, mode: 'scene',          title: 'Fresh Scene',   desc: 'Describe everything, actor generated for you', needsActor: false },
  { id: 4, mode: 'demo',           title: 'Demo Builder',  desc: 'Auto-generate a product demo video', needsActor: false },
]

const DEMO_TYPES = [
  { id: 'signup_login',                 label: '1. Signup + Login' },
  { id: 'wizard_website_templates',     label: '2. Setup Wizard + Website + Templates' },
  { id: 'products',                     label: '3. Products & Services' },
  { id: 'orders',                       label: '4. Orders' },
  { id: 'promotions',                   label: '5. Promotions' },
  { id: 'customers',                    label: '6. Customers' },
  { id: 'announcements',                label: '7. Announcements' },
  { id: 'payments_stripe_connect',      label: '8. Payment Setup (Stripe Connect)' },
  { id: 'store_agreement',              label: '9. Store Agreement' },
  { id: 'ai_mentor_action_plans',       label: '10. AI Mentor + Action Plans' },
  { id: 'referrals_referrer_dashboard', label: '11. Referrals + Referrer Dashboard' },
  { id: 'staff',                        label: '12. Staff' },
  { id: 'billing_upgrade',              label: '13. Billing + Upgrade' },
  { id: 'account',                      label: '14. Account' },
  { id: 'main_dashboard',               label: '15. Main Dashboard' },
]

const DEMO_FORM_SCHEMAS = {
  signup_login: [
    { id: 'demo_full_name',   label: 'Demo full name',   placeholder: 'Sarah Tan',         required: true },
    { id: 'demo_email',       label: 'Demo email',        placeholder: 'sarah@example.com', required: true },
    { id: 'demo_phone',       label: 'Demo phone',        placeholder: '91234567',          required: true },
    { id: 'demo_address',     label: 'Demo address',      placeholder: '123 Orchard Road',  required: true },
    { id: 'demo_postal_code', label: 'Demo postal code',  placeholder: '238858',            required: true },
    { id: 'demo_password',    label: 'Demo password',     placeholder: 'Demo@12345',        required: true },
  ],
}

const VOICES_BY_GENDER = {
  female: ['Matilda', 'Chill Girl', 'Sarah', 'Valley Girl', 'Lily'],
  male:   ['Old Style Advertising Male', 'George', 'Charlie', 'Bill', 'Chris'],
}

const DEFAULT_ACTION_TEXT = 'Maintain direct eye contact with camera at all times.'

function getStates(mode, status) {
  const steps = STEPS[mode] || STEPS.scene
  const map   = STATUS_IDX[mode] || STATUS_IDX.scene
  const idx   = map[status] ?? 0
  return steps.map((_, i) => i < idx ? 'done' : i === idx ? 'active' : 'idle')
}

export default function Home() {
  const [videoType, setVideoType]   = useState(null)
  const [prompt, setPrompt]         = useState('')
  const [actors, setActors]         = useState([])
  const [selectedId, setSelected]   = useState(null)
  const [voiceName, setVoiceName]   = useState('')
  const [actionText, setActionText] = useState(DEFAULT_ACTION_TEXT)
  const [jobId, setJobId]           = useState(null)
  const [jobStatus, setJobStatus]   = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  const [demoType, setDemoType]     = useState(null)
  const [demoVariables, setDemoVariables] = useState({})

  const [localTestLoading, setLocalTestLoading] = useState(false)
  const [localTestUrl, setLocalTestUrl]         = useState(null)
  const [localTestError, setLocalTestError]     = useState(null)
  const [localTestLog, setLocalTestLog]         = useState(null)

  const [showGenModal, setShowGenModal] = useState(false)
  const [genPrefs, setGenPrefs]         = useState({ gender: '', age: '', environment: '', clothing: '', ethnicity: '' })
  const [generating, setGenerating]     = useState(false)
  const [genStatus, setGenStatus]       = useState(null)
  const [genError, setGenError]         = useState(null)
  const [quota, setQuota]               = useState(null)

  useEffect(() => { fetchActors(); fetchQuota() }, [])

  async function fetchActors() {
    try {
      const res  = await fetch('/api/actors')
      const data = await res.json()
      if (data.actors) setActors(data.actors)
    } catch (err) {
      console.error('Failed to fetch actors:', err)
    }
  }

  async function fetchQuota() {
    try {
      const res  = await fetch('/api/generate-actor')
      const data = await res.json()
      setQuota(data)
    } catch (err) {
      console.error('Failed to fetch quota:', err)
    }
  }

  function poll(id) {
    const iv = setInterval(async () => {
      const res  = await fetch(`/api/job-status?id=${id}`)
      const data = await res.json()
      setJobStatus(data)
      if (data.status === 'complete' || data.status === 'done') {
        clearInterval(iv)
        setLoading(false)
        window.location.href = '/videos'
      } else if (data.status === 'failed') {
        clearInterval(iv)
        setLoading(false)
      }
    }, 15000)
  }

  function pollNewActor(filename) {
    const iv = setInterval(async () => {
      const res  = await fetch('/api/actors')
      const data = await res.json()
      const found = data.actors?.find(a => a.filename === filename)
      if (found) {
        clearInterval(iv)
        setActors(data.actors)
        setSelected(found.id)
        setGenerating(false)
        setGenStatus('ready')
        setShowGenModal(false)
        fetchQuota()
      }
    }, 10000)
    setTimeout(() => clearInterval(iv), 5 * 60 * 1000)
  }

  async function handleForge() {
    if (videoType !== 4 && !prompt.trim()) return
    setLoading(true)
    setError(null)
    try {
      const selectedType = VIDEO_TYPES.find(t => t.id === videoType)
      const payload = videoType === 1
        ? { video_type: 1, avatar_id: selectedId, script_text: prompt, voice_name: voiceName, action_text: actionText }
        : videoType === 4
        ? { video_type: 4, demo_type: demoType, variables: demoVariables }
        : { prompt, avatar_id: selectedType?.needsActor ? selectedId : null, video_type: videoType }

      const res  = await fetch('/api/start-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setJobId(data.job_id)
      poll(data.job_id)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleTestLocal() {
    setLocalTestLoading(true)
    setLocalTestError(null)
    setLocalTestUrl(null)
    setLocalTestLog(null)
    try {
      const res = await fetch('/api/run-demo-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_type: demoType, variables: demoVariables }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setLocalTestUrl(data.preview_url)
      setLocalTestLog(data.actions_log)
    } catch (err) {
      setLocalTestError(err.message)
    } finally {
      setLocalTestLoading(false)
    }
  }

  async function handleGenerateActor() {
    setGenerating(true)
    setGenError(null)
    setGenStatus('pending')
    try {
      const res  = await fetch('/api/generate-actor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genPrefs),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      pollNewActor(data.filename)
    } catch (err) {
      setGenerating(false)
      setGenStatus('failed')
      setGenError(err.message)
    }
  }

  const ageValid    = genPrefs.age && Number(genPrefs.age) > 0 && Number(genPrefs.age) < 120
  const canGenerate = !generating && genPrefs.gender && ageValid && genPrefs.environment && (quota?.remaining ?? 1) > 0
  const currentType = VIDEO_TYPES.find(t => t.id === videoType)

  return (
    <div style={S.container}>
      <div style={S.wordmark}>ReelForge AI</div>
      <div style={S.sub}>Free AI video generation</div>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <a href="/videos" style={{ color: C.accent, fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>📁 Video Library</a>
      </div>

      {!jobId && (
        <>
          {/* Step 1: Choose video type */}
          <div style={S.section}>
            <div style={S.label}>1. Choose video type</div>
            <div style={S.typeRow}>
              {VIDEO_TYPES.map(t => (
                <div key={t.id} style={S.typeCard(videoType === t.id)} onClick={() => { setVideoType(t.id); setSelected(null); setVoiceName(''); setDemoType(null); setDemoVariables({}) }}>
                  <div style={S.typeTitle}>{t.title}</div>
                  <div style={S.typeDesc}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Demo Builder flow */}
          {videoType === 4 && (
            <>
              <div style={S.section}>
                <div style={S.label}>2. Choose a demo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {DEMO_TYPES.map(d => (
                    <div
                      key={d.id}
                      onClick={() => { setDemoType(d.id); setDemoVariables({}) }}
                      style={{
                        padding: '12px 16px',
                        border: `2px solid ${demoType === d.id ? C.accent : C.border}`,
                        borderRadius: '8px',
                        background: demoType === d.id ? C.accentDim : C.surface,
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: demoType === d.id ? '700' : '400',
                        color: demoType === d.id ? C.accent : C.text,
                      }}
                    >
                      {d.label}
                    </div>
                  ))}
                </div>
              </div>

              {demoType && (
                <div style={S.section}>
                  <div style={S.label}>3. Fill in demo details</div>
                  {DEMO_FORM_SCHEMAS[demoType] ? (
                    <>
                      {DEMO_FORM_SCHEMAS[demoType].map(field => (
                        <div key={field.id} style={{ marginBottom: '16px' }}>
                          <div style={S.fieldLabel}>{field.label}{field.required && <span style={{ color: C.error }}> *</span>}</div>
                          <input
                            style={S.input}
                            placeholder={field.placeholder}
                            value={demoVariables[field.id] || ''}
                            onChange={e => setDemoVariables(v => ({ ...v, [field.id]: e.target.value }))}
                          />
                        </div>
                      ))}
                      {(() => {
                        const formValid = DEMO_FORM_SCHEMAS[demoType].every(f => !f.required || demoVariables[f.id])
                        return (
                          <>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                              <button
                                style={{ ...S.button, flex: 1, background: C.surface, color: C.accent, border: `2px solid ${C.accent}`, opacity: formValid ? 1 : 0.5 }}
                                onClick={handleTestLocal}
                                disabled={localTestLoading || !formValid}
                              >
                                {localTestLoading ? 'Running locally...' : '\ud83e\uddea Test Locally'}
                              </button>
                              <button
                                style={{ ...S.button, flex: 1, opacity: formValid ? 1 : 0.5 }}
                                onClick={handleForge}
                                disabled={loading || !formValid}
                              >
                                {loading ? 'Generating Demo...' : 'Generate Demo'}
                              </button>
                            </div>

                            {localTestError && (
                              <div style={{ color: C.error, fontSize: '13px', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                                {localTestError}
                              </div>
                            )}

                            {localTestUrl && (
                              <div style={{ marginBottom: '20px' }}>
                                <div style={{ ...S.fieldLabel, marginBottom: '8px' }}>Local test result:</div>
                                <video
                                  src={localTestUrl}
                                  controls
                                  style={{ width: '100%', borderRadius: '8px', border: `1px solid ${C.border}` }}
                                />
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </>
                  ) : (
                    <div style={{ color: C.muted, fontSize: '14px', fontStyle: 'italic' }}>
                      Form configuration for "{demoType}" is coming soon.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Talking Actor / Scene flows */}
          {videoType && videoType !== 4 && currentType?.needsActor && (
            <div style={S.section}>
              <div style={S.label}>2. Choose an actor</div>
              <div style={S.avatarGrid}>
                {actors.map(actor => (
                  <div key={actor.id} style={S.avatarCard(selectedId === actor.id)} onClick={() => { setSelected(actor.id); setVoiceName('') }}>
                    <img src={actor.thumbnail_url} alt={actor.name} style={S.avatarImg} />
                    <div style={S.avatarLabel}>{actor.environment} · {actor.gender} · {actor.age}</div>
                  </div>
                ))}
                <div
                  style={{ ...S.avatarCard(false), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '9/16', cursor: 'pointer' }}
                  onClick={() => { setShowGenModal(true); setGenStatus(null); setGenError(null) }}
                >
                  <span style={{ fontSize: '22px' }}>＋</span>
                  <span style={{ fontSize: '10px', color: C.muted, marginTop: '4px' }}>New Actor</span>
                </div>
              </div>
              {selectedId && <div style={{ fontSize: '12px', color: C.accent }}>✓ Actor selected</div>}
              {!selectedId && <div style={{ fontSize: '12px', color: C.muted }}>Select an actor to continue</div>}
            </div>
          )}

          {videoType && videoType !== 4 && (
            <>
              <hr style={S.divider} />

              {videoType === 1 && selectedId && (
                <div style={S.section}>
                  <div style={S.label}>3. Choose a voice</div>
                  <div style={S.optionRow}>
                    {(VOICES_BY_GENDER[actors.find(a => a.id === selectedId)?.gender] || []).map(v => (
                      <button key={v} style={optionBtn(voiceName === v)} onClick={() => setVoiceName(v)}>{v}</button>
                    ))}
                  </div>
                </div>
              )}

              <div style={S.section}>
                <div style={S.label}>
                  {videoType === 1 ? '4. Paste the script' : currentType?.needsActor ? '3. Describe the scene' : '2. Describe the scene'}
                </div>
                <textarea
                  style={S.textarea}
                  placeholder={videoType === 1 ? "Hey, I'm running my business smarter now with..." : 'A woman walking confidently through a neon-lit city at night...'}
                  value={prompt}
                  maxLength={videoType === 1 ? 240 : undefined}
                  onChange={e => setPrompt(e.target.value)}
                />
                {videoType === 1 && (
                  <div style={{ fontSize: '12px', color: prompt.length >= 240 ? C.error : C.muted, textAlign: 'right', marginTop: '4px' }}>
                    {prompt.length} / 240
                  </div>
                )}
                {videoType === 1 && (
                  <>
                    <div style={{ ...S.fieldLabel, marginTop: '16px' }}>Action <span style={{ color: C.muted, fontWeight: '400' }}>(optional, editable)</span></div>
                    <div style={{ fontSize: '11px', color: C.muted, marginBottom: '6px' }}>
                      Tip: AI struggles with hands — keep them out of frame/hidden if possible.
                    </div>
                    <textarea
                      style={{ ...S.textarea, minHeight: '60px' }}
                      value={actionText}
                      onChange={e => setActionText(e.target.value)}
                    />
                  </>
                )}
                <button
                  style={{ ...S.button, opacity: (currentType?.needsActor && !selectedId) || (videoType === 1 && !voiceName) ? 0.5 : 1 }}
                  onClick={handleForge}
                  disabled={loading || (currentType?.needsActor && !selectedId) || (videoType === 1 && !voiceName)}
                >
                  {loading ? 'Forging...' : 'Forge'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {jobId && jobStatus?.status !== 'failed' && jobStatus?.status !== 'complete' && (
        <div style={S.section}>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: C.text, marginBottom: '8px' }}>Generating your video...</div>
            <div style={{ fontSize: '13px', color: C.muted }}>This usually takes 10–15 minutes. You can close this tab and check the Video Library later.</div>
          </div>
        </div>
      )}

      {jobStatus?.status === 'complete' && (
        <div style={S.section}>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>✅</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: C.text, marginBottom: '16px' }}>Video ready!</div>
            <a href="/videos" style={{ ...S.button, textDecoration: 'none', display: 'inline-block' }}>📁 Go to Video Library</a>
          </div>
        </div>
      )}

      {jobStatus?.status === 'failed' && (
        <div style={S.errorBox}>
          {jobStatus.error || 'Something went wrong.'}
          <button style={{ ...S.buttonOutline, marginTop: '12px', width: '100%' }} onClick={() => { setJobId(null); setJobStatus(null) }}>
            Try Again
          </button>
        </div>
      )}

      {error && <div style={S.errorBox}>{error}</div>}

      {showGenModal && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <h2 style={S.modalTitle}>Generate New Actor</h2>
            <p style={{ color: C.muted, fontSize: '13px', marginBottom: '8px' }}>
              Generates a fresh actor photo via PixVerse. Takes ~1–2 min.
            </p>
            {quota && (
              <div style={S.quotaBadge}>
                {quota.remaining} of {quota.limit} generations left today
              </div>
            )}
            <div style={S.fieldLabel}>Gender</div>
            <div style={S.optionRow}>
              {['Female', 'Male'].map(g => (
                <button key={g} style={optionBtn(genPrefs.gender === g)} onClick={() => setGenPrefs(p => ({ ...p, gender: g }))}>{g}</button>
              ))}
            </div>
            <div style={S.fieldLabel}>Age</div>
            <input
              style={{ ...S.input, width: '120px' }}
              placeholder="e.g. 28"
              type="number"
              min="18"
              max="65"
              value={genPrefs.age}
              onChange={e => setGenPrefs(p => ({ ...p, age: e.target.value }))}
            />
            <div style={S.fieldLabel}>Environment</div>
            <input
              style={S.input}
              placeholder="e.g. a cozy cafe, a park, inside a car"
              value={genPrefs.environment}
              onChange={e => setGenPrefs(p => ({ ...p, environment: e.target.value }))}
            />
            <div style={S.fieldLabel}>Ethnicity <span style={{ color: C.muted, fontWeight: '400' }}>(optional)</span></div>
            <input
              style={S.input}
              placeholder="e.g. Asian, South Asian, Caucasian"
              value={genPrefs.ethnicity}
              onChange={e => setGenPrefs(p => ({ ...p, ethnicity: e.target.value }))}
            />
            <div style={S.fieldLabel}>Clothing <span style={{ color: C.muted, fontWeight: '400' }}>(optional)</span></div>
            <input
              style={S.input}
              placeholder="e.g. casual smart blouse"
              value={genPrefs.clothing}
              onChange={e => setGenPrefs(p => ({ ...p, clothing: e.target.value }))}
            />
            {genStatus === 'pending' && (
              <div style={{ color: C.accent, fontSize: '13px', margin: '12px 0' }}>
                ⏳ Generating... this takes ~1–2 min. Gallery updates automatically.
              </div>
            )}
            {genStatus === 'failed' && (
              <div style={{ color: C.error, fontSize: '13px', margin: '12px 0' }}>
                {genError || 'Generation failed.'}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                style={{ ...S.button, marginTop: 0, flex: 1, opacity: canGenerate ? 1 : 0.5 }}
                onClick={handleGenerateActor}
                disabled={!canGenerate}
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
              <button
                style={{ ...S.buttonOutline, flex: '0 0 auto' }}
                onClick={() => { setShowGenModal(false); setGenStatus(null) }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
