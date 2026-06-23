'use client'
import { useState, useEffect } from 'react'

const C = {
  bg: '#0f0f0f',
  surface: '#1a1a1a',
  border: '#2a2a2a',
  accent: '#00d4ff',
  text: '#ffffff',
  muted: '#888888',
  error: '#ff4444',
}

const S = {
  container: { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: '900px', margin: '0 auto' },
  title: { color: C.accent, fontSize: '24px', fontWeight: '800', marginBottom: '4px' },
  sub: { color: C.muted, fontSize: '13px', marginBottom: '24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' },
  video: { width: '100%', display: 'block', background: '#000' },
  cardBody: { padding: '10px 12px' },
  filename: { fontSize: '13px', wordBreak: 'break-all', marginBottom: '4px' },
  meta: { fontSize: '11px', color: C.muted, marginBottom: '10px' },
  row: { display: 'flex', gap: '8px' },
  btn: { flex: 1, textAlign: 'center', padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', textDecoration: 'none' },
  downloadBtn: { background: C.accent, color: '#000' },
  deleteBtn: { background: 'transparent', color: C.error, border: `1px solid ${C.error}` },
  empty: { color: C.muted, textAlign: 'center', padding: '60px 0' },
  errorBox: { color: C.error, padding: '12px', background: '#1a0000', border: '1px solid #440000', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
}

function formatSize(bytes) {
  if (!bytes) return '0 MB'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function VideosPage() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingKey, setDeletingKey] = useState(null)

  useEffect(() => { fetchVideos() }, [])

  async function fetchVideos() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/videos')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVideos(data.videos || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(key) {
    if (!confirm('Delete this video permanently?')) return
    setDeletingKey(key)
    try {
      const res = await fetch(`/api/videos?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVideos(v => v.filter(video => video.key !== key))
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingKey(null)
    }
  }

  return (
    <div style={S.container}>
      <div style={S.title}>Generated Videos</div>
      <div style={S.sub}>All videos currently stored in R2</div>

      {error && <div style={S.errorBox}>{error}</div>}

      {loading && <div style={S.empty}>Loading...</div>}

      {!loading && videos.length === 0 && !error && (
        <div style={S.empty}>No videos yet.</div>
      )}

      <div style={S.grid}>
        {videos.map(v => (
          <div key={v.key} style={S.card}>
            <video style={S.video} src={v.url} controls playsInline preload="metadata" />
            <div style={S.cardBody}>
              <div style={S.filename}>{v.filename}</div>
              <div style={S.meta}>{formatSize(v.size)} · {v.last_modified ? new Date(v.last_modified).toLocaleString() : ''}</div>
              <div style={S.row}>
                <a style={{ ...S.btn, ...S.downloadBtn }} href={v.url} download>Download</a>
                <button
                  style={{ ...S.btn, ...S.deleteBtn, opacity: deletingKey === v.key ? 0.5 : 1 }}
                  onClick={() => handleDelete(v.key)}
                  disabled={deletingKey === v.key}
                >
                  {deletingKey === v.key ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
