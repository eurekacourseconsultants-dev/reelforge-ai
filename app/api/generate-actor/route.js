import { NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'

const GH_REPO_OWNER = process.env.GH_REPO_OWNER || process.env.GITHUB_REPO_OWNER
const GH_REPO_NAME   = process.env.GH_REPO_NAME  || process.env.GITHUB_REPO_NAME
const GH_PAT         = process.env.GH_PAT        || process.env.GITHUB_PAT

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET_NAME

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

function getR2Client() {
  return new AwsClient({
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
    service: 's3',
    region: 'auto',
  })
}

function r2ObjectUrl(key) {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`
}

// Counter is persisted as a small JSON object in R2 itself — avoids needing
// a database just for this. { date: 'YYYY-MM-DD', count: number }
async function readCounter() {
  try {
    const client = getR2Client()
    const res = await client.fetch(r2ObjectUrl(COUNTER_KEY))
    if (!res.ok) {
      return { date: todayKey(), count: 0 } // no counter file yet, or other error
    }
    const data = await res.json()
    if (data.date !== todayKey()) {
      return { date: todayKey(), count: 0 } // new day, reset
    }
    return data
  } catch {
    return { date: todayKey(), count: 0 }
  }
}

async function writeCounter(data) {
  const client = getR2Client()
  await client.fetch(r2ObjectUrl(COUNTER_KEY), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// Builds the PixVerse prompt text from structured fields.
function buildPrompt({ gender, age, environment, clothing, ethnicity }) {
  const genderWord = gender === 'Male' ? 'man' : gender === 'Female' ? 'woman' : 'person'
  const ethnicityText = ethnicity ? ethnicity.toLowerCase() : 'Asian'
  // Environment is now freeform text from the user (e.g. "a park", "inside a car").
  // We lightly wrap it into a natural scene description rather than relying on
  // a fixed lookup table, so any phrase the user types still reads naturally.
  const envText = `in ${environment}, natural lighting, soft shallow depth of field with blurred background`
  const clothingText = clothing ? clothing.toLowerCase() : 'casual smart attire'

  return `A photorealistic ${ethnicityText} ${genderWord}, ${age} years old, chest-up portrait, facing directly at camera, ${envText}, calm confident smile, ${clothingText}, photorealistic`
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
    const { gender, age, environment, clothing, ethnicity } = body

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

    const prompt = buildPrompt({ gender, age, environment, clothing, ethnicity })
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
          'User-Agent': 'reelforge-ai',
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
