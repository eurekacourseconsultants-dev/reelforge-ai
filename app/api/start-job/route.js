// app/api/start-job/route.js
// Routes to Dreamina (video_type 1, talking actor) or the existing
// Kaggle/Modal pipelines (video_type 2/3 or legacy prompt-only calls)

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Mirrors the parsing logic in app/api/actors/route.js
function parseActorFilename(filename) {
  const base = filename.replace(/\.(jpg|jpeg|png|webp)$/i, "");
  const parts = base.split("-");
  if (parts.length < 4) return { gender: "unknown" };
  const gender = parts[parts.length - 3];
  return { gender };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      video_type,
      prompt,
      avatar_id,
      script_text,
      voice_name,
      action_text,
      backend = "modal",
    } = body;

    const repoOwner = process.env.GH_REPO_OWNER || process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GH_REPO_NAME || process.env.GITHUB_REPO_NAME;
    const pat = process.env.GH_PAT || process.env.GITHUB_PAT;

    // --- Video Type 1: Dreamina talking actor ---
    if (video_type === 1) {
      if (!avatar_id) {
        return Response.json({ error: "avatar_id is required for talking actor videos" }, { status: 400 });
      }
      if (!script_text?.trim()) {
        return Response.json({ error: "script_text is required" }, { status: 400 });
      }
      if (!voice_name?.trim()) {
        return Response.json({ error: "voice_name is required" }, { status: 400 });
      }

      const { gender } = parseActorFilename(avatar_id);
      const voice_tone = gender === "male" ? "Male" : gender === "female" ? "Female" : "";
      const actorPhotoUrl = `${R2_PUBLIC_URL}/avatars/${avatar_id}`;
      const videoTitle = script_text.slice(0, 40);

      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({
          prompt: script_text,
          pipeline_mode: "avatar_lipsync",
          backend: "dreamina",
          status: "pending",
        })
        .select()
        .single();

      if (jobError) throw new Error(jobError.message);

      const jobId = job.id;

      const ghResponse = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/dreamina_actor.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${pat}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "reelforge-ai",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              actor_image_url: actorPhotoUrl,
              script_text: script_text,
              voice_name: voice_name,
              voice_tone: voice_tone,
              action_text: action_text || "",
              video_title: videoTitle,
              job_id: String(jobId),
            },
          }),
        }
      );

      if (!ghResponse.ok) {
        const ghError = await ghResponse.text();
        throw new Error(`GitHub dispatch failed: ${ghResponse.status} — ${ghError}`);
      }

      await supabase.from("jobs").update({ status: "queued" }).eq("id", jobId);

      return Response.json({ job_id: jobId, pipeline_mode: "avatar_lipsync", backend: "dreamina" });
    }

    // --- Existing Kaggle/Modal pipelines (video_type 2/3 or legacy) ---
    if (!prompt?.trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    let pipeline_mode = "scene";
    if (avatar_id) {
      pipeline_mode = prompt.toLowerCase().includes("speak") ||
        prompt.toLowerCase().includes("say") ||
        prompt.toLowerCase().includes("explain") ||
        prompt.toLowerCase().includes("tell")
        ? "avatar_lipsync"
        : "avatar_scene";
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        prompt,
        avatar_id: avatar_id || null,
        pipeline_mode,
        backend,
        status: "pending",
      })
      .select()
      .single();

    if (jobError) throw new Error(jobError.message);

    const jobId = job.id;

    let avatarPhotoUrl = "";
    if (avatar_id) {
      avatarPhotoUrl = `${R2_PUBLIC_URL}/avatars/${avatar_id}`;
    }

    const workflow = backend === "kaggle" ? "pipeline.yml" : "modal_pipeline.yml";

    const ghResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "reelforge-ai",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            job_id: jobId,
            pipeline_mode,
            prompt,
            avatar_id: avatar_id || "",
            avatar_photo_url: avatarPhotoUrl,
          },
        }),
      }
    );

    if (!ghResponse.ok) {
      const ghError = await ghResponse.text();
      throw new Error(`GitHub dispatch failed: ${ghResponse.status} — ${ghError}`);
    }

    await supabase.from("jobs").update({ status: "queued" }).eq("id", jobId);

    return Response.json({ job_id: jobId, pipeline_mode, backend });
  } catch (err) {
    console.error("[start-job]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
