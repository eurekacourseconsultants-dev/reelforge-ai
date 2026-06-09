// stage3a_modal.js
// Triggers LongCat Avatar 1.5 lipsync on Modal for Pipeline 3 (avatar_lipsync)
// Called from modal_pipeline.yml after TTS audio and stitched video are ready

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JOB_ID = process.env.JOB_ID;

async function main() {
  console.log(`[stage3a_modal] Starting lipsync for job ${JOB_ID}`);

  // Fetch job to get portrait URL, audio URL, and original prompt
  const { data: job, error } = await supabase
    .from("jobs")
    .select("*, avatars(photo_url)")
    .eq("id", JOB_ID)
    .single();

  if (error) throw new Error(`Failed to fetch job: ${error.message}`);

  const portraitUrl = job.avatars?.photo_url;
  const audioUrl = job.tts_audio_url; // set by stage2a.py
  const prompt = job.prompt;

  if (!portraitUrl) throw new Error("No avatar photo_url found for job");
  if (!audioUrl) throw new Error("No tts_audio_url found — stage2a must run first");

  console.log(`[stage3a_modal] Portrait: ${portraitUrl}`);
  console.log(`[stage3a_modal] Audio: ${audioUrl}`);

  await supabase
    .from("jobs")
    .update({ status: "starting_lipsync" })
    .eq("id", JOB_ID);

  const cmd = [
    "modal run modal-scripts/longcat_modal.py",
    `--job-id "${JOB_ID}"`,
    `--portrait-url "${portraitUrl}"`,
    `--audio-url "${audioUrl}"`,
    `--prompt "${prompt.replace(/"/g, '\\"')}"`,
  ].join(" ");

  console.log(`[stage3a_modal] Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });

  console.log(`[stage3a_modal] Done.`);
}

main().catch((err) => {
  console.error("[stage3a_modal] Fatal error:", err);
  supabase
    .from("jobs")
    .update({ status: "failed", error: err.message })
    .eq("id", JOB_ID)
    .then(() => process.exit(1));
});
