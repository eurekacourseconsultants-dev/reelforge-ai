"""
wan21_modal.py — Wan2.1 video generation on Modal A10G
- Character clips (has_character=True): VACE R2V with character ref image for consistency
- Scenery clips (has_character=False): vanilla WanPipeline T2V via diffusers
- Pipeline 2 (avatar): WanImageToVideoPipeline I2V via diffusers
- Phantom: kept but no longer used for scene pipeline (VACE replaced it)
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
        "easydict",
        "einops",
        "rotary-embedding-torch",
        "xfuser>=0.4.1",
        "dashscope",
        "flash-attn",
    )
    .run_commands(
        "apt-get update && apt-get install -y ffmpeg git",
        # Clone Phantom repo into image at build time
        "git clone https://github.com/Phantom-video/Phantom /phantom",
        # Clone Wan2.1 repo for VACE generate.py
        "git clone https://github.com/Wan-Video/Wan2.1 /wan21",
    )
)

app = modal.App("reelforge-wan21", image=image)


# ── Download Phantom weights (run once manually) ──
@app.function(
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 60,
    cpu=4,
    memory=16384,
)
def download_phantom_weights():
    from huggingface_hub import snapshot_download, hf_hub_download
    import os

    # T2V 1.3B base (already present, but check)
    t2v_dir = f"{WEIGHTS_DIR}/Wan2.1-T2V-1.3B-Diffusers"
    if not os.path.exists(t2v_dir):
        print("Downloading Wan2.1 T2V 1.3B...")
        snapshot_download(repo_id="Wan-AI/Wan2.1-T2V-1.3B-Diffusers", local_dir=t2v_dir)

    # Phantom checkpoint — just the .pth file, not the full repo
    phantom_ckpt = f"{WEIGHTS_DIR}/Phantom-Wan-1.3B.pth"
    if not os.path.exists(phantom_ckpt):
        print("Downloading Phantom-Wan-1.3B.pth...")
        hf_hub_download(
            repo_id="bytedance-research/Phantom",
            filename="Phantom-Wan-1.3B.pth",
            local_dir=f"{WEIGHTS_DIR}/phantom-ckpt",
            token=os.environ.get("HF_TOKEN"),
        )
        import shutil
        shutil.move(f"{WEIGHTS_DIR}/phantom-ckpt/Phantom-Wan-1.3B.pth", phantom_ckpt)
        print("Phantom checkpoint downloaded.")
    else:
        print("Phantom checkpoint already present.")

    weights_volume.commit()
    print("Done.")


# ── Download VACE weights (run once manually) ──
@app.function(
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 60,
    cpu=4,
    memory=16384,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def download_vace_weights():
    from huggingface_hub import snapshot_download
    import os

    vace_dir = f"{WEIGHTS_DIR}/Wan2.1-VACE-1.3B"
    if not os.path.exists(vace_dir):
        print("Downloading Wan2.1-VACE-1.3B weights...")
        snapshot_download(
            repo_id="Wan-AI/Wan2.1-VACE-1.3B",
            local_dir=vace_dir,
            token=os.environ.get("HF_TOKEN"),
        )
        weights_volume.commit()
        print("VACE weights downloaded.")
    else:
        print("VACE weights already present.")


# ── Generate one clip — character mode via VACE R2V ──
@app.function(
    gpu="A10G",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 40,
    memory=32768,
    cpu=4,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def generate_clip_vace(
    prompt: str,
    clip_index: int,
    job_id: str,
    character_ref_url: str,
):
    import torch
    import boto3
    import requests
    import tempfile
    import subprocess
    import sys
    import glob
    import os

    print(f"[Clip {clip_index}] VACE R2V mode, job={job_id}")
    print(f"[Clip {clip_index}] GPU: {torch.cuda.get_device_name(0)}")

    # Download character ref image locally
    print(f"[Clip {clip_index}] Downloading character ref from {character_ref_url}")
    ref_response = requests.get(character_ref_url, timeout=30)
    ref_response.raise_for_status()
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(ref_response.content)
        ref_path_jpg = f.name

    # Convert to PNG — VACE expects PNG ref images
    from PIL import Image as PilImage
    ref_path = ref_path_jpg.replace(".jpg", ".png")
    PilImage.open(ref_path_jpg).convert("RGB").save(ref_path, "PNG")
    print(f"[Clip {clip_index}] Ref saved to {ref_path}")

    vace_dir = f"{WEIGHTS_DIR}/Wan2.1-VACE-1.3B"

    # Download weights on first run if missing
    if not os.path.exists(vace_dir):
        print(f"[Clip {clip_index}] VACE weights missing — downloading now...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="Wan-AI/Wan2.1-VACE-1.3B",
            local_dir=vace_dir,
            token=os.environ.get("HF_TOKEN"),
        )
        weights_volume.commit()

    out_dir = f"/tmp/vace_out_{clip_index}"
    os.makedirs(out_dir, exist_ok=True)
    out_path = f"{out_dir}/clip_{clip_index:02d}.mp4"

    # Use same seed for all clips so character stays consistent
    FIXED_SEED = 42

    cmd = [
        sys.executable,
        "/wan21/generate.py",
        "--task", "vace-1.3B",
        "--size", "832*480",
        "--frame_num", "81",
        "--ckpt_dir", vace_dir,
        "--src_ref_images", ref_path,
        "--prompt", prompt,
        "--save_file", out_path,
        "--offload_model", "True",
        "--t5_cpu",
        "--base_seed", str(FIXED_SEED),
    ]

    print(f"[Clip {clip_index}] Running VACE: {' '.join(cmd)}")
    env = os.environ.copy()
    env["PYTHONPATH"] = "/wan21:" + env.get("PYTHONPATH", "")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd="/wan21", env=env)
    # Always print stdout/stderr so we can see VACE logs in Modal
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)

    if result.returncode != 0:
        raise RuntimeError(f"VACE generate.py failed with exit code {result.returncode}")

    # Find output mp4 — VACE may append a suffix
    mp4_files = glob.glob(f"{out_dir}/*.mp4")
    if not mp4_files:
        mp4_files = glob.glob(f"/tmp/*.mp4")
    if not mp4_files:
        raise RuntimeError(f"No mp4 output found after VACE generation")

    tmp_path = mp4_files[0]
    print(f"[Clip {clip_index}] Output: {tmp_path}")

    # Upload to R2
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


# ── Generate one clip — character mode via Phantom ──
@app.function(
    gpu="A10G",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 40,
    memory=32768,
    cpu=4,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def generate_clip_phantom(
    prompt: str,
    clip_index: int,
    job_id: str,
    character_ref_url: str,
):
    import torch
    import boto3
    import requests
    import tempfile
    import subprocess
    import shutil
    import sys
    import glob

    print(f"[Clip {clip_index}] PHANTOM mode, job={job_id}")
    print(f"[Clip {clip_index}] GPU: {torch.cuda.get_device_name(0)}")

    # Download character ref image
    print(f"[Clip {clip_index}] Downloading character ref from {character_ref_url}")
    ref_response = requests.get(character_ref_url, timeout=30)
    ref_response.raise_for_status()
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(ref_response.content)
        ref_path = f.name
    print(f"[Clip {clip_index}] Ref saved to {ref_path}")

    # Output directory for this clip
    out_dir = f"/tmp/phantom_out_{clip_index}"
    os.makedirs(out_dir, exist_ok=True)

    # Wan2.1 T2V weights — Phantom needs the original (non-diffusers) format
    # Check if we have the original format, if not use a symlink trick with diffusers format
    wan_dir = f"{WEIGHTS_DIR}/Wan2.1-T2V-1.3B"
    wan_diffusers_dir = f"{WEIGHTS_DIR}/Wan2.1-T2V-1.3B-Diffusers"

    # Phantom expects the original HF format (not diffusers), download if needed
    if not os.path.exists(wan_dir):
        print(f"[Clip {clip_index}] Downloading Wan2.1 T2V 1.3B original format for Phantom...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="Wan-AI/Wan2.1-T2V-1.3B",
            local_dir=wan_dir,
            token=os.environ.get("HF_TOKEN"),
        )
        weights_volume.commit()

    phantom_ckpt = f"{WEIGHTS_DIR}/Phantom-Wan-1.3B.pth"

    cmd = [
        sys.executable, "/phantom/generate.py",
        "--task", "s2v-1.3B",
        "--size", "832*480",
        "--frame_num", "81",
        "--ckpt_dir", wan_dir,
        "--phantom_ckpt", phantom_ckpt,
        "--ref_image", ref_path,
        "--prompt", prompt,
        "--save_file", f"{out_dir}/clip_{clip_index:02d}",
        "--offload_model", "True",
        "--t5_cpu",
        "--base_seed", str(clip_index * 42),
    ]

    print(f"[Clip {clip_index}] Running Phantom: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=False, cwd="/phantom")

    if result.returncode != 0:
        raise RuntimeError(f"Phantom generate.py failed with exit code {result.returncode}")

    # Find the output mp4
    mp4_files = glob.glob(f"{out_dir}/*.mp4")
    if not mp4_files:
        # Phantom may output .mp4 with a timestamp suffix — find any mp4
        mp4_files = glob.glob(f"/phantom/*.mp4") + glob.glob(f"/tmp/*.mp4")
    if not mp4_files:
        raise RuntimeError(f"No mp4 output found after Phantom generation")

    tmp_path = mp4_files[0]
    print(f"[Clip {clip_index}] Output: {tmp_path}")

    # Upload to R2
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


# ── Generate one clip — scenery T2V or avatar I2V via diffusers ──
@app.function(
    gpu="A10G",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 40,
    memory=32768,
    cpu=4,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def generate_clip_diffusers(
    prompt: str,
    clip_index: int,
    job_id: str,
    mode: str = "t2v",
    avatar_photo_url: str = "",
):
    import torch
    import boto3
    import requests
    import tempfile
    from PIL import Image

    print(f"[Clip {clip_index}] DIFFUSERS mode={mode}, job={job_id}")
    print(f"[Clip {clip_index}] GPU: {torch.cuda.get_device_name(0)}")

    if mode == "i2v" and avatar_photo_url:
        from diffusers import WanImageToVideoPipeline
        model_dir = f"{WEIGHTS_DIR}/Wan2.1-I2V-14B-480P-Diffusers"
        pipe = WanImageToVideoPipeline.from_pretrained(model_dir, torch_dtype=torch.bfloat16)
        pipe.enable_model_cpu_offload()

        img_response = requests.get(avatar_photo_url, timeout=30)
        img_response.raise_for_status()
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            f.write(img_response.content)
            avatar_path = f.name

        image = Image.open(avatar_path).convert("RGB").resize((832, 480))
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
        pipe = WanPipeline.from_pretrained(model_dir, torch_dtype=torch.bfloat16)
        pipe.enable_model_cpu_offload()

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

    if scenes and isinstance(scenes[0], str):
        scenes = [{"prompt": s, "has_character": True} for s in scenes]

    print(f"Generating {len(scenes)} clips for job {job_id}")
    print(f"mode={mode}, character_ref_url={character_ref_url or 'none'}")

    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    supabase.table("jobs").update({"status": "generating_clips"}).eq("id", job_id).execute()

    # Build per-clip tasks — route to VACE (character) or diffusers (scenery/avatar)
    vace_tasks = []
    phantom_tasks = []  # kept for reference, not used
    diffusers_tasks = []

    for i, scene in enumerate(scenes):
        prompt = scene["prompt"]
        has_char = scene.get("has_character", True)
        use_vace = has_char and character_ref_url and mode == "t2v"
        use_i2v = mode == "i2v" and avatar_photo_url

        if use_vace:
            vace_tasks.append((prompt, i, job_id, character_ref_url))
        elif use_i2v:
            diffusers_tasks.append((prompt, i, job_id, "i2v", avatar_photo_url))
        else:
            diffusers_tasks.append((prompt, i, job_id, "t2v", ""))

    print(f"VACE clips: {len(vace_tasks)}, Diffusers clips: {len(diffusers_tasks)}")

    # Results dict keyed by clip index
    results = {}

    # Run VACE clips (parallel across containers)
    if vace_tasks:
        for clip_url, task in zip(
            generate_clip_vace.starmap(vace_tasks),
            vace_tasks
        ):
            results[task[1]] = clip_url

    # Run diffusers clips (parallel across containers)
    if diffusers_tasks:
        for clip_url, task in zip(
            generate_clip_diffusers.starmap(diffusers_tasks),
            diffusers_tasks
        ):
            results[task[1]] = clip_url

    # Reassemble in order
    ordered_results = [results[i] for i in range(len(scenes))]
    print(f"All clips done: {ordered_results}")

    supabase.table("jobs").update({
        "status": "clips_ready",
        "clip_urls": json.dumps(ordered_results),
    }).eq("id", job_id).execute()

    print("Supabase updated. Done.")
