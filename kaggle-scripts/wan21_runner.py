import os
import sys
import json
import requests
import subprocess
import time

# T4 uses the default Kaggle torch — no need to pin cu126 (that was P100-specific)
subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "diffusers==0.31.0",
    "transformers==4.44.2",
    "accelerate",
    "boto3",
    "huggingface_hub",
    "Pillow"
], check=True)

import boto3
from huggingface_hub import login

HF_TOKEN = os.environ.get("HF_TOKEN", "")
if HF_TOKEN:
    login(token=HF_TOKEN)

from huggingface_hub import snapshot_download

JOB_ID           = os.environ["JOB_ID"]
SCENES_JSON      = os.environ["SCENES_JSON"]
WAN21_MODE       = os.environ.get("WAN21_MODE", "t2v")
AVATAR_PHOTO_URL = os.environ.get("AVATAR_PHOTO_URL", "")
SUPABASE_URL     = os.environ["SUPABASE_URL"]
SUPABASE_KEY     = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID        = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME   = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL    = os.environ["R2_PUBLIC_URL"]

scenes = json.loads(SCENES_JSON)

import subprocess as sp
result = sp.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], capture_output=True, text=True)
print(f"GPU info: {result.stdout.strip()}")

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

print("Cloning Wan2.1 inference code...")
sp.run(["git", "clone", "https://github.com/Wan-Video/Wan2.1.git", "wan2.1"], check=True)
os.chdir("wan2.1")
print("Installing flash_attn for torch 2.10 + Python 3.12...")
sp.run([sys.executable, "-m", "pip", "install", "-q", "https://github.com/lesj0610/flash-attention/releases/download/v2.8.3-cu12-torch2.10-cp312/flash_attn-2.8.3+cu12torch2.10cxx11abiTRUE-cp312-cp312-linux_x86_64.whl"], check=True)
print("flash_attn installed.")
print("Installing Wan2.1 requirements (skipping flash_attn)...")
# Remove flash_attn from requirements to avoid 70-min compile
import re as _re
with open("requirements.txt", "r") as _f:
    _reqs = _re.sub(r".*flash.attn.*\n?", "", _f.read())
with open("requirements_noflattn.txt", "w") as _f:
    _f.write(_reqs)
sp.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements_noflattn.txt"], check=True)
print("Requirements installed.")

# T4 supports FlashAttention natively — no SDPA patch needed
result = sp.run([sys.executable, "-c", "import flash_attn; print('flash_attn OK')"], capture_output=True, text=True)
print(f"FlashAttention: {result.stdout.strip() or result.stderr.strip()}")

print("Downloading Wan2.1-T2V-1.3B weights...")
snapshot_download("Wan-AI/Wan2.1-T2V-1.3B", local_dir="./Wan2.1-T2V-1.3B")
ckpt_dir = "./Wan2.1-T2V-1.3B"
task_flag = "t2v-1.3B"

NEG_PROMPT = (
    "text, subtitles, watermark, caption, words, letters, "
    "morphing face, distorted face, blurry, low quality, "
    "static, frozen, flickering, artifacts, noise, "
    "extra limbs, deformed hands, missing fingers, "
    "worst quality, ugly, duplicate"
)

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)

def extract_last_frame(video_path, frame_path):
    ret = os.system(
        f'ffmpeg -sseof -0.1 -i {video_path} -frames:v 1 -q:v 2 {frame_path} -y 2>/dev/null'
    )
    if ret != 0 or not os.path.exists(frame_path):
        os.system(
            f'ffmpeg -i {video_path} -ss 00:00:00.500 -frames:v 1 -q:v 2 {frame_path} -y 2>/dev/null'
        )
    exists = os.path.exists(frame_path)
    print(f"Last frame extracted: {frame_path} exists={exists}")
    return exists

prev_last_frame = None

for i, scene in enumerate(scenes):
    print(f"Generating clip {i+1}/{len(scenes)} [{WAN21_MODE}]: {scene[:80]}...")
    output_file = f"clip_{i}.mp4"
    last_frame_file = f"last_frame_{i}.jpg"

    first_frame_flag = ""
    if prev_last_frame and os.path.exists(prev_last_frame):
        first_frame_flag = f'--first_frame {prev_last_frame} '
        print(f"Chaining from: {prev_last_frame}")
    else:
        print(f"Clip {i+1}: cold start")

    cmd = (
        f'PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True '
        f'python generate.py '
        f'--task {task_flag} '
        f'--size 832*480 '
        f'--frame_num 33 '
        f'--ckpt_dir {ckpt_dir} '
        f'--prompt "{scene}" '
        f'{first_frame_flag}'
        f'--offload_model True '
        f'--t5_cpu '
        f'--sample_shift 8 '
        f'--sample_guide_scale 6 '
        f'--save_file {output_file}'
    )

    print(f"Running: {cmd}")
    ret = os.system(cmd)
    print(f"Exit code: {ret}")

    if not os.path.exists(output_file):
        patch_supabase({"status": "failed", "error": f"Clip {i+1} generation failed"})
        raise RuntimeError(f"{output_file} not found")

    if extract_last_frame(output_file, last_frame_file):
        prev_last_frame = last_frame_file
    else:
        print(f"WARNING: could not extract last frame from clip {i+1}, next clip cold starts")
        prev_last_frame = None

    r2_key = f"clips/{JOB_ID}/clip_{i}.mp4"
    s3.upload_file(output_file, R2_BUCKET_NAME, r2_key)
    print(f"Uploaded clip_{i}.mp4 → R2")

for attempt in range(5):
    try:
        patch_supabase({"status": "clips_ready"})
        print("Status patched: clips_ready")
        break
    except Exception as e:
        print(f"Patch attempt {attempt+1}/5 failed: {e}")
        time.sleep(5)
print("All clips generated and uploaded.")
