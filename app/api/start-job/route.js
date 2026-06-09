// app/api/start-job/route.js
// Triggers either the Kaggle pipeline or the Modal pipeline
// depending on the `backend` field in the request body

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { prompt, avatar_id, backend = "modal" } = body;

    if (!prompt?.trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Determine pipeline mode
    let pipeline_mode = "scene";
    if (avatar_id) {
      pipeline_mode = prompt.toLowerCase().includes("speak") ||
        prompt.toLowerCase().includes("say") ||
        prompt.toLowerCase().includes("explain") ||
        prompt.toLowerCase().includes("tell")
        ? "avatar_lipsync"
        : "avatar_scene";
    }

    // Create job row
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        prompt,
        avatar_id: avatar_id || null,
        pipeline_mode,
        backend, // store which backend was used
        status: "pending",
      })
      .select()
      .single();

    if (jobError) throw new Error(jobError.message);

    const jobId = job.id;
    const repoOwner = process.env.GH_REPO_OWNER || process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GH_REPO_NAME || process.env.GITHUB_REPO_NAME;
    const pat = process.env.GH_PAT || process.env.GITHUB_PAT;

    // Choose workflow based on backend
    const workflow = backend === "kaggle" ? "pipeline.yml" : "modal_pipeline.yml";

    const ghResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            job_id: jobId,
            pipeline_mode,
          },
        }),
      }
    );

    if (!ghResponse.ok) {
      const ghError = await ghResponse.text();
      throw new Error(`GitHub dispatch failed: ${ghResponse.status} — ${ghError}`);
    }

    await supabase
      .from("jobs")
      .update({ status: "queued" })
      .eq("id", jobId);

    return Response.json({ job_id: jobId, pipeline_mode, backend });
  } catch (err) {
    console.error("[start-job]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
