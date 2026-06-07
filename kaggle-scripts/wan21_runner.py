import os
import sys
import json
import requests
import subprocess

subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "torch", "diffusers", "transformers", "accelerate",
    "boto3", "huggingface_hub", "Pillow"
], check=True)

import boto3
from huggingface_hub import snapshot_download

JOB_ID           = os.environ["JOB_ID"]
SCENES_JSON      = os.environ["SCENES_JSON"]
WAN21_MODE       = os.environ.get("WAN21_MODE", "t2v")  # "t2v" or "i2v"
AVATAR_PHOTO_URL = os.environ.get("AVATAR_PHOTO_URL", "")
SUPABASE_URL     = os.environ["SUPABASE_URL"]
SUPABASE_KEY     = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID        = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME   = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL    = os.environ["R2_PUBLIC_URL"]

scenes = json.loads(SCENES_JSON)

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

# Download avatar portrait if i2v mode
portrait_path = None
if WAN21_MODE == "i2v" and AVATAR_PHOTO_URL:
    print(f"Downloading avatar portrait for i2v mode...")
    r = requests.get(AVATAR_PHOTO_URL)
    portrait_path = "avatar_portrait.jpg"
    with open(portrait_path, "wb") as f:
        f.write(r.content)
    print(f"Portrait saved: {os.path.getsize(portrait_path)} bytes")

# Download model weights
if WAN21_MODE == "i2v":
    print("Downloading Wan2.1-I2V-14B-480P weights...")
    snapshot_download("Wan-AI/Wan2.1-I2V-14B-480P", local_dir="./Wan2.1-I2V-14B-480P")
    ckpt_dir = "./Wan2.1-I2V-14B-480P"
    task_flag = "i2v-14B"
else:
    print("Downloading Wan2.1-T2V-1.3B weights...")
    snapshot_download("Wan-AI/Wan2.1-T2V-1.3B", local_dir="./Wan2.1-T2V-1.3B")
    ckpt_dir = "./Wan2.1-T2V-1.3B"
    task_flag = "t2v-1.3B"

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)

for i, scene in enumerate(scenes):
    print(f"Generating clip {i+1}/6 [{WAN21_MODE}]: {scene[:60]}...")
    output_file = f"clip_{i}.mp4"

    if WAN21_MODE == "i2v" and portrait_path:
        cmd = (
            f'python generate.py '
            f'--task {task_flag} '
            f'--size 832*480 '
            f'--ckpt_dir {ckpt_dir} '
            f'--image {portrait_path} '
            f'--prompt "{scene}" '
            f'--offload_model True '
            f'--output {output_file}'
        )
    else:
        cmd = (
            f'python generate.py '
            f'--task {task_flag} '
            f'--size 832*480 '
            f'--ckpt_dir {ckpt_dir} '
            f'--prompt "{scene}" '
            f'--offload_model True '
            f'--t5_cpu '
            f'--output {output_file}'
        )

    print(f"Running: {cmd}")
    ret = os.system(cmd)
    print(f"Exit code: {ret}")

    if not os.path.exists(output_file):
        patch_supabase({"status": "failed", "error": f"Clip {i+1} generation failed"})
        raise RuntimeError(f"{output_file} not found")

    r2_key = f"clips/{JOB_ID}/clip_{i}.mp4"
    s3.upload_file(output_file, R2_BUCKET_NAME, r2_key)
    print(f"Uploaded clip_{i}.mp4 → R2")

patch_supabase({"status": "clips_ready"})
print("All clips generated and uploaded.")
