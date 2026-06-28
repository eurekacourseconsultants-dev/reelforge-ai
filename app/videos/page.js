'use client'
import { useState, useEffect } from 'react'

const C = {
  bg: '#0f0f0f', surface: '#1a1a1a', border: '#2a2a2a',
  accent: '#00d4ff', text: '#ffffff', muted: '#888888', error: '#ff4444',
}

function formatSize(bytes) {
  if (!bytes) return ''
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function friendlyName(filename) {
  return filename
    .replace('generated-demos/', '').replace('generated-videos/', '')
    .replace(/_/g, ' ').replace(/\.mp4$/i, '')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function isPortrait(key) { return key.includes('_mobile') }

export default function VideosPage() {
  const [videos, setVideos]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [deletingKey, setDeleting] = useState(null)
  const [modal, setModal]         = useState(null)

  useEffect(() => { fetchVideos() }, [])

  async function fetchVideos() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/videos')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVideos(data.videos || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleDelete(key) {
    if (!confirm('Delete this video permanently?')) return
    setDeleting(key)
    try {
      const res = await fetch('/api/videos?key=' + encodeURIComponent(key), { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVideos(v => v.filter(x => x.key !== key))
    } catch (err) { setError(err.message) }
    finally { setDeleting(null) }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: '860px', margin: '0 auto' }}>
      <a href="/" style={{ color: C.muted, fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '20px' }}>Back</a>
      <div style={{ fontSize: '24px', fontWeight: '800', color: C.accent, marginBottom: '4px' }}>Video Library</div>
      <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>All generated demo videos</div>

      {error && <div style={{ color: C.error, padding: '12px', background: '#1a0000', border: '1px solid #440000', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
      {loading && <div style={{ color: C.muted, textAlign: 'center', padding: '60px 0' }}>Loading...</div>}
      {!loading && videos.length === 0 && !error && <div style={{ color: C.muted, textAlign: 'center', padding: '60px 0' }}>No videos yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {videos.map(v => (
          <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', padding: '10px 14px', minHeight: '72px' }}>
            <div onClick={() => setModal(v)} style={{ flexShrink: 0, cursor: 'pointer', width: isPortrait(v.key) ? '36px' : '64px', height: '56px', borderRadius: '6px', overflow: 'hidden', background: '#000', position: 'relative' }}>
              <video src={v.url + '#t=0.5'} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
                <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid white', marginLeft: '2px' }} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: C.text, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{friendlyName(v.filename)}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>{isPortrait(v.key) ? 'Mobile 9:16' : 'Desktop 16:9'}{v.size ? ' · ' + formatSize(v.size) : ''}{v.last_modified ? ' · ' + formatDate(v.last_modified) : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => setModal(v)} style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid ' + C.accent, background: 'transparent', color: C.accent, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Open</button>
              <button onClick={() => handleDelete(v.key)} disabled={deletingKey === v.key} style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #440000', background: 'transparent', color: C.error, fontSize: '12px', fontWeight: '600', cursor: 'pointer', opacity: deletingKey === v.key ? 0.5 : 1 }}>{deletingKey === v.key ? '...' : 'Delete'}</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '1px solid ' + C.border, borderRadius: '14px', padding: '20px', maxWidth: isPortrait(modal.key) ? '380px' : '860px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '12px' }}>{friendlyName(modal.filename)}</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>x</button>
            </div>
            <video src={modal.url} controls autoPlay playsInline style={{ width: '100%', borderRadius: '8px', background: '#000', maxHeight: '70vh' }} />
            <a href={modal.url} download style={{ display: 'block', textAlign: 'center', padding: '12px', background: C.accent, color: '#000', borderRadius: '8px', fontWeight: '700', fontSize: '14px', textDecoration: 'none' }}>Download</a>
          </div>
        </div>
      )}
    </div>
  )
}
