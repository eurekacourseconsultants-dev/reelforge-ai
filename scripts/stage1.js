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
  "environment": "one locked environment description, 15-25 words, describing the consistent setting, lighting, and visual style used across ALL clips. This must be specific and reusable verbatim as a prompt prefix.",
  "has_character": true or false,
  "character_json": {
    "type": "human | creature | robot | animal | fantasy | other",
    "gender": "male | female | neutral | n/a",
    "age": "descriptive age e.g. elderly, young adult, middle-aged, n/a",
    "ethnicity": "e.g. East Asian, African, Caucasian, n/a for non-humans",
    "face": {
      "skin": "texture and tone e.g. weathered tanned, pale smooth",
      "eyes": "color, shape, expression e.g. dark brown narrow intense",
      "distinguishing": "scars, markings, unique features or empty string"
    },
    "hair": {
      "color": "exact color",
      "length": "short | medium | long | n/a",
      "style": "specific style e.g. loose topknot, braided, wild mane",
      "texture": "coarse | smooth | curly | straight | n/a"
    },
    "body": {
      "build": "e.g. lean wiry, muscular, stocky, slender",
      "height": "short | medium | tall",
      "posture": "e.g. upright rigid, hunched, relaxed"
    },
    "clothing": {
      "primary": "main garment with material and color e.g. worn black lacquered chest armor with red lacing",
      "secondary": "trousers, robe, lower garment",
      "footwear": "specific footwear",
      "accessories": "weapons, jewelry, tools carried on body"
    },
    "color_palette": "3-5 dominant colors that define this character e.g. dark blacks, deep navy, weathered silver, muted red",
    "flux_prompt": "full body portrait, [character], standing facing camera, neutral pose, plain white background, sharp focus, character sheet style, 8k — written as a detailed FLUX generation prompt capturing ALL above attributes"
  },
  "scenes": [
    { "prompt": "scene description", "has_character": true or false, "motion": "specific body movement description" },
    { "prompt": "scene description", "has_character": true or false, "motion": "specific body movement description" },
    { "prompt": "scene description", "has_character": true or false, "motion": "specific body movement description" },
    { "prompt": "scene description", "has_character": true or false, "motion": "specific body movement description" },
    { "prompt": "scene description", "has_character": true or false, "motion": "specific body movement description" },
    { "prompt": "scene description", "has_character": true or false, "motion": "specific body movement description" }
  ]
}

Rules:
- has_character: true if ANY human, creature, robot, animal or named character appears.
- character_json: only populate if has_character is true. If has_character is false, set character_json to null.
- character_json.flux_prompt: this is used to generate the reference image via FLUX. Must be extremely specific — include every visual attribute from the JSON. Start with "full body portrait," and end with "plain white background, sharp focus, character sheet style, 8k".
- character_json.color_palette: critical for consistency — list the exact dominant colors of the character.
- environment: extract the core setting. Must be consistent across all 6 scenes.
- script: natural spoken 30-second monologue, no stage directions (avatar_lipsync only), else empty string.
- scenes: exactly 6 items.
  - prompt: vivid 5-second visual action, do NOT repeat environment (it will be prepended).
  - has_character: true if the character is visible in this clip.
  - motion: ONLY populate if has_character is true for this scene. Describe specific body movement in detail — e.g. "walks slowly forward, head turning left scanning for danger, right hand resting on sword hilt, feet stepping deliberately on wet stone". This must describe exactly what the body is doing. Empty string if has_character is false.
- For avatar_scene/avatar_lipsync: has_character is always true for all scenes.
- For scene mode: some clips may be pure scenery (has_character false, motion empty string).`
      }],
      max_tokens: 2500,
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

  const environment = parsed.environment || ''
  const hasCharacter = !!parsed.has_character
  const characterJson = parsed.character_json || null

  // Build the identity clause from character_json — injected into every character clip prompt
  // This gives the model both a visual ref image AND a detailed text anchor to fight drift
  function buildIdentityClause(cj) {
    if (!cj) return ''
    const parts = []
    if (cj.age && cj.age !== 'n/a') parts.push(cj.age)
    if (cj.ethnicity && cj.ethnicity !== 'n/a') parts.push(cj.ethnicity)
    if (cj.gender && cj.gender !== 'n/a') parts.push(cj.gender)
    if (cj.type) parts.push(cj.type)
    const base = parts.join(' ')

    const details = []
    if (cj.face?.skin) details.push(`${cj.face.skin} skin`)
    if (cj.face?.eyes) details.push(`${cj.face.eyes} eyes`)
    if (cj.face?.distinguishing) details.push(cj.face.distinguishing)
    if (cj.hair?.color && cj.hair?.style) details.push(`${cj.hair.color} hair in ${cj.hair.style}`)
    if (cj.body?.build) details.push(`${cj.body.build} build`)
    if (cj.clothing?.primary) details.push(`wearing ${cj.clothing.primary}`)
    if (cj.clothing?.secondary) details.push(cj.clothing.secondary)
    if (cj.clothing?.accessories) details.push(cj.clothing.accessories)
    if (cj.color_palette) details.push(`color palette: ${cj.color_palette}`)

    return `${base}${details.length ? ', ' + details.join(', ') : ''}`
  }

  const identityClause = hasCharacter && characterJson ? buildIdentityClause(characterJson) : ''

  // Build locked scenes — environment + identity clause + scene prompt + motion
  const lockedScenes = parsed.scenes.map(scene => {
    let fullPrompt = environment ? `${environment}, ` : ''
    if (scene.has_character && identityClause) {
      fullPrompt += `${identityClause} — `
    }
    fullPrompt += scene.prompt
    if (scene.has_character && scene.motion) {
      fullPrompt += `, ${scene.motion}`
    }
    return {
      prompt: fullPrompt,
      has_character: scene.has_character,
      motion: scene.motion || '',
    }
  })

  // Flat prompt array for backward compat with stage2b_modal.mjs
  const scenePrompts = lockedScenes.map(s => s.prompt)

  // character_description for stage1_5 FLUX generation — use flux_prompt from character_json
  const characterDescription = characterJson?.flux_prompt || ''

  console.log('Pipeline mode:', parsed.pipeline_mode)
  console.log('Has avatar:', hasAvatar)
  console.log('Has character:', hasCharacter)
  console.log('Identity clause:', identityClause)
  console.log('Character JSON:', JSON.stringify(characterJson, null, 2))
  console.log('Title:', parsed.title)
  console.log('Environment:', environment)
  console.log('Locked scenes:', JSON.stringify(lockedScenes, null, 2))

  // Write to GITHUB_OUTPUT
  const outputFile = process.env.GITHUB_OUTPUT
  fs.appendFileSync(outputFile, `pipeline_mode=${parsed.pipeline_mode}\n`)
  fs.appendFileSync(outputFile, `script=${(parsed.script || '').replace(/\n/g, ' ')}\n`)
  fs.appendFileSync(outputFile, `scenes=${JSON.stringify(scenePrompts)}\n`)
  fs.appendFileSync(outputFile, `title=${parsed.title}\n`)
  fs.appendFileSync(outputFile, `has_character=${hasCharacter}\n`)

  // Save to disk for downstream stages
  fs.writeFileSync('pipeline_data.json', JSON.stringify({
    ...parsed,
    scenes: scenePrompts,
    locked_scenes: lockedScenes,
    environment,
    has_character: hasCharacter,
    character_json: characterJson,
    character_description: characterDescription,  // flux_prompt used by stage1_5
    identity_clause: identityClause,
    character_ref_url: '',   // filled in by stage1_5 if has_character
    avatar_photo_url: AVATAR_PHOTO_URL,
    avatar_id: AVATAR_ID,
  }))

  await patchSupabase({ status: 'classified', pipeline_mode: parsed.pipeline_mode })
  console.log('Stage 1 complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
