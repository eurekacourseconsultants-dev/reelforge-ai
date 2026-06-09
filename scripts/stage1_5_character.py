"""
stage1_5_character.py — Generate full-body character reference image via FLUX on Kaggle
Runs only when has_character=true and no avatar is selected.
Uploads reference image to R2, saves character_ref_url to Supabase and pipeline_data.json.
"""

import os
import json
import requests
import base64
import tempfile
import boto3

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
JOB_ID       = os.environ["JOB_ID"]
R2_ACCOUNT_ID       = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID    = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME      = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL       = os.environ["R2_PUBLIC_URL"]
HF_TOKEN            = os.environ["HF_TOKEN"]

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

def upload_to_r2(local_path, r2_key):
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )
    with open(local_path, "rb") as f:
        s3.upload_fileobj(f, R2_BUCKET_NAME, r2_key, ExtraArgs={"ContentType": "image/jpeg"})
    return f"{R2_PUBLIC_URL}/{r2_key}"

def generate_character_image(character_description):
    """Generate full-body character reference via FLUX.1-schnell on HuggingFace."""
    print(f"[stage1_5] Generating character reference image...")
    print(f"[stage1_5] Prompt: {character_description}")

    API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}

    payload = {
        "inputs": character_description,
        "parameters": {
            "width": 512,
            "height": 896,   # portrait aspect ratio for full body
            "num_inference_steps": 4,
            "guidance_scale": 0.0,
        }
    }

    response = requests.post(API_URL, headers=headers, json=payload, timeout=120)
    response.raise_for_status()

    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(response.content)
        tmp_path = f.name

    print(f"[stage1_5] Image saved to {tmp_path}")
    return tmp_path

def main():
    # Load pipeline_data.json written by stage1.js
    with open("pipeline_data.json", "r") as f:
        pipeline_data = json.load(f)

    has_character = pipeline_data.get("has_character", False)
    character_description = pipeline_data.get("character_description", "")

    if not has_character or not character_description:
        print("[stage1_5] No character detected or no description — skipping.")
        return

    # Generate the image
    tmp_path = generate_character_image(character_description)

    # Upload to R2
    r2_key = f"jobs/{JOB_ID}/character_ref.jpg"
    character_ref_url = upload_to_r2(tmp_path, r2_key)
    print(f"[stage1_5] Uploaded to R2: {character_ref_url}")

    # Update pipeline_data.json with the ref URL
    pipeline_data["character_ref_url"] = character_ref_url
    with open("pipeline_data.json", "w") as f:
        json.dump(pipeline_data, f)

    # Save to Supabase
    patch_supabase({"character_ref_url": character_ref_url})
    print(f"[stage1_5] Done. character_ref_url={character_ref_url}")

if __name__ == "__main__":
    main()
