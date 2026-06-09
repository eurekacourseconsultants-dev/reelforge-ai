import os
import sys
import json
import requests
import subprocess
import time

subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "boto3", "huggingface_hub", "Pillow"
], check=True)

import boto3
from huggingface_hub import login

HF_TOKEN = os.environ.get("HF_TOKEN", "")
if HF_TOKEN:
    login(token=HF_TOKEN)

JOB_ID               = os.environ["JOB_ID"]
SCENES_JSON          = os.environ["SCENES_JSON"]
AVATAR_DESCRIPTION   = os.environ.get("AVATAR_DESCRIPTION", "")
AVATAR_PHOTO_URL     = os.environ.get("AVATAR_PHOTO_URL", "")   # set for avatar_scene / avatar_lipsync
SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_KEY         = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID        = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME       = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL        = os.environ["R2_PUBLIC_URL"]

scenes = json.loads(SCENES_JSON)

import subprocess as sp
result = sp.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], capture_output=True, text=True)
print(f"GPU info: {result.stdout.strip()}")

# Decide mode up front so it's clear in logs
USE_I2V = bool(AVATAR_PHOTO_URL)
print(f"Mode: {'i2v (avatar photo reference)' if USE_I2V else 't2v (text only)'}")
print(f"Scenes: {len(scenes)}, Avatar description: {AVATAR_DESCRIPTION[:80] if AVATAR_DESCRIPTION else 'none'}")

def patch_supabase(data):
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{JOB_ID}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json=data,
    )

# ── Install WanGP ──────────────────────────────────────────────────────────────
print("Cloning WanGP...")
sp.run(["git", "clone", "https://github.com/deepbeepmeep/Wan2GP.git", "Wan2GP"], check=True)
os.chdir("Wan2GP")

print("Installing WanGP requirements...")
sp.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
print("WanGP requirements installed.")

# ── Download avatar photo if i2v mode ─────────────────────────────────────────
AVATAR_IMAGE_PATH = None
if USE_I2V:
    print(f"Downloading avatar photo from {AVATAR_PHOTO_URL}...")
    r = requests.get(AVATAR_PHOTO_URL, timeout=30)
    AVATAR_IMAGE_PATH = "/kaggle/working/avatar.jpg"
    with open(AVATAR_IMAGE_PATH, "wb") as f:
        f.write(r.content)
    print(f"Avatar photo saved: {os.path.getsize(AVATAR_IMAGE_PATH)} bytes")

# ── Output dir ────────────────────────────────────────────────────────────────
OUTPUT_DIR = "/kaggle/working/outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Negative prompt ───────────────────────────────────────────────────────────
NEG_PROMPT = (
    "text, subtitles, watermark, caption, words, letters, "
    "morphing face, distorted face, blurry, low quality, "
    "static, frozen, flickering, artifacts, noise, "
    "extra limbs, deformed hands, missing fingers, "
    "worst quality, ugly, duplicate"
)

# ── R2 client ─────────────────────────────────────────────────────────────────
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)

# ── Generate clips ────────────────────────────────────────────────────────────
for i, scene in enumerate(scenes):
    print(f"\n=== Clip {i+1}/{len(scenes)} ===")

    # Always prepend avatar description to anchor the character appearance
    if AVATAR_DESCRIPTION:
        prompt = f"{AVATAR_DESCRIPTION}, {scene}"
    else:
        prompt = scene

    print(f"Prompt: {prompt[:150]}...")
    output_file = os.path.join(OUTPUT_DIR, f"clip_{i}.mp4")

    if USE_I2V:
        # i2v_1.3B: uses avatar photo as the start frame reference,
        # generating a scene with that character in it.
        # image_start is the confirmed field name from wgp.py validate_settings.
        task = {
            "model_type": "i2v_1.3B",
            "prompt": prompt,
            "negative_prompt": NEG_PROMPT,
            "image_start": AVATAR_IMAGE_PATH,
            "width": 832,
            "height": 480,
            "num_frames": 49,
            "num_inference_steps": 15,
            "guidance_scale": 6.0,
            "output_file": output_file,
        }
    else:
        # t2v: pure scene generation, no avatar reference
        task = {
            "model_type": "t2v_1.3B",
            "prompt": prompt,
            "negative_prompt": NEG_PROMPT,
            "width": 832,
            "height": 480,
            "num_frames": 49,
            "num_inference_steps": 15,
            "guidance_scale": 6.0,
            "output_file": output_file,
        }

    settings_file = f"/kaggle/working/settings_{i}.json"
    with open(settings_file, "w") as f:
        json.dump([task], f)

    cmd = (
        f'PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True '
        f'{sys.executable} wgp.py '
        f'--process {settings_file} '
        f'--output-dir {OUTPUT_DIR} '
        f'--attention sdpa '
        f'--profile 4 '
        f'--verbose 2'
    )

    print(f"Running WanGP ({'i2v' if USE_I2V else 't2v'})...")
    ret = os.system(cmd)
    print(f"Exit code: {ret}")

    if not os.path.exists(output_file):
        mp4_files = sorted(
            [f for f in os.listdir(OUTPUT_DIR) if f.endswith(".mp4")],
            key=lambda f: os.path.getmtime(os.path.join(OUTPUT_DIR, f)),
            reverse=True
        )
        if mp4_files:
            generated = os.path.join(OUTPUT_DIR, mp4_files[0])
            print(f"WanGP saved as: {generated}, renaming to {output_file}")
            os.rename(generated, output_file)
        else:
            patch_supabase({"status": "failed", "error": f"Clip {i+1} generation failed (exit {ret})"})
            raise RuntimeError(f"clip_{i}.mp4 not found in {OUTPUT_DIR}")

    r2_key = f"clips/{JOB_ID}/clip_{i}.mp4"
    s3.upload_file(output_file, R2_BUCKET_NAME, r2_key)
    print(f"Uploaded clip_{i}.mp4 → R2")
    os.remove(output_file)

for attempt in range(5):
    try:
        patch_supabase({"status": "clips_ready"})
        print("Status patched: clips_ready")
        break
    except Exception as e:
        print(f"Patch attempt {attempt+1}/5 failed: {e}")
        time.sleep(5)

print("All clips generated and uploaded.")
