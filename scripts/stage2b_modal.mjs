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

  // Read pipeline_data.json written by stage1.js (and updated by stage1_5)
  const pipelineData = JSON.parse(fs.readFileSync("pipeline_data.json", "utf8"));
  const lockedScenes = pipelineData.locked_scenes || pipelineData.scenes.map(s => ({ prompt: s, has_character: true }));
  const mode = pipelineData.pipeline_mode === "avatar_scene" || pipelineData.pipeline_mode === "avatar_lipsync"
    ? "i2v"
    : "t2v";
  const avatarPhotoUrl = pipelineData.avatar_photo_url || "";
  const characterRefUrl = pipelineData.character_ref_url || "";

  console.log(`[stage2b_modal] mode=${mode}, ${lockedScenes.length} scenes loaded`);
  console.log(`[stage2b_modal] character_ref_url=${characterRefUrl || "none"}`);

  await supabase
    .from("jobs")
    .update({ scene_prompts: JSON.stringify(lockedScenes.map(s => s.prompt)) })
    .eq("id", JOB_ID);

  // Write full scene data to file — avoids ALL shell quoting/apostrophe issues
  const scenesFile = "scenes.json";
  fs.writeFileSync(scenesFile, JSON.stringify(lockedScenes));
  console.log(`[stage2b_modal] Scenes written to ${scenesFile}`);

  // Also write flat prompts for any legacy readers
  fs.writeFileSync("prompts.json", JSON.stringify(lockedScenes.map(s => s.prompt)));

  const cmdParts = [
    "modal run modal-scripts/wan21_modal.py",
    `--job-id "${JOB_ID}"`,
    `--scenes-file "${scenesFile}"`,
    `--mode "${mode}"`,
  ];
  if (avatarPhotoUrl) cmdParts.push(`--avatar-photo-url "${avatarPhotoUrl}"`);
  if (characterRefUrl) cmdParts.push(`--character-ref-url "${characterRefUrl}"`);

  const cmd = cmdParts.join(" ");
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
