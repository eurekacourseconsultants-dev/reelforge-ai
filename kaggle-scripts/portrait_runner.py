import os
import sys
import subprocess
import requests
import json

# P100 is CUDA sm_60 (Pascal). Kaggle's default PyTorch only supports sm_70+.
# Must install PyTorch 2.0.1 with CUDA 11.8 which still supports sm_60.
print("Installing PyTorch 2.0.1 for P100 (sm_60) compatibility...")
subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "torch==2.0.1", "torchvision==0.15.2", "torchaudio==2.0.2",
    "--index-url", "https://download.pytorch.org/whl/cu118",
    "--force-reinstall"
], check=True)

subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "diffusers==0.27.2", "transformers", "accelerate", "boto3",
    "huggingface_hub", "Pillow", "opencv-python-headless"
], check=True)

import torch
import boto3
import cv2
from PIL import Image
from diffusers import StableDiffusionPipeline, AutoencoderKL

AVATAR_ID            = os.environ["AVATAR_ID"]
AVATAR_NAME          = os.environ.get("AVATAR_NAME", "Avatar")
PORTRAIT_PREFS       = os.environ.get("PORTRAIT_PREFS", "{}")
SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_KEY         = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID        = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME       = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL        = os.environ["R2_PUBLIC_URL"]

prefs     = json.loads(PORTRAIT_PREFS) if PORTRAIT_PREFS else {}
gender    = prefs.get("gender", "woman")
age       = prefs.get("age", "25")
style     = prefs.get("style", "professional")
ethnicity = prefs.get("ethnicity", "")

# Build ethnicity descriptor for prompt
ethnicity_map = {
    "Asian":           "east asian",
    "South Asian":     "south asian",
    "Black":           "black",
    "Hispanic":        "hispanic latino",
    "Middle Eastern":  "middle eastern",
    "White":           "caucasian white",
    "Southeast Asian": "southeast asian",
}
eth_desc = ethnicity_map.get(ethnicity, "")
person_desc = f"{age} year old {eth_desc} {gender}".strip()

def patch_avatar(data):
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/avatars?id=eq.{AVATAR_ID}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json=data,
    )

def is_frontal(image_path, threshold=0.20):
    img  = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) != 1:
        print(f"Face check failed: detected {len(faces)} faces")
        return False
    x, y, w, h = faces[0]
    img_w  = img.shape[1]
    offset = abs((x + w / 2) - img_w / 2) / img_w
    print(f"Face center offset: {offset:.3f} (threshold {threshold})")
    return offset < threshold

prompts = [
    f"RAW photo, passport photo of a {person_desc}, face directly forward, eyes looking straight at camera, plain white top, neutral grey background, head and shoulders, symmetrical, studio lighting, photorealistic, 8k uhd, sharp focus, color photo",
    f"RAW photo, id card photo of a {person_desc}, frontal face, straight ahead gaze, simple clothing, grey background, sharp focus, photorealistic, high quality skin, color photo, natural skin tones",
    f"RAW photo, professional headshot of a {person_desc}, perfectly centered face, looking directly at camera, solid color top, studio background, photorealistic, color photo, natural skin tones",
    f"RAW photo, mugshot style portrait of a {person_desc}, face forward, direct eye contact, plain top, neutral background, symmetrical, photorealistic, color photo, natural skin tones",
]
negative_prompt = (
    "monochrome, grayscale, black and white, sepia, side view, profile, "
    "three quarter view, angled, turned, looking away, sunglasses, hat, "
    "cartoon, anime, blurry, low quality, deformed, full body, jacket, "
    "blazer, suit, hands, arms, dynamic pose, painting, illustration"
)

print("Loading VAE: stabilityai/sd-vae-ft-mse...")
vae = AutoencoderKL.from_pretrained(
    "stabilityai/sd-vae-ft-mse",
    torch_dtype=torch.float16,
)

print("Loading Realistic Vision V5.1 pipeline on GPU...")
pipe = StableDiffusionPipeline.from_pretrained(
    "SG161222/Realistic_Vision_V5.1_noVAE",
    vae=vae,
    torch_dtype=torch.float16,
    safety_checker=None,
)
pipe = pipe.to("cuda")
print(f"Pipeline loaded on GPU. Generating: {person_desc}")

image = None
last_result = None
for attempt, prompt in enumerate(prompts):
    print(f"Attempt {attempt+1}/4: generating...")
    result = pipe(
        prompt,
        negative_prompt=negative_prompt,
        height=512,
        width=512,
        num_inference_steps=30,
        guidance_scale=7.5,
    ).images[0]
    last_result = result
    result.save("portrait_candidate.jpg")
    if is_frontal("portrait_candidate.jpg"):
        print(f"Frontal face confirmed on attempt {attempt+1}")
        image = result
        break
    print(f"Attempt {attempt+1} rejected - not frontal")

if image is None:
    print("WARNING: no frontal face after 4 attempts - using last candidate")
    image = last_result

image = image.resize((512, 512), Image.LANCZOS)
image.save("portrait.jpg")

thumb = image.resize((256, 256), Image.LANCZOS)
thumb.save("portrait_thumb.jpg")
print("Portrait and thumbnail saved.")

print("Uploading to R2...")
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)

r2_key       = f"avatars/{AVATAR_ID}.jpg"
r2_thumb_key = f"avatars/{AVATAR_ID}_thumb.jpg"

s3.upload_file("portrait.jpg",       R2_BUCKET_NAME, r2_key,       ExtraArgs={"ContentType": "image/jpeg"})
s3.upload_file("portrait_thumb.jpg", R2_BUCKET_NAME, r2_thumb_key, ExtraArgs={"ContentType": "image/jpeg"})

photo_url     = f"{R2_PUBLIC_URL}/{r2_key}"
thumbnail_url = f"{R2_PUBLIC_URL}/{r2_thumb_key}"
print(f"Uploaded: {photo_url}")
print(f"Thumbnail: {thumbnail_url}")

patch_avatar({
    "photo_url":     photo_url,
    "thumbnail_url": thumbnail_url,
    "status":        "ready",
})
print("Done.")
