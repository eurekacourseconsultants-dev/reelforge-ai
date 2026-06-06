import os
import requests

os.system("apt-get install -y git ffmpeg")
os.system("pip install -q torch==2.5.1 torchvision torchaudio xformers torchao boto3 huggingface_hub")

JOB_ID = os.environ["JOB_ID"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"]
SPOKESPERSON_PHOTO_URL = os.environ["SPOKESPERSON_PHOTO_URL"]
AUDIO_URL = os.environ["AUDIO_URL"]

import boto3

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

print("Cloning EchoMimic V2...")
os.system("git clone https://github.com/antgroup/echomimic_v2")
os.chdir("echomimic_v2")
os.system("pip install -q -r requirements.txt")

from huggingface_hub import snapshot_download
print("Downloading EchoMimic V2 weights...")
snapshot_download("BadToBest/EchoMimicV2", local_dir="pretrained_weights")

print("Downloading portrait...")
r = requests.get(SPOKESPERSON_PHOTO_URL)
with open("portrait.jpg", "wb") as f:
    f.write(r.content)

print("Downloading audio...")
r = requests.get(AUDIO_URL)
with open("voiceover.mp3", "wb") as f:
    f.write(r.content)

print("Running EchoMimic inference...")
os.system(
    "python infer_acc.py "
    "--ref_img portrait.jpg "
    "--audio voiceover.mp3 "
    "--output output.mp4 "
    "--num_frames 720 "
    "--fps 24"
)

if not os.path.exists("output.mp4"):
    patch_supabase({"status": "failed", "error": "EchoMimic produced no output"})
    raise RuntimeError("output.mp4 not found")

print("Uploading to R2...")
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)
r2_key = f"raw/{JOB_ID}.mp4"
s3.upload_file("output.mp4", R2_BUCKET_NAME, r2_key)
r2_url = f"{R2_PUBLIC_URL}/{r2_key}"

patch_supabase({"status": "video_ready", "raw_video_url": r2_url})
print(f"Done. Uploaded to {r2_url}")
