// Stage 1 - Classify prompt and generate script/scenes via Groq
const fs = require('fs')

const JOB_ID          = process.env.JOB_ID
const PROMPT          = process.env.PROMPT
const AVATAR_ID       = process.env.AVATAR_ID || ''
const AVATAR_PHOTO_URL = process.env.AVATAR_PHOTO_URL || ''
const GROQ_API_KEY    = process.env.GROQ_API_KEY
const SUPABASE_URL    = process.env.SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_KEY

const hasAvatar = !!AVATAR_ID && !!AVATAR_PHOTO_URL

async function patchSupabase(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

async function run() {
  const avatarContext = hasAvatar
    ? `An avatar (pre-generated portrait) HAS been selected for this job. The avatar is the consistent character used across clips.`
    : `No avatar has been selected. Wan2.1 will generate its own characters from scene descriptions.`

  const modeInstructions = hasAvatar
    ? `- "avatar_lipsync": avatar speaks directly to camera (presenting, explaining, announcing, talking)
- "avatar_scene": avatar appears in the scene but does NOT speak (walking, dancing, standing, acting)`
    : `- "scene": no avatar, Wan2.1 generates all characters from scene descriptions`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Analyze this video prompt and return a JSON object only, no markdown, no explanation.

Prompt: "${PROMPT}"

Context: ${avatarContext}

Available pipeline modes:
${modeInstructions}

Return exactly this structure:
{
  "pipeline_mode": ${hasAvatar ? '"avatar_lipsync" or "avatar_scene"' : '"scene"'},
  "title": "short video title under 10 words",
  "script": "full 30-second spoken script (avatar_lipsync mode only, else empty string)",
  "environment": "one locked environment description, 15-25 words, describing the consistent setting, lighting, and visual style used across ALL clips. This must be specific and reusable verbatim as a prompt prefix. Example: 'minimalist white studio, soft overhead lighting, warm oak floor, single desk with laptop, shallow depth of field'",
  "scenes": ["scene 1 description", "scene 2", "scene 3", "scene 4", "scene 5", "scene 6"]
}

Rules:
- environment: extract the core setting from the prompt. If no specific environment is mentioned, invent one that fits the tone. It must be consistent across all 6 scenes.
- script: natural spoken 30-second monologue, no stage directions (avatar_lipsync only)
- scenes: exactly 6 items, each a vivid 5-second visual description of the ACTION only — do NOT repeat the environment in scenes, it will be prepended automatically
- For avatar_scene: each scene describes what the avatar is DOING (e.g. "walks toward camera, glances left, pauses")
- For avatar_lipsync: scenes describe what appears behind/around the speaking avatar
- For scene: purely visual action descriptions, no speaking person required`
      }],
      max_tokens: 1000,
    })
  })

  const data   = await res.json()
  const text   = data.choices[0].message.content.trim()
  const clean  = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)

  // Safety: if no avatar but Groq somehow returns an avatar mode, force scene
  if (!hasAvatar && parsed.pipeline_mode !== 'scene') {
    parsed.pipeline_mode = 'scene'
  }
  // If avatar selected but Groq returns scene, default to avatar_scene
  if (hasAvatar && parsed.pipeline_mode === 'scene') {
    parsed.pipeline_mode = 'avatar_scene'
  }

  // Prepend locked environment to every scene prompt
  const environment = parsed.environment || ''
  const lockedScenes = parsed.scenes.map(scene => `${environment}, ${scene}`)

  console.log('Pipeline mode:', parsed.pipeline_mode)
  console.log('Has avatar:', hasAvatar)
  console.log('Title:', parsed.title)
  console.log('Environment:', environment)
  console.log('Locked scenes:', lockedScenes)

  // Write to GITHUB_OUTPUT
  const outputFile = process.env.GITHUB_OUTPUT
  fs.appendFileSync(outputFile, `pipeline_mode=${parsed.pipeline_mode}\n`)
  fs.appendFileSync(outputFile, `script=${(parsed.script || '').replace(/\n/g, ' ')}\n`)
  fs.appendFileSync(outputFile, `scenes=${JSON.stringify(lockedScenes)}\n`)
  fs.appendFileSync(outputFile, `title=${parsed.title}\n`)

  // Save to disk for downstream stages
  fs.writeFileSync('pipeline_data.json', JSON.stringify({
    ...parsed,
    scenes: lockedScenes,
    environment,
    avatar_photo_url: AVATAR_PHOTO_URL,
    avatar_id: AVATAR_ID,
  }))

  await patchSupabase({ status: 'classified', pipeline_mode: parsed.pipeline_mode })
  console.log('Stage 1 complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
