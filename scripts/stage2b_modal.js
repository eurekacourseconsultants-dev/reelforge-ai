// stage2b_modal.js
// Modal equivalent of stage2b.js
// Fetches job + avatar data, builds scene prompts, triggers wan21_modal.py on Modal
// Called from modal_pipeline.yml

import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { execSync } from "child_process";
import fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const JOB_ID = process.env.JOB_ID;
const NUM_CLIPS = 6;

async function getJobData() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*, avatars(name, gender, age, ethnicity, style, photo_url)")
    .eq("id", JOB_ID)
    .single();
  if (error) throw new Error(`Failed to fetch job: ${error.message}`);
  return data;
}

async function generateScenePrompts(job) {
  const avatarContext = job.avatars
    ? `The video features a ${job.avatars.age} ${job.avatars.gender} ${job.avatars.ethnicity} presenter in a ${job.avatars.style} style.`
    : "";

  const systemPrompt = `You are a video scene writer. Generate exactly ${NUM_CLIPS} short scene descriptions for a 30-second video.
Each scene should be 4-6 seconds long and visually distinct.
${avatarContext}
Return a JSON array of exactly ${NUM_CLIPS} strings. No other text.`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Video topic: ${job.prompt}` },
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content.trim();
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed) || parsed.length !== NUM_CLIPS) {
    throw new Error(`Expected ${NUM_CLIPS} prompts, got: ${content}`);
  }
  return parsed;
}

async function main() {
  console.log(`[stage2b_modal] Starting for job ${JOB_ID}`);

  await supabase
    .from("jobs")
    .update({ status: "generating_prompts" })
    .eq("id", JOB_ID);

  const job = await getJobData();
  console.log(`[stage2b_modal] mode=${job.pipeline_mode}`);

  const prompts = await generateScenePrompts(job);
  console.log(`[stage2b_modal] Generated ${prompts.length} scene prompts`);

  // Store prompts on job for downstream stages
  await supabase
    .from("jobs")
    .update({ scene_prompts: JSON.stringify(prompts) })
    .eq("id", JOB_ID);

  const mode = job.pipeline_mode === "avatar_scene" || job.pipeline_mode === "avatar_lipsync"
    ? "i2v"
    : "t2v";

  const avatarPhotoUrl = job.avatars?.photo_url || "";

  console.log(`[stage2b_modal] Triggering Modal wan21 (mode=${mode})...`);

  // modal run wan21_modal.py passes args as --arg-name value (hyphens, not underscores)
  const cmd = [
    "modal run modal-scripts/wan21_modal.py",
    `--job-id "${JOB_ID}"`,
    `--prompts-json '${JSON.stringify(prompts)}'`,
    `--mode "${mode}"`,
    avatarPhotoUrl ? `--avatar-photo-url "${avatarPhotoUrl}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  console.log(`[stage2b_modal] Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });

  console.log(`[stage2b_modal] Done.`);
}

main().catch((err) => {
  console.error("[stage2b_modal] Fatal error:", err);
  supabase
    .from("jobs")
    .update({ status: "failed", error: err.message })
    .eq("id", JOB_ID)
    .then(() => process.exit(1));
});
