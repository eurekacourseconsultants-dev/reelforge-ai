// stage2b_modal.mjs
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import fs from "fs";
import ws from "ws";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

const JOB_ID = process.env.JOB_ID;

async function main() {
  console.log(`[stage2b_modal] Starting for job ${JOB_ID}`);

  await supabase
    .from("jobs")
    .update({ status: "generating_clips" })
    .eq("id", JOB_ID);

  // Read pipeline_data.json written by stage1.js
  const pipelineData = JSON.parse(fs.readFileSync("pipeline_data.json", "utf8"));
  const prompts = pipelineData.scenes;
  const mode = pipelineData.pipeline_mode === "avatar_scene" || pipelineData.pipeline_mode === "avatar_lipsync"
    ? "i2v"
    : "t2v";
  const avatarPhotoUrl = pipelineData.avatar_photo_url || "";

  console.log(`[stage2b_modal] mode=${mode}, ${prompts.length} prompts loaded from stage1`);

  await supabase
    .from("jobs")
    .update({ scene_prompts: JSON.stringify(prompts) })
    .eq("id", JOB_ID);

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
