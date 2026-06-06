import os
import requests
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

print("Downloading sd-vae-ft-mse...")
snapshot_download("stabilityai/sd-vae-ft-mse", local_dir="pretrained_weights/sd-vae-ft-mse")

print("Downloading sd-image-variations-diffusers...")
snapshot_download("lambdalabs/sd-image-variations-diffusers", local_dir="pretrained_weights/sd-image-variations-diffusers")

# EchoMimic's bundled whisper wrapper calls load_model(model_path) where model_path
# comes from config. It does NOT handle file paths ending in .pt — it passes the string
# to its own load_model() which only accepts names like "tiny" or a download_root dir.
# Fix: download tiny.pt into the default whisper cache (~/.cache/whisper/) AND
# patch the infer_acc.yaml config to use the name "tiny" instead of the file path.
print("Downloading whisper tiny.pt to cache...")
whisper_cache = os.path.expanduser("~/.cache/whisper")
os.makedirs(whisper_cache, exist_ok=True)
ret = os.system(
    f"wget -q -O {whisper_cache}/tiny.pt "
    "https://openaipublic.azureedge.net/main/whisper/models/"
    "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt"
)
print(f"wget exit code: {ret}")
print(f"tiny.pt in cache: {os.path.exists(f'{whisper_cache}/tiny.pt')}")
print(f"tiny.pt size: {os.path.getsize(f'{whisper_cache}/tiny.pt') if os.path.exists(f'{whisper_cache}/tiny.pt') else 'MISSING'}")

# Patch infer_acc.yaml to use model name "tiny" instead of a file path
config_path = "configs/prompts/infer_acc.yaml"
if os.path.exists(config_path):
    with open(config_path, "r") as f:
        config_text = f.read()
    print(f"Original audio_model_path line: {[l for l in config_text.splitlines() if 'audio_model_path' in l]}")
    # Replace any audio_model_path value with just "tiny"
    import re
    config_text = re.sub(r'(audio_model_path\s*:\s*).*', r'\1tiny', config_text)
    with open(config_path, "w") as f:
        f.write(config_text)
    print(f"Patched audio_model_path to: {[l for l in config_text.splitlines() if 'audio_model_path' in l]}")
else:
    print(f"WARNING: {config_path} not found — listing configs/prompts/:")
    os.system("ls -la configs/prompts/ 2>/dev/null || echo 'No configs/prompts dir'")

# Also create the pretrained_weights/audio_processor path with tiny.pt just in case
# the config points there and EchoMimic's whisper can handle an absolute path
os.makedirs("pretrained_weights/audio_processor", exist_ok=True)
abs_tiny = os.path.abspath("pretrained_weights/audio_processor/tiny.pt")
if not os.path.exists(abs_tiny):
    os.system(
        f"wget -q -O {abs_tiny} "
        "https://openaipublic.azureedge.net/main/whisper/models/"
        "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt"
    )
print(f"pretrained_weights/audio_processor/tiny.pt: {os.path.exists(abs_tiny)}")

# Download ffmpeg-static
print("Downloading ffmpeg-static...")
os.system("wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz")
os.system("tar -xf ffmpeg-release-amd64-static.tar.xz")
ffmpeg_dir = [d for d in os.listdir('.') if d.startswith('ffmpeg-') and os.path.isdir(d)][0]
ffmpeg_path = os.path.abspath(ffmpeg_dir)
os.environ["FFMPEG_PATH"] = ffmpeg_path
# Also put ffmpeg binary on PATH so any subprocess call to "ffmpeg" works
os.environ["PATH"] = ffmpeg_path + ":" + os.environ["PATH"]
print(f"FFMPEG_PATH={ffmpeg_path}")

os.makedirs("test_imgs", exist_ok=True)
os.makedirs("test_audios", exist_ok=True)

print("Downloading portrait...")
r = requests.get(SPOKESPERSON_PHOTO_URL)
with open("test_imgs/portrait.jpg", "wb") as f:
    f.write(r.content)
print(f"Portrait saved: {os.path.getsize('test_imgs/portrait.jpg')} bytes")

print("Downloading audio...")
r = requests.get(AUDIO_URL)
with open("test_audios/voiceover.mp3", "wb") as f:
    f.write(r.content)
print(f"Audio saved: {os.path.getsize('test_audios/voiceover.mp3')} bytes")

# Print the final config so we can confirm what infer_acc.py will see
print("\n--- infer_acc.yaml (audio section) ---")
if os.path.exists(config_path):
    with open(config_path) as f:
        for line in f:
            if any(k in line for k in ["audio", "ref_img", "output", "steps", "fps", "W", "H"]):
                print(line.rstrip())
print("--------------------------------------\n")

print("Running EchoMimic inference...")
cmd = (
    f"FFMPEG_PATH={ffmpeg_path} python infer_acc.py "
    f"--refimg_name portrait.jpg "
    f"--audio_name voiceover.mp3 "
    f"--ref_images_dir test_imgs "
    f"--audio_dir test_audios "
    f"-W 768 -H 768 "
    f"--fps 24 "
    f"--steps 20 "
    f"--device cuda"
)
print(f"Running: {cmd}")
ret = os.system(cmd)
print(f"EchoMimic exit code: {ret}")

# Find output mp4
output_file = None
for root, dirs, files in os.walk("."):
    # Skip the pretrained_weights and git dirs to speed up search
    dirs[:] = [d for d in dirs if d not in ["pretrained_weights", ".git", "ffmpeg-7.0.2-amd64-static"]]
    for f in files:
        if f.endswith(".mp4"):
            output_file = os.path.join(root, f)
            print(f"Found output: {output_file}")
            break
    if output_file:
        break

# List outputs dir for debugging
print("Listing ./outputs/ (if exists):")
os.system("ls -lh outputs/ 2>/dev/null || echo 'no outputs dir'")
print("Listing ./results/ (if exists):")
os.system("ls -lh results/ 2>/dev/null || echo 'no results dir'")

if not output_file or not os.path.exists(output_file):
    patch_supabase({"status": "failed", "error": "EchoMimic produced no output"})
    raise RuntimeError("No output.mp4 found")

print(f"Output file: {output_file} ({os.path.getsize(output_file)} bytes)")

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
