'use client'
import { useState } from 'react'

const STYLES = {
  container: { minHeight: '100vh', background: '#0f0f0f', color: '#fff', fontFamily: 'sans-serif', padding: '24px 16px', maxWidth: '600px', margin: '0 auto' },
  wordmark: { color: '#e8a427', fontSize: '28px', fontWeight: 'bold', marginBottom: '32px', textAlign: 'center' },
  textarea: { width: '100%', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '12px', fontSize: '16px', minHeight: '100px', resize: 'vertical', boxSizing: 'border-box' },
  button: { width: '100%', background: '#e8a427', color: '#000', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', marginTop: '12px' },
  badge: { display: 'inline-block', background: '#e8a427', color: '#000', borderRadius: '20px', padding: '4px 14px', fontSize: '14px', fontWeight: 'bold', margin: '16px 0 4px' },
  estimate: { color: '#888', fontSize: '13px', marginBottom: '16px' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalBox: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '28px', maxWidth: '400px', width: '90%' },
  optionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0 16px' },
  error: { color: '#ff4444', marginTop: '16px' },
  videoWrap: { marginTop: '24px' },
  video: { width: '100%', borderRadius: '8px' },
  download: { display: 'block', textAlign: 'center', marginTop: '12px', color: '#e8a427', textDecoration: 'none', fontWeight: 'bold' },
}

function stepStyle(state) {
  return { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', color: state === 'done' ? '#e8a427' : state === 'active' ? '#fff' : '#555' }
}

function optionStyle(selected) {
  return { padding: '8px 14px', borderRadius: '6px', border: `1px solid ${selected ? '#e8a427' : '#444'}`, background: selected ? '#e8a427' : 'transparent', color: selected ? '#000' : '#fff', cursor: 'pointer', fontSize: '14px' }
}

const SPOKESPERSON_STEPS = ['Generating Portrait', 'Script Forged', 'Voiceover Ready', 'Animating Spokesperson', 'Encoding', 'Ready']
const SCENE_STEPS = ['Scenes Planned', 'Forging Clips', 'Stitching', 'Encoding', 'Ready']

function getStepStates(steps, status, mode) {
  const map = mode === 'spokesperson'
    ? { pending: 0, classified: 1, portrait_ready: 1, voice_ready: 2, video_ready: 3, complete: 5 }
    : { pending: 0, classified: 1, clips_ready: 2, video_ready: 3, complete: 4 }
  const idx = map[status] ?? 0
  return steps.map((s, i) => i < idx ? 'done' : i === idx ? 'active' : 'idle')
}

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [portraitNeeded, setPortraitNeeded] = useState(false)
  const [prefs, setPrefs] = useState({ gender: '', age: '', style: '' })

  function poll(id) {
    const iv = setInterval(async () => {
      const res = await fetch(`/api/job-status?id=${id}`)
      const data = await res.json()
      setJobStatus(data)
      if (data.status === 'complete' || data.status === 'failed') {
        clearInterval(iv)
        setLoading(false)
      }
    }, 15000)
  }

  async function startJob(portrait_prefs) {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/start-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, portrait_prefs }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setJobId(data.job_id)
    poll(data.job_id)
  }

  async function handleForge() {
    if (!prompt.trim()) return
    const res = await fetch('/api/start-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, _checkOnly: true }),
    })
    const data = await res.json()
    if (data.portrait_needed) {
      setPortraitNeeded(true)
      setShowModal(true)
      return
    }
    startJob(null)
  }

  function handleModalSubmit() {
    if (!prefs.gender || !prefs.age || !prefs.style) return
    setShowModal(false)
    startJob(prefs)
  }

  const mode = jobStatus?.pipeline_mode
  const steps = mode === 'spokesperson' ? SPOKESPERSON_STEPS : SCENE_STEPS
  const states = jobStatus ? getStepStates(steps, jobStatus.status, mode) : []

  return (
    <div style={STYLES.container}>
      <div style={STYLES.wordmark}>ReelForge AI</div>

      {!jobId && (
        <>
          <textarea
            style={STYLES.textarea}
            placeholder="Describe your video..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button style={STYLES.button} onClick={handleForge} disabled={loading}>
            {loading ? 'Forging...' : 'Forge'}
          </button>
        </>
      )}

      {jobStatus?.pipeline_mode && (
        <>
          <div style={STYLES.badge}>
            {mode === 'spokesperson' ? 'Spokesperson Mode' : 'Scene Mode'}
          </div>
          <div style={STYLES.estimate}>
            {mode === 'spokesperson' ? '~30-45 min' : '~60-90 min'}
          </div>
          {steps.map((s, i) => (
            <div key={s} style={stepStyle(states[i])}>
              <span>{states[i] === 'done' ? 'V' : states[i] === 'active' ? '...' : 'O'}</span>
              <span>{s}</span>
            </div>
          ))}
        </>
      )}

      {jobStatus?.status === 'complete' && (
        <div style={STYLES.videoWrap}>
          <video style={STYLES.video} src={jobStatus.final_url} controls playsInline />
          <a style={STYLES.download} href={jobStatus.final_url} download>Download Video</a>
        </div>
      )}

      {jobStatus?.status === 'failed' && (
        <div style={STYLES.error}>
          {jobStatus.error || 'Something went wrong.'}
          <button style={{ ...STYLES.button, marginTop: '12px' }} onClick={() => { setJobId(null); setJobStatus(null) }}>Retry</button>
        </div>
      )}

      {error && <div style={STYLES.error}>{error}</div>}

      {showModal && (
        <div style={STYLES.modal}>
          <div style={STYLES.modalBox}>
            <h2 style={{ color: '#e8a427', marginTop: 0 }}>Set Up Your Spokesperson</h2>
            <p style={{ color: '#888', fontSize: '13px' }}>This only happens once.</p>

            <div><strong>Gender</strong></div>
            <div style={STYLES.optionRow}>
              {['Male', 'Female', 'Neutral'].map(g => (
                <button key={g} style={optionStyle(prefs.gender === g)} onClick={() => setPrefs(p => ({ ...p, gender: g }))}>{g}</button>
              ))}
            </div>

            <div><strong>Age Range</strong></div>
            <div style={STYLES.optionRow}>
              {['20s', '30s', '40s', '50s+'].map(a => (
                <button key={a} style={optionStyle(prefs.age === a)} onClick={() => setPrefs(p => ({ ...p, age: a }))}>{a}</button>
              ))}
            </div>

            <div><strong>Style</strong></div>
            <div style={STYLES.optionRow}>
              {['Professional', 'Casual', 'Creative'].map(s => (
                <button key={s} style={optionStyle(prefs.style === s)} onClick={() => setPrefs(p => ({ ...p, style: s }))}>{s}</button>
              ))}
            </div>

            <button style={STYLES.button} onClick={handleModalSubmit}>Create My Spokesperson</button>
          </div>
        </div>
      )}
    </div>
  )
}
