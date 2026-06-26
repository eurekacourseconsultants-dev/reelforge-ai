import { NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET      = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL  = process.env.R2_PUBLIC_URL

function parseListObjectsXml(xml) {
  const contents = []
  const contentBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || []
  for (const block of contentBlocks) {
    const key = block.match(/<Key>(.*?)<\/Key>/)?.[1]
    const size = block.match(/<Size>(.*?)<\/Size>/)?.[1]
    const lastModified = block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1]
    if (key) {
      contents.push({
        Key: decodeXmlEntities(key),
        Size: size ? Number(size) : 0,
        LastModified: lastModified,
      })
    }
  }
  return contents
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function getClient() {
  return new AwsClient({
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
    service: 's3',
    region: 'auto',
  })
}

export async function GET() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return NextResponse.json({ error: 'R2 environment variables are not fully configured' }, { status: 500 })
  }

  try {
    const client = getClient()
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    const [res1, res2] = await Promise.all([
      client.fetch(`${endpoint}/${R2_BUCKET}?list-type=2&prefix=generated-videos/`),
      client.fetch(`${endpoint}/${R2_BUCKET}?list-type=2&prefix=generated-demos/`),
    ])
    if (!res1.ok) { const t = await res1.text(); throw new Error(`R2 list failed: ${res1.status} — ${t}`) }
    if (!res2.ok) { const t = await res2.text(); throw new Error(`R2 list failed: ${res2.status} — ${t}`) }
    const [xml1, xml2] = await Promise.all([res1.text(), res2.text()])
    const objects1 = parseListObjectsXml(xml1)
    const objects2 = parseListObjectsXml(xml2)
    const objects = [...objects1, ...objects2]
    const url = '' // unused



    const videos = objects
      .filter(obj => /\.(mp4|mov|webm)$/i.test(obj.Key))
      .map(obj => ({
        key: obj.Key,
        filename: obj.Key.replace('generated-videos/', ''),
        url: `${R2_PUBLIC_URL}/${obj.Key}`,
        size: obj.Size,
        last_modified: obj.LastModified,
      }))
      .sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified))

    return NextResponse.json({ videos })
  } catch (error) {
    console.error('[videos] R2 list failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET) {
    return NextResponse.json({ error: 'R2 environment variables are not fully configured' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    if (!key || (!key.startsWith('generated-videos/') && !key.startsWith('generated-demos/'))) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
    }

    const client = getClient()
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    const url = `${endpoint}/${R2_BUCKET}/${key}`

    const res = await client.fetch(url, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) {
      const text = await res.text()
      throw new Error(`R2 delete failed: ${res.status} — ${text}`)
    }

    return NextResponse.json({ success: true, key })
  } catch (error) {
    console.error('[videos] R2 delete failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
