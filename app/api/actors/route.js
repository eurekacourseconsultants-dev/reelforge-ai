import { NextResponse } from 'next/server'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET      = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL  = process.env.R2_PUBLIC_URL

// Parses a filename like "hdb-office-female-29-01.jpg" into structured fields.
// Convention: {environment}-{gender}-{age}-{number}.jpg
// Environment can itself contain hyphens (e.g. "hdb-office"), so we anchor
// from the right: number, age, gender are always the last three hyphen segments.
function parseActorFilename(filename) {
  const base = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '')
  const parts = base.split('-')

  if (parts.length < 4) {
    return { name: base, environment: 'unknown', gender: 'unknown', age: null, number: '01' }
  }

  const number      = parts[parts.length - 1]
  const age         = parts[parts.length - 2]
  const gender      = parts[parts.length - 3]
  const environment = parts.slice(0, parts.length - 3).join('-')

  return {
    name: base,
    environment,
    gender,
    age: isNaN(Number(age)) ? age : Number(age),
    number,
  }
}

export async function GET() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return NextResponse.json({ error: 'R2 environment variables are not fully configured' }, { status: 500 })
  }

  try {
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    })

    const result = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: 'avatars/',
    }))

    const objects = result.Contents || []

    const actors = objects
      .filter(obj => /\.(jpg|jpeg|png|webp)$/i.test(obj.Key))
      .map(obj => {
        const filename = obj.Key.replace('avatars/', '')
        const parsed = parseActorFilename(filename)
        return {
          id: filename,
          filename,
          photo_url: `${R2_PUBLIC_URL}/${obj.Key}`,
          thumbnail_url: `${R2_PUBLIC_URL}/${obj.Key}`,
          size: obj.Size,
          last_modified: obj.LastModified,
          ...parsed,
        }
      })
      .sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified))

    return NextResponse.json({ actors })
  } catch (error) {
    console.error('[actors] R2 list failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
