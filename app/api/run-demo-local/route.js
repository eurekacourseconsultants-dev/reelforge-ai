// app/api/run-demo-local/route.js
// LOCALHOST-ONLY test path. Runs scripts/run_demo_flow.js directly via
// child_process — no GitHub Actions, no R2 upload, no Supabase job row.
// Copies the raw recording into /public/demo-previews so the browser can
// play it back immediately. Intended only for use during `next dev`.

import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execFileAsync = promisify(execFile)

export async function POST(request) {
  // Hard safety: refuse to run this outside local development.
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { error: 'run-demo-local is disabled outside development' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { demo_type, variables } = body

    if (!demo_type) {
      return Response.json({ error: 'demo_type is required' }, { status: 400 })
    }

    const projectRoot = process.cwd()
    const scriptPath = path.join(projectRoot, 'scripts', 'run_demo_flow.js')
    const variablesJson = JSON.stringify(variables || {})

    console.log(`[run-demo-local] Running: node ${scriptPath} ${demo_type} ${variablesJson}`)

    let stdout = '', stderr = ''
    try {
      const result = await execFileAsync(
        'node',
        [scriptPath, demo_type, variablesJson],
        {
          cwd: projectRoot,
          timeout: 5 * 60 * 1000, // 5 min ceiling — flows run ~30-90s typically
          maxBuffer: 1024 * 1024 * 20,
        }
      )
      stdout = result.stdout
      stderr = result.stderr
    } catch (execErr) {
      // execFile throws on non-zero exit — surface the actual script output
      console.error('[run-demo-local] script failed:', execErr.stdout, execErr.stderr)
      return Response.json(
        {
          error: `Demo flow script failed: ${execErr.message}`,
          stdout: execErr.stdout,
          stderr: execErr.stderr,
        },
        { status: 500 }
      )
    }

    console.log('[run-demo-local] stdout:', stdout)
    if (stderr) console.warn('[run-demo-local] stderr:', stderr)

    const rawVideoPath = `/tmp/demo_raw_${demo_type}.mp4`
    const actionsLogPath = `/tmp/demo_actions_${demo_type}.json`

    // Confirm the output actually exists before claiming success
    try {
      await fs.access(rawVideoPath)
    } catch {
      return Response.json(
        { error: `Script completed but no output video found at ${rawVideoPath}`, stdout, stderr },
        { status: 500 }
      )
    }

    // Copy into public/ so the browser can fetch it directly during dev
    const previewDir = path.join(projectRoot, 'public', 'demo-previews')
    await fs.mkdir(previewDir, { recursive: true })

    const timestamp = Date.now()
    const previewFilename = `${demo_type}_${timestamp}.mp4`
    const previewDest = path.join(previewDir, previewFilename)

    await fs.copyFile(rawVideoPath, previewDest)

    let actionsLog = null
    try {
      actionsLog = JSON.parse(await fs.readFile(actionsLogPath, 'utf8'))
    } catch {
      // non-fatal — actions log is informational only
    }

    return Response.json({
      ok: true,
      preview_url: `/demo-previews/${previewFilename}`,
      demo_type,
      actions_log: actionsLog,
      stdout,
    })
  } catch (err) {
    console.error('[run-demo-local]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
