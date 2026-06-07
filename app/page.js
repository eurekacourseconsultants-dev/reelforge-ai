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
  avatarImg: { width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' },
  avatarLabel: { fontSize: '11px', color: C.muted, textAlign: 'center', padding: '4px 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  noAvatar: (selected) => ({
    border: `2px solid ${selected ? C.accent : C.border}`,
    borderRadius: '10px',
    cursor: 'pointer',
    background: selected ? C.accentDim : C.surface,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    aspectRatio: '1', fontSize: '22px',
  }),
  stepRow: (state) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', color: state === 'done' ? C.accent : state === 'active' ? C.text : '#444' }),
  errorBox: { color: C.error, marginTop: '16px', padding: '12px', background: '#1a0000', border: '1px solid #440000', borderRadius: '8px', fontSize: '14px' },
  video: { width: '100%', borderRadius: '10px', marginTop: '20px' },
  downloadLink: { display: 'block', textAlign: 'center', marginTop: '10px', color: C.accent, textDecoration: 'none', fontWeight: '700', fontSize: '14px' },
  divider: { border: 'none', borderTop: `1px solid ${C.border}`, margin: '24px 0' },
  fieldLabel: { fontWeight: '600', marginBottom: '6px', fontSize: '14px', color: C.text },
}

function optionBtn(selected) {
  return { padding: '8px 14px', borderRadius: '6px', border: `1px solid ${selected ? C.accent : '#444'}`, background: selected ? C.accent : 'transparent', color: selected ? '#000' : C.text, cursor: 'pointer', fontSize: '13px', fontWeight: selected ? '700' : '400' }
}

const STEPS = {
  avatar_lipsync: ['Generating Script', 'Generating Voiceover', 'Animating Avatar', 'Encoding', 'Ready'],
  avatar_scene:   ['Generating Script', 'Generating Avatar Scenes', 'Compositing', 'Encoding', 'Ready'],
  scene:          ['Generating Script', 'Generating Scenes', 'Stitching', 'Encoding', 'Ready'],
}

const STATUS_IDX = {
  avatar_lipsync: { pending: 0, classified: 1, voice_ready: 2, video_ready: 3, complete: 4 },
  avatar_scene:   { pending: 0, classified: 1, clips_ready: 2, video_ready: 3, complete: 4 },
  scene:          { pending: 0, classified: 1, clips_ready: 2, video_ready: 3, complete: 4 },
}

const ESTIMATES = {
  avatar_lipsync: '~30–45 min',
  avatar_scene:   '~40–60 min',
  scene:          '~60–90 min',
}

function getStates(mode, status) {
  const steps = STEPS[mode] || STEPS.scene
  const map   = STATUS_IDX[mode] || STATUS_IDX.scene
  const idx   = map[status] ?? 0
  return steps.map((_, i) => i < idx ? 'done' : i === idx ? 'active' : 'idle')
}

export default function Home() {
  const [prompt, setPrompt]       = useState('')
  const [avatars, setAvatars]     = useState([])
  const [selectedId, setSelected] = useState(null)
  const [jobId, setJobId]         = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  const [showGenModal, setShowGenModal] = useState(false)
  const [genPrefs, setGenPrefs]         = useState({ name: '', gender: '', age: '', ethnicity: '', style: '' })
  const [generating, setGenerating]     = useState(false)
  const [genStatus, setGenStatus]       = useState(null)
  const [genAvatarId, setGenAvatarId]   = useState(null)

  useEffect(() => { fetchAvatars() }, [])

  async function fetchAvatars() {
    const res  = await fetch('/api/avatars')
    const data = await res.json()
    if (data.avatars) setAvatars(data.avatars)
  }

  function poll(id) {
    const iv = setInterval(async () => {
      const res  = await fetch(`/api/job-status?id=${id}`)
      const data = await res.json()
      setJobStatus(data)
      if (data.status === 'complete' || data.status === 'failed') {
        clearInterval(iv)
        setLoading(false)
      }
    }, 15000)
  }

  function pollAvatar(id) {
    const iv = setInterval(async () => {
      const res  = await fetch('/api/avatars')
      const data = await res.json()
      const found = data.avatars?.find(a => a.id === id)
      if (found?.status === 'ready') {
        clearInterval(iv)
        setAvatars(data.avatars)
        setSelected(id)
        setGenerating(false)
        setGenStatus('ready')
        setShowGenModal(false)
      } else if (found?.status === 'failed') {
        clearInterval(iv)
        setGenerating(false)
        setGenStatus('failed')
      }
    }, 10000)
  }

  async function handleForge() {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/start-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, avatar_id: selectedId || null }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setJobId(data.job_id)
    poll(data.job_id)
  }

  async function handleGeneratePortrait() {
    const { name, gender, age, ethnicity, style } = genPrefs
    if (!gender || !age || !style) return
    setGenerating(true)
    setGenStatus('pending')
    const res  = await fetch('/api/generate-portrait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'Avatar', gender, age, ethnicity, style }),
    })
    const data = await res.json()
    if (data.error) { setGenerating(false); setGenStatus('failed'); return }
    setGenAvatarId(data.avatar_id)
    pollAvatar(data.avatar_id)
  }

  const ageValid = genPrefs.age.trim() !== '' && !isNaN(Number(genPrefs.age)) && Number(genPrefs.age) > 0 && Number(genPrefs.age) < 120
  const canGenerate = !generating && genPrefs.gender && ageValid && genPrefs.style

  const mode   = jobStatus?.pipeline_mode
  const steps  = STEPS[mode] || []
  const states = jobStatus ? getStates(mode, jobStatus.status) : []

  return (
    <div style={S.container}>
      <div style={S.wordmark}>ReelForge AI</div>
      <div style={S.sub}>Free AI video generation</div>

      {!jobId && (
        <>
          <div style={S.section}>
            <div style={S.label}>Avatar (optional)</div>
            <div style={S.avatarGrid}>
              <div style={S.noAvatar(selectedId === null)} onClick={() => setSelected(null)}>
                <span>🎬</span>
                <span style={{ fontSize: '10px', color: C.muted, marginTop: '4px' }}>None</span>
              </div>

              {avatars.map(av => (
                <div key={av.id} style={S.avatarCard(selectedId === av.id)} onClick={() => setSelected(av.id)}>
                  <img src={av.thumbnail_url} alt={av.name} style={S.avatarImg} />
                  <div style={S.avatarLabel}>{av.name}</div>
                </div>
              ))}

              <div
                style={{ ...S.avatarCard(false), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', cursor: 'pointer' }}
                onClick={() => { setShowGenModal(true); setGenStatus(null) }}
              >
                <span style={{ fontSize: '22px' }}>＋</span>
                <span style={{ fontSize: '10px', color: C.muted, marginTop: '4px' }}>New</span>
              </div>
            </div>

            {selectedId && <div style={{ fontSize: '12px', color: C.accent }}>✓ Avatar selected — pipeline will use this character</div>}
            {selectedId === null && <div style={{ fontSize: '12px', color: C.muted }}>No avatar — Wan2.1 generates its own characters</div>}
          </div>

          <hr style={S.divider} />

          <div style={S.section}>
            <div style={S.label}>Describe your video</div>
            <textarea
              style={S.textarea}
              placeholder="A woman walking confidently through a neon-lit city at night..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
            <button style={S.button} onClick={handleForge} disabled={loading}>
              {loading ? 'Forging...' : 'Forge'}
            </button>
          </div>
        </>
      )}

      {jobStatus?.pipeline_mode && (
        <div style={S.section}>
          <div style={S.badge}>
            {mode === 'avatar_lipsync' ? '🧑 Avatar · Lip Sync' : mode === 'avatar_scene' ? '🧑 Avatar · Scene' : '🎬 Scene'}
          </div>
          <div style={S.estimate}>{ESTIMATES[mode]}</div>
          {steps.map((s, i) => (
            <div key={s} style={S.stepRow(states[i])}>
              <span style={{ fontSize: '16px' }}>{states[i] === 'done' ? '✓' : states[i] === 'active' ? '⏳' : '○'}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {jobStatus?.status === 'complete' && (
        <>
          <video style={S.video} src={jobStatus.final_url} controls playsInline />
          <a style={S.downloadLink} href={jobStatus.final_url} download>⬇ Download Video</a>
        </>
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
            <h2 style={S.modalTitle}>Generate New Avatar</h2>
            <p style={{ color: C.muted, fontSize: '13px', marginBottom: '20px' }}>
              Takes ~10–15 min on Kaggle GPU. You can close this and it will appear in the gallery when ready.
            </p>

            <div style={S.fieldLabel}>Name</div>
            <input
              style={S.input}
              placeholder="e.g. Sarah"
              value={genPrefs.name}
              onChange={e => setGenPrefs(p => ({ ...p, name: e.target.value }))}
            />

            <div style={S.fieldLabel}>Gender</div>
            <div style={S.optionRow}>
              {['Female', 'Male', 'Neutral'].map(g => (
                <button key={g} style={optionBtn(genPrefs.gender === g)} onClick={() => setGenPrefs(p => ({ ...p, gender: g }))}>{g}</button>
              ))}
            </div>

            <div style={S.fieldLabel}>Age</div>
            <input
              style={{ ...S.input, width: '120px' }}
              placeholder="e.g. 28"
              type="number"
              min="1"
              max="119"
              value={genPrefs.age}
              onChange={e => setGenPrefs(p => ({ ...p, age: e.target.value }))}
            />

            <div style={S.fieldLabel}>Ethnicity <span style={{ color: C.muted, fontWeight: '400' }}>(optional)</span></div>
            <div style={S.optionRow}>
              {['Asian', 'South Asian', 'Southeast Asian', 'Black', 'Hispanic', 'Middle Eastern', 'White'].map(eth => (
                <button key={eth} style={optionBtn(genPrefs.ethnicity === eth)} onClick={() => setGenPrefs(p => ({ ...p, ethnicity: p.ethnicity === eth ? '' : eth }))}>{eth}</button>
              ))}
            </div>

            <div style={S.fieldLabel}>Style</div>
            <div style={S.optionRow}>
              {['Professional', 'Casual', 'Creative'].map(s => (
                <button key={s} style={optionBtn(genPrefs.style === s)} onClick={() => setGenPrefs(p => ({ ...p, style: s }))}>{s}</button>
              ))}
            </div>

            {genStatus === 'pending' && (
              <div style={{ color: C.accent, fontSize: '13px', margin: '12px 0' }}>
                ⏳ Generating... this takes ~10–15 min. Gallery updates automatically.
              </div>
            )}
            {genStatus === 'failed' && (
              <div style={{ color: C.error, fontSize: '13px', margin: '12px 0' }}>
                Generation failed. Check GitHub Actions logs.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                style={{ ...S.button, marginTop: 0, flex: 1, opacity: canGenerate ? 1 : 0.5 }}
                onClick={handleGeneratePortrait}
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
