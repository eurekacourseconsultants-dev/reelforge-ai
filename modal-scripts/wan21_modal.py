"""
wan21_modal.py — Wan2.1 video generation on Modal A10G
Handles Pipeline 1 (t2v, no avatar) and Pipeline 2 (i2v, avatar no speech)
Character consistency via FLUX reference image chaining.
Triggered by stage2b_modal.mjs via GitHub Actions
"""

import modal
import os

# ── Persistent volume for model weights ──
weights_volume = modal.Volume.from_name("reelforge-wan21-weights", create_if_missing=True)
WEIGHTS_DIR = "/weights"

NEGATIVE_PROMPT = (
    "low quality, blurry, watermark, text, logo, deformed, distorted face, "
    "morphing, glitch, extra limbs, bad hands, jpeg artifacts, flickering, "
    "crowd morphing, melting faces, inconsistent motion"
)

# ── Container image ──
image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch==2.6.0+cu124",
        "torchvision==0.21.0+cu124",
        "torchaudio==2.6.0",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    .pip_install(
        "diffusers==0.33.0",
        "transformers==4.47.0",
        "accelerate==1.2.1",
        "huggingface_hub==0.27.0",
        "boto3==1.35.0",
        "Pillow==10.4.0",
        "ftfy",
        "requests",
        "supabase",
        "imageio",
        "imageio-ffmpeg",
    )
    .run_commands("apt-get update && apt-get install -y ffmpeg")
)

app = modal.App("reelforge-wan21", image=image)


# ── One-time weight download function ──
@app.function(
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 60,
    cpu=4,
    memory=16384,
)
def download_weights():
    from huggingface_hub import snapshot_download

    t2v_dir = f"{WEIGHTS_DIR}/Wan2.1-T2V-1.3B-Diffusers"
    i2v_dir = f"{WEIGHTS_DIR}/Wan2.1-I2V-14B-480P-Diffusers"

    if not os.path.exists(t2v_dir):
        print("Downloading Wan2.1 T2V 1.3B...")
        snapshot_download(repo_id="Wan-AI/Wan2.1-T2V-1.3B-Diffusers", local_dir=t2v_dir)
    else:
        print("T2V weights already present.")

    if not os.path.exists(i2v_dir):
        print("Downloading Wan2.1 I2V 14B 480P...")
        snapshot_download(repo_id="Wan-AI/Wan2.1-I2V-14B-480P-Diffusers", local_dir=i2v_dir)
    else:
        print("I2V weights already present.")

    weights_volume.commit()
    print("Weights committed to volume.")


# ── Main generation function ──
@app.function(
    gpu="A10G",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 40,
    memory=32768,
    cpu=4,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def generate_clip(
    prompt: str,
    clip_index: int,
    job_id: str,
    mode: str = "t2v",
    avatar_photo_url: str = "",
    character_ref_url: str = "",
    scene_has_character: bool = False,
):
    import torch
    import boto3
    import requests
    import tempfile
    from PIL import Image

    print(f"[Clip {clip_index}] mode={mode}, has_character={scene_has_character}, job={job_id}")
    print(f"[Clip {clip_index}] GPU: {torch.cuda.get_device_name(0)}")

    # Determine effective anchor image
    # Priority: avatar_photo_url (Pipeline 2) > character_ref_url (Pipeline 1 with character)
    anchor_url = ""
    if mode == "i2v" and avatar_photo_url:
        anchor_url = avatar_photo_url
    elif scene_has_character and character_ref_url:
        anchor_url = character_ref_url

    use_i2v = bool(anchor_url)

    if use_i2v:
        from diffusers import WanImageToVideoPipeline
        model_dir = f"{WEIGHTS_DIR}/Wan2.1-I2V-14B-480P-Diffusers"
        print(f"[Clip {clip_index}] I2V mode — loading pipeline, anchor={anchor_url}")
        pipe = WanImageToVideoPipeline.from_pretrained(model_dir, torch_dtype=torch.bfloat16)
        pipe.enable_model_cpu_offload()

        print(f"[Clip {clip_index}] Downloading anchor image...")
        img_response = requests.get(anchor_url, timeout=30)
        img_response.raise_for_status()
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            f.write(img_response.content)
            anchor_path = f.name

        image = Image.open(anchor_path).convert("RGB").resize((832, 480))

        print(f"[Clip {clip_index}] Running I2V inference...")
        output = pipe(
            image=image,
            prompt=prompt,
            negative_prompt=NEGATIVE_PROMPT,
            num_frames=81,
            num_inference_steps=50,
            guidance_scale=5.0,
        )
    else:
        from diffusers import WanPipeline
        model_dir = f"{WEIGHTS_DIR}/Wan2.1-T2V-1.3B-Diffusers"
        print(f"[Clip {clip_index}] T2V mode — pure scene, no character anchor")
        pipe = WanPipeline.from_pretrained(model_dir, torch_dtype=torch.bfloat16)
        pipe.enable_model_cpu_offload()

        print(f"[Clip {clip_index}] Running T2V inference...")
        output = pipe(
            prompt=prompt,
            negative_prompt=NEGATIVE_PROMPT,
            num_frames=81,
            num_inference_steps=50,
            guidance_scale=5.0,
            height=480,
            width=832,
        )

    from diffusers.utils import export_to_video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name

    export_to_video(output.frames[0], tmp_path, fps=16)
    print(f"[Clip {clip_index}] Exported to {tmp_path}")

    r2_key = f"jobs/{job_id}/clips/clip_{clip_index:02d}.mp4"
    r2_client = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    with open(tmp_path, "rb") as f:
        r2_client.upload_fileobj(f, os.environ["R2_BUCKET_NAME"], r2_key)

    clip_url = f"{os.environ['R2_PUBLIC_URL']}/{r2_key}"
    print(f"[Clip {clip_index}] Uploaded: {clip_url}")
    return clip_url


# ── Entrypoint called from GitHub Actions ──
@app.local_entrypoint()
def main(
    job_id: str,
    scenes_file: str,
    mode: str = "t2v",
    avatar_photo_url: str = "",
    character_ref_url: str = "",
):
    import json
    from supabase import create_client

    with open(scenes_file, "r") as f:
        scenes = json.load(f)

    # Support both formats: array of strings or array of {prompt, has_character}
    if scenes and isinstance(scenes[0], str):
        scenes = [{"prompt": s, "has_character": True} for s in scenes]

    print(f"Generating {len(scenes)} clips for job {job_id}, mode={mode}")
    print(f"character_ref_url={character_ref_url or 'none'}")

    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    supabase.table("jobs").update({"status": "generating_clips"}).eq("id", job_id).execute()

    results = list(
        generate_clip.starmap([
            (
                scene["prompt"],
                i,
                job_id,
                mode,
                avatar_photo_url,
                character_ref_url,
                scene.get("has_character", True),
            )
            for i, scene in enumerate(scenes)
        ])
    )

    print(f"All clips done: {results}")

    supabase.table("jobs").update({
        "status": "clips_ready",
        "clip_urls": json.dumps(results),
    }).eq("id", job_id).execute()

    print("Supabase updated. Done.")
