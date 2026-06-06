import os
import sys
import subprocess
import requests

subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "diffusers", "transformers", "accelerate", "boto3", "huggingface_hub"
], check=True)

import torch
import boto3
from diffusers import StableDiffusionPipeline

JOB_ID = os.environ["JOB_ID"]
PORTRAIT_PREFS = os.environ.get("PORTRAIT_PREFS", "{}")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"]

import json
prefs = json.loads(PORTRAIT_PREFS) if PORTRAIT_PREFS else {}
gender = prefs.get("gender", "person")
age = prefs.get("age", "30s")
style = prefs.get("style", "professional")

# Short prompt - SD 1.5 CLIP max is 77 tokens
full_prompt = f"portrait photo of a {age} {gender}, {style} attire, front facing, neutral background, soft lighting, upper body, photorealistic"
negative_prompt = "sunglasses, cartoon, anime, blurry, side view, low quality"

print(f"Prompt: {full_prompt}")
print("Running on CPU to avoid CUDA compatibility issues")

def patch_supabase(data):
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{JOB_ID}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
        json=data,
    )

print("Loading SD 1.5 pipeline...")
pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5",
    torch_dtype=torch.float32,
    safety_checker=None,
)
pipe = pipe.to("cpu")

print("Generating portrait (CPU - takes 3-5 min)...")
image = pipe(
    full_prompt,
    negative_prompt=negative_prompt,
    height=512,
    width=512,
    num_inference_steps=20,
    guidance_scale=7.5,
).images[0]

image.save("portrait.jpg")
print("Portrait saved.")

print("Uploading to R2...")
s3 = boto3.client("s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY)
s3.upload_file("portrait.jpg", R2_BUCKET_NAME, "assets/spokesperson.jpg")
r2_url = f"{R2_PUBLIC_URL}/assets/spokesperson.jpg"
print(f"Uploaded to {r2_url}")

requests.post(f"{SUPABASE_URL}/rest/v1/settings",
    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
    json={"key": "spokesperson_photo_url", "value": r2_url})

patch_supabase({"status": "portrait_ready"})
print("Done.")
