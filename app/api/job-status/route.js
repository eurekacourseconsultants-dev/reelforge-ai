import { NextResponse } from 'next/server'
import supabase from '@/lib/supabase'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id || id === 'probe') {
    return NextResponse.json({ error: 'no id' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('status, pipeline_mode, final_url, error')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
