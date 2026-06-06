import { NextResponse } from 'next/server'
import supabase from '@/lib/supabase'

export async function POST(req) {
  const body = await req.json()
  const { prompt, portrait_prefs, _checkOnly } = body

  const { data: settings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'spokesperson_photo_url')
    .single()

  const portrait_needed = !settings?.value

  if (_checkOnly) {
    return NextResponse.json({ portrait_needed })
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({ prompt, status: 'pending' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await fetch(
    `https://api.github.com/repos/${process.env.GH_REPO_OWNER}/${process.env.GH_REPO_NAME}/actions/workflows/pipeline.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GH_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          job_id: job.id,
          prompt,
          portrait_needed: String(portrait_needed),
          portrait_prefs: JSON.stringify(portrait_prefs || {}),
        },
      }),
    }
  )

  return NextResponse.json({ job_id: job.id })
}
