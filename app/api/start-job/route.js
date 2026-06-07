import { NextResponse } from 'next/server'
import supabase from '@/lib/supabase'

export async function POST(req) {
  const { prompt, avatar_id } = await req.json()

  // Resolve avatar photo URL if an avatar was selected
  let avatar_photo_url = null
  if (avatar_id) {
    const { data: avatar } = await supabase
      .from('avatars')
      .select('photo_url')
      .eq('id', avatar_id)
      .single()
    avatar_photo_url = avatar?.photo_url || null
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({ prompt, status: 'pending', avatar_id: avatar_id || null })
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
          job_id:           job.id,
          prompt,
          avatar_id:        avatar_id || '',
          avatar_photo_url: avatar_photo_url || '',
        },
      }),
    }
  )

  return NextResponse.json({ job_id: job.id })
}
