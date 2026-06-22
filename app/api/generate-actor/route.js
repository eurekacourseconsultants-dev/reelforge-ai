import { NextResponse } from 'next/server'

const GH_REPO_OWNER = process.env.GH_REPO_OWNER || process.env.GITHUB_REPO_OWNER
const GH_REPO_NAME   = process.env.GH_REPO_NAME  || process.env.GITHUB_REPO_NAME
const GH_PAT         = process.env.GH_PAT        || process.env.GITHUB_PAT

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

// --- Daily limit config ---
// PixVerse: 90 credits/day per account, image gen = 5 credits/image.
// That's a hard ceiling of 18 images/day on ONE account before anything else
// (clip generation, etc.) eats into that same budget. We keep real margin
// since this same account pool is also used for I2V scene clips.
const DAILY_ACTOR_GENERATION_LIMIT = 10
const COUNTER_KEY = 'actor-generation-counter/today.json'

function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
}

async function getR2Client() {
  const { S3Client } = await import('@aws-sdk/client-s3')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  })
}

// Counter is persisted as a small JSON object in R2 itself — avoids needing
// a database just for this. { date: 'YYYY-MM-DD', count: number }
async function readCounter() {
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const s3 = await getR2Client()
    const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: COUNTER_KEY }))
    const text = await res.Body.transformToString()
    const data = JSON.parse(text)
    if (data.date !== todayKey()) {
      return { date: todayKey(), count: 0 } // new day, reset
    }
    return data
  } catch {
    return { date: todayKey(), count: 0 } // no counter file yet
  }
}

async function writeCounter(data) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = await getR2Client()
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: COUNTER_KEY,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }))
}

// Builds the PixVerse prompt text from structured fields.
// Mirrors the manually-written prompts used throughout this project so far.
function buildPrompt({ gender, age, environment, clothing }) {
  const genderWord = gender === 'Male' ? 'man' : gender === 'Female' ? 'woman' : 'person'
  const envText = ENVIRONMENT_TEXT[environment] || environment
  const clothingText = clothing ? clothing.toLowerCase() : 'casual smart attire'

  return `A photorealistic Asian ${genderWord}, ${age} years old, chest-up portrait, facing directly at camera, ${envText}, soft shallow depth of field with blurred background, calm confident smile, ${clothingText}, photorealistic`
}

const ENVIRONMENT_TEXT = {
  'HDB Home Office': 'sitting at a clean home office desk in a Singapore HDB flat, natural daylight from window, simple white walls, laptop visible in background',
  'Cafe': 'sitting at a cozy cafe table in Singapore, warm ambient cafe lighting, blurred cafe interior with plants and wooden furniture in background, coffee cup visible on table',
  'Outdoor': 'standing outdoors in a bright Singapore street scene, natural daylight, soft urban background',
  'Studio': 'sitting against a clean studio backdrop, professional studio lighting, minimal background',
}

// Builds the filename following the locked convention: {environment}-{gender}-{age}-{number}.jpg
function buildFilename({ environment, gender, age }, number = '01') {
  const envSlug = environment.toLowerCase().replace(/\s+/g, '-')
  const genderSlug = gender.toLowerCase()
  return `${envSlug}-${genderSlug}-${age}-${number}.jpg`
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { gender, age, environment, clothing } = body

    if (!gender || !age || !environment) {
      return NextResponse.json({ error: 'gender, age, and environment are required' }, { status: 400 })
    }

    // --- Daily limit check ---
    const counter = await readCounter()
    if (counter.count >= DAILY_ACTOR_GENERATION_LIMIT) {
      return NextResponse.json({
        error: `Daily actor generation limit reached (${DAILY_ACTOR_GENERATION_LIMIT}/day). Try again tomorrow.`,
        count: counter.count,
        limit: DAILY_ACTOR_GENERATION_LIMIT,
      }, { status: 429 })
    }

    const prompt = buildPrompt({ gender, age, environment, clothing })
    const filename = buildFilename({ environment, gender, age })

    if (!GH_REPO_OWNER || !GH_REPO_NAME || !GH_PAT) {
      return NextResponse.json({ error: 'GitHub dispatch credentials are not configured' }, { status: 500 })
    }

    const ghResponse = await fetch(
      `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/actions/workflows/pixverse_actor.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GH_PAT}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            prompt,
            filename,
            gender,
            age: String(age),
            environment,
            clothing: clothing || '',
          },
        }),
      }
    )

    if (!ghResponse.ok) {
      const ghError = await ghResponse.text()
      throw new Error(`GitHub dispatch failed: ${ghResponse.status} — ${ghError}`)
    }

    // Increment and persist the counter only after a successful dispatch
    await writeCounter({ date: todayKey(), count: counter.count + 1 })

    return NextResponse.json({
      status: 'queued',
      prompt,
      filename,
      remaining_today: DAILY_ACTOR_GENERATION_LIMIT - (counter.count + 1),
    })
  } catch (err) {
    console.error('[generate-actor]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  // Lets the frontend check remaining quota without triggering a generation
  const counter = await readCounter()
  return NextResponse.json({
    count: counter.count,
    limit: DAILY_ACTOR_GENERATION_LIMIT,
    remaining: Math.max(0, DAILY_ACTOR_GENERATION_LIMIT - counter.count),
  })
}
