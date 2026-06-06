import os
import sys
import subprocess
import requests
import json

subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "diffusers", "transformers", "accelerate", "boto3",
    "huggingface_hub", "Pillow", "opencv-python-headless"
], check=True)

import torch
import boto3
import cv2
from PIL import Image
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

prefs = json.loads(PORTRAIT_PREFS) if PORTRAIT_PREFS else {}
gender = prefs.get("gender", "woman")
age = prefs.get("age", "20s")
style = prefs.get("style", "professional")

def patch_supabase(data):
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{JOB_ID}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
        json=data,
    )

def is_frontal(image_path, threshold=0.25):
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) != 1:
        print(f"Face check failed: detected {len(faces)} faces")
        return False
    x, y, w, h = faces[0]
    img_w = img.shape[1]
    offset = abs((x + w / 2) - img_w / 2) / img_w
    print(f"Face center offset: {offset:.3f} (threshold {threshold})")
    return offset < threshold

prompts = [
    f"passport photo of a {age} asian {gender}, face directly forward, eyes looking straight at camera, plain white top, neutral grey background, head and shoulders, symmetrical, studio lighting, photorealistic",
    f"id card photo of a {age} asian {gender}, frontal face, straight ahead gaze, simple clothing, grey background, sharp focus, photorealistic",
    f"mugshot style portrait of a {age} asian {gender}, face forward, direct eye contact, plain top, neutral background, symmetrical, photorealistic",
    f"professional headshot of a {age} asian {gender}, perfectly centered face, looking directly at camera, solid color top, studio background, photorealistic",
]
negative_prompt = "side view, profile, three quarter view, angled, turned, looking away, sunglasses, hat, cartoon, anime, blurry, low quality, deformed, full body, jacket, blazer, suit, hands, arms, dynamic pose"

print("Loading SD 1.5 pipeline on CPU...")
pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5",
    torch_dtype=torch.float32,
    safety_checker=None,
)
pipe = pipe.to("cpu")

image = None
for attempt, prompt in enumerate(prompts):
    print(f"Attempt {attempt+1}/4: generating...")
    result = pipe(
        prompt,
        negative_prompt=negative_prompt,
        height=512,
        width=512,
        num_inference_steps=25,
        guidance_scale=7.5,
    ).images[0]
    result.save("portrait_candidate.jpg")
    if is_frontal("portrait_candidate.jpg"):
        print(f"Frontal face confirmed on attempt {attempt+1}")
        image = result
        break
    print(f"Attempt {attempt+1} rejected - not frontal")

if image is None:
    print("WARNING: no frontal face after 4 attempts - using last candidate")
    image = result

image = image.resize((512, 512), Image.LANCZOS)
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
