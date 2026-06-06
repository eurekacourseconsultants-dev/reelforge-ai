import os
import requests
import subprocess
import sys

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

# Download ffmpeg-static (required by EchoMimic)
print("Downloading ffmpeg-static...")
os.system("wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz")
os.system("tar -xf ffmpeg-release-amd64-static.tar.xz")
ffmpeg_dir = [d for d in os.listdir('.') if d.startswith('ffmpeg-') and os.path.isdir(d)][0]
ffmpeg_path = os.path.abspath(ffmpeg_dir)
os.environ["FFMPEG_PATH"] = ffmpeg_path
print(f"FFMPEG_PATH={ffmpeg_path}")

# Set up input dirs as EchoMimic expects
os.makedirs("test_imgs", exist_ok=True)
os.makedirs("test_audios", exist_ok=True)

print("Downloading portrait...")
r = requests.get(SPOKESPERSON_PHOTO_URL)
with open("test_imgs/portrait.jpg", "wb") as f:
    f.write(r.content)

print("Downloading audio...")
r = requests.get(AUDIO_URL)
with open("test_audios/voiceover.mp3", "wb") as f:
    f.write(r.content)

print("Running EchoMimic inference...")
# Use correct args from infer_acc.py usage: -W -H (single dash), no --output
cmd = (
    f"FFMPEG_PATH={ffmpeg_path} python infer_acc.py "
    f"--refimg_name portrait.jpg "
    f"--audio_name voiceover.mp3 "
    f"--ref_images_dir test_imgs "
    f"--audio_dir test_audios "
    f"-W 512 -H 512 "
    f"--fps 24 "
    f"--steps 20 "
    f"--device cuda"
)
print(f"Running: {cmd}")
ret = os.system(cmd)
print(f"EchoMimic exit code: {ret}")

# Find output - EchoMimic saves to ./output/ or similar
output_file = None
for root, dirs, files in os.walk("."):
    for f in files:
        if f.endswith(".mp4"):
            output_file = os.path.join(root, f)
            print(f"Found output: {output_file}")
            break
    if output_file:
        break

if not output_file or not os.path.exists(output_file):
    # List all files to help debug
    print("Files in current dir:")
    for root, dirs, files in os.walk("."):
        for f in files:
            print(os.path.join(root, f))
    patch_supabase({"status": "failed", "error": "EchoMimic produced no output"})
    raise RuntimeError("No output.mp4 found")

print("Uploading to R2...")
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)
r2_key = f"raw/{JOB_ID}.mp4"
s3.upload_file(output_file, R2_BUCKET_NAME, r2_key)
r2_url = f"{R2_PUBLIC_URL}/{r2_key}"

patch_supabase({"status": "video_ready", "raw_video_url": r2_url})
print(f"Done. Uploaded to {r2_url}")
