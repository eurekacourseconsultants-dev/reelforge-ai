import { NextResponse } from 'next/server'
import supabase from '@/lib/supabase'

export async function POST(req) {
  const { gender, age, style, name } = await req.json()

  // Insert avatar row with pending status so we have an ID to pass to Kaggle
  const { data: avatar, error } = await supabase
    .from('avatars')
    .insert({ name, gender, age, style, status: 'pending' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Trigger standalone portrait workflow
  await fetch(
    `https://api.github.com/repos/${process.env.GH_REPO_OWNER}/${process.env.GH_REPO_NAME}/actions/workflows/portrait.yml/dispatches`,
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
          avatar_id:   avatar.id,
          avatar_name: name || 'Avatar',
          portrait_prefs: JSON.stringify({ gender, age, style }),
        },
      }),
    }
  )

  return NextResponse.json({ avatar_id: avatar.id })
}
