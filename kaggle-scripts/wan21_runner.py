import os
import json
import requests
import boto3

os.system("pip install -q torch diffusers transformers accelerate boto3 huggingface_hub")

JOB_ID = os.environ["JOB_ID"]
SCENES_JSON = os.environ["SCENES_JSON"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"]

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

from huggingface_hub import snapshot_download
print("Downloading Wan2.1 weights...")
snapshot_download("Wan-AI/Wan2.1-T2V-1.3B", local_dir="./Wan2.1-T2V-1.3B")

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)

for i, scene in enumerate(scenes):
    print(f"Generating clip {i+1}/6: {scene[:60]}...")
    output_file = f"clip_{i}.mp4"
    os.system(
        f'python generate.py '
        f'--task t2v-1.3B '
        f'--size 832*480 '
        f'--ckpt_dir ./Wan2.1-T2V-1.3B '
        f'--prompt "{scene}" '
        f'--output {output_file}'
    )
    if not os.path.exists(output_file):
        patch_supabase({"status": "failed", "error": f"Clip {i} generation failed"})
        raise RuntimeError(f"{output_file} not found")

    r2_key = f"clips/{JOB_ID}/clip_{i}.mp4"
    s3.upload_file(output_file, R2_BUCKET_NAME, r2_key)
    print(f"Uploaded clip_{i}.mp4 to R2")

patch_supabase({"status": "clips_ready"})
print("All clips generated and uploaded.")
