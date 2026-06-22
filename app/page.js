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

const ESTIMATES = {
  avatar_lipsync: '~10–20 min', // Dreamina, single step
  avatar_scene:   '~40–60 min', // PixVerse, I2V chaining
  scene:          '~60–90 min', // PixVerse, fresh actor + I2V chaining
}

// Video type definitions, per the implementation plan:
// Type 1 -> Dreamina (talking actor, pick actor, paste script)
// Type 2 -> PixVerse (pick actor, describe scene)
// Type 3 -> PixVerse (no actor selection, describe scene + actor generated on the fly)
const VIDEO_TYPES = [
  { id: 1, mode: 'avatar_lipsync', title: 'Talking Actor', desc: 'Pick an actor, paste a script', needsActor: true },
  { id: 2, mode: 'avatar_scene',   title: 'Scene + Actor', desc: 'Pick an actor, describe a scene', needsActor: true },
  { id: 3, mode: 'scene',          title: 'Fresh Scene',   desc: 'Describe everything, actor generated for you', needsActor: false },
]

function getStates(mode, status) {
  const steps = STEPS[mode] || STEPS.scene
  const map   = STATUS_IDX[mode] || STATUS_IDX.scene
  const idx   = map[status] ?? 0
  return steps.map((_, i) => i < idx ? 'done' : i === idx ? 'active' : 'idle')
}

const ENVIRONMENTS = ['HDB Home Office', 'Cafe', 'Outdoor', 'Studio']

export default function Home() {
  const [videoType, setVideoType] = useState(null) // 1, 2, or 3
  const [prompt, setPrompt]       = useState('')
  const [actors, setActors]       = useState([])
  const [selectedId, setSelected] = useState(null)
  const [jobId, setJobId]         = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  const [showGenModal, setShowGenModal] = useState(false)
  const [genPrefs, setGenPrefs]         = useState({ gender: '', age: '', environment: '', clothing: '' })
  const [generating, setGenerating]     = useState(false)
  const [genStatus, setGenStatus]       = useState(null)
  const [genError, setGenError]         = useState(null)
  const [quota, setQuota]               = useState(null) // { count, limit, remaining }

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
      if (data.status === 'complete' || data.status === 'failed') {
        clearInterval(iv)
        setLoading(false)
      }
    }, 15000)
  }

  // Polls the actor list until a new file matching the expected filename shows up.
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
    // Give up after 5 minutes so the UI doesn't spin forever if the GH Action failed
    setTimeout(() => clearInterval(iv), 5 * 60 * 1000)
  }

  async function handleForge() {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    try {
      const selectedType = VIDEO_TYPES.find(t => t.id === videoType)
      const res = await fetch('/api/start-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          avatar_id: selectedType?.needsActor ? selectedId : null,
          video_type: videoType,
        }),
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

  async function handleGenerateActor() {
    setGenerating(true)
    setGenError(null)
    setGenStatus('pending')
    try {
      const res = await fetch('/api/generate-actor', {
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

  const ageValid = genPrefs.age && Number(genPrefs.age) > 0 && Number(genPrefs.age) < 120
  const canGenerate = !generating && genPrefs.gender && ageValid && genPrefs.environment && (quota?.remaining ?? 1) > 0

  const mode   = jobStatus?.pipeline_mode
  const steps  = STEPS[mode] || []
  const states = jobStatus ? getStates(mode, jobStatus.status) : []
  const currentType = VIDEO_TYPES.find(t => t.id === videoType)

  return (
    <div style={S.container}>
      <div style={S.wordmark}>ReelForge AI</div>
      <div style={S.sub}>Free AI video generation</div>

      {!jobId && (
        <>
          <div style={S.section}>
            <div style={S.label}>1. Choose video type</div>
            <div style={S.typeRow}>
              {VIDEO_TYPES.map(t => (
                <div key={t.id} style={S.typeCard(videoType === t.id)} onClick={() => { setVideoType(t.id); setSelected(null) }}>
                  <div style={S.typeTitle}>{t.title}</div>
                  <div style={S.typeDesc}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {videoType && currentType?.needsActor && (
            <div style={S.section}>
              <div style={S.label}>2. Choose an actor</div>
              <div style={S.avatarGrid}>
                {actors.map(actor => (
                  <div key={actor.id} style={S.avatarCard(selectedId === actor.id)} onClick={() => setSelected(actor.id)}>
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

          {videoType && (
            <>
              <hr style={S.divider} />

              <div style={S.section}>
                <div style={S.label}>
                  {videoType === 1 ? '3. Paste the script' : currentType?.needsActor ? '3. Describe the scene' : '2. Describe the scene'}
                </div>
                <textarea
                  style={S.textarea}
                  placeholder={videoType === 1
                    ? 'Hey, I\'m running my business smarter now with...'
                    : 'A woman walking confidently through a neon-lit city at night...'}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                />
                <button
                  style={{ ...S.button, opacity: (currentType?.needsActor && !selectedId) ? 0.5 : 1 }}
                  onClick={handleForge}
                  disabled={loading || (currentType?.needsActor && !selectedId)}
                >
                  {loading ? 'Forging...' : 'Forge'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {jobStatus?.pipeline_mode && (
        <div style={S.section}>
          <div style={S.badge}>
            {mode === 'avatar_lipsync' ? '🧑 Talking Actor' : mode === 'avatar_scene' ? '🧑 Scene · Actor' : '🎬 Scene'}
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
            <div style={S.optionRow}>
              {ENVIRONMENTS.map(env => (
                <button key={env} style={optionBtn(genPrefs.environment === env)} onClick={() => setGenPrefs(p => ({ ...p, environment: env }))}>{env}</button>
              ))}
            </div>

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
