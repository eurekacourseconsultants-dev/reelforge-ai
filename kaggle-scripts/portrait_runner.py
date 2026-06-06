import os
import sys
import subprocess
import requests

# Install compatible PyTorch for P100 (CUDA 11.8, sm_60)
subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "torch==2.1.2", "torchvision==0.16.2",
    "--index-url", "https://download.pytorch.org/whl/cu118"
], check=True)

subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "diffusers", "transformers", "accelerate", "boto3", "huggingface_hub"
], check=True)

import torch
import boto3
from diffusers import FluxPipeline
from huggingface_hub import snapshot_download

JOB_ID = os.environ["JOB_ID"]
PORTRAIT_PROMPT = os.environ["PORTRAIT_PROMPT"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"]

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

print("Downloading FLUX.1-schnell weights...")
snapshot_download("black-forest-labs/FLUX.1-schnell")

print("Loading pipeline...")
pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-schnell",
    torch_dtype=torch.float16,
)
pipe.enable_model_cpu_offload()
pipe.enable_vae_tiling()

print("Generating portrait...")
image = pipe(
    PORTRAIT_PROMPT,
    height=768,
    width=768,
    num_inference_steps=4,
    guidance_scale=0.0,
).images[0]

image.save("portrait.jpg")
print("Portrait saved.")

print("Uploading to R2...")
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)
s3.upload_file("portrait.jpg", R2_BUCKET_NAME, "assets/spokesperson.jpg")
r2_url = f"{R2_PUBLIC_URL}/assets/spokesperson.jpg"
print(f"Uploaded to {r2_url}")

print("Updating Supabase settings...")
requests.post(
    f"{SUPABASE_URL}/rest/v1/settings",
    headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    },
    json={"key": "spokesperson_photo_url", "value": r2_url},
)

patch_supabase({"status": "portrait_ready"})
print("Done.")
