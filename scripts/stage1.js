// Stage 1 - Classify prompt and generate script/scenes via Groq
const fs = require('fs')

const JOB_ID = process.env.JOB_ID
const PROMPT = process.env.PROMPT
const GROQ_API_KEY = process.env.GROQ_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

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
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Analyze this video prompt and return a JSON object only, no markdown, no explanation:

Prompt: "${PROMPT}"

Return exactly this structure:
{
  "pipeline_mode": "spokesperson" or "scene",
  "title": "short video title under 10 words",
  "script": "full 30-second spoken script (spokesperson mode only, else empty string)",
  "scenes": ["scene 1 description", "scene 2", "scene 3", "scene 4", "scene 5", "scene 6"]
}

Rules:
- pipeline_mode is "spokesperson" if the prompt describes a person speaking, presenting, explaining, or announcing
- pipeline_mode is "scene" for everything else (visual scenes, environments, products, concepts)
- script: natural spoken 30-second monologue, no stage directions
- scenes: exactly 6 items, each a vivid 5-second visual description with smooth transitions between them`
      }],
      max_tokens: 1000,
    })
  })

  const data = await res.json()
  const text = data.choices[0].message.content.trim()
  const clean = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)

  console.log('Pipeline mode:', parsed.pipeline_mode)
  console.log('Title:', parsed.title)

  // Write to GITHUB_OUTPUT
  const outputFile = process.env.GITHUB_OUTPUT
  fs.appendFileSync(outputFile, `pipeline_mode=${parsed.pipeline_mode}\n`)
  fs.appendFileSync(outputFile, `script=${parsed.script.replace(/\n/g, ' ')}\n`)
  fs.appendFileSync(outputFile, `scenes=${JSON.stringify(parsed.scenes)}\n`)
  fs.appendFileSync(outputFile, `title=${parsed.title}\n`)

  // Save to disk for other stages
  fs.writeFileSync('pipeline_data.json', JSON.stringify(parsed))

  await patchSupabase({ status: 'classified', pipeline_mode: parsed.pipeline_mode })
  console.log('Stage 1 complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
