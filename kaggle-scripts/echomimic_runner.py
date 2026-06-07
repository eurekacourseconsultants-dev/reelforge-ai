import os
import requests
import sys

os.system("apt-get install -y git ffmpeg --fix-missing")
# Must use cu126 — last build with Pascal/sm_60 (P100) support
os.system("pip install -q torch==2.6.0+cu126 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126")
os.system("pip install -q xformers torchao boto3 huggingface_hub")

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

print("Cloning EchoMimicV3...")
os.system("git clone https://github.com/antgroup/echomimic_v3")
os.chdir("echomimic_v3")

# Remove tensorflow — not needed for inference, not available on this Python version
os.system("sed -i '/tensorflow/d' requirements.txt")
os.system("pip install -q -r requirements.txt")

from huggingface_hub import snapshot_download

# --- Download models ---
# NOTE: Do NOT download alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP here.
# That's 18GB and blows the 20GB Kaggle disk limit.
# EchoMimicV3 Flash bundles its own transformer weights via BadToBest/EchoMimicV3.
# The --model_name flag points to where those weights live locally, not a separate download.

print("Downloading chinese-wav2vec2-base audio encoder...")
snapshot_download(
    "TencentGameMate/chinese-wav2vec2-base",
    local_dir="flash/chinese-wav2vec2-base"
)

print("Downloading EchoMimicV3-Flash-Pro weights...")
snapshot_download(
    "BadToBest/EchoMimicV3",
    local_dir="flash_weights_tmp",
    allow_patterns=["echomimicv3-flash-pro/*"]
)
# Move transformer weights into expected location
os.makedirs("flash/transformer", exist_ok=True)
os.system("cp flash_weights_tmp/echomimicv3-flash-pro/transformer/diffusion_pytorch_model.safetensors flash/transformer/")
print(f"Flash transformer weights: {os.path.exists('flash/transformer/diffusion_pytorch_model.safetensors')}")

# --- Download ffmpeg static ---
print("Downloading ffmpeg-static...")
os.system("wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz")
os.system("tar -xf ffmpeg-release-amd64-static.tar.xz")
ffmpeg_dir = [d for d in os.listdir('.') if d.startswith('ffmpeg-') and os.path.isdir(d)][0]
ffmpeg_path = os.path.abspath(ffmpeg_dir)
os.environ["FFMPEG_PATH"] = ffmpeg_path
os.environ["PATH"] = ffmpeg_path + ":" + os.environ["PATH"]
print(f"FFMPEG_PATH={ffmpeg_path}")

# --- Download portrait and audio ---
os.makedirs("inputs", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

print("Downloading portrait...")
r = requests.get(SPOKESPERSON_PHOTO_URL)
with open("inputs/portrait.jpg", "wb") as f:
    f.write(r.content)
print(f"Portrait saved: {os.path.getsize('inputs/portrait.jpg')} bytes")

print("Downloading audio...")
r = requests.get(AUDIO_URL)
with open("inputs/voiceover.mp3", "wb") as f:
    f.write(r.content)
print(f"Audio saved: {os.path.getsize('inputs/voiceover.mp3')} bytes")

print("Converting audio to wav...")
os.system(f"{ffmpeg_path}/ffmpeg -i inputs/voiceover.mp3 inputs/voiceover.wav -y")
print(f"WAV saved: {os.path.getsize('inputs/voiceover.wav')} bytes")

# --- Run EchoMimicV3 Flash inference ---
# Key parameters:
# --num_inference_steps 8  (flash-pro supports 8-step high quality)
# --video_length 81        (reduce if OOM — try 65 or 49)
# --sample_size 512 512    (reduced from 768 to fit P100 16GB)
# --audio_guidance_scale 2.0 (optimal range 1.8-2.0)
# --guidance_scale 5.0     (optimal range 3-6)
# --enable_teacache        (speeds up generation, reduces VRAM)
# --teacache_threshold 0.1 (optimal range 0-0.1)
# --weight_dtype bfloat16  (P100 supports bfloat16)
# --model_name points to the flash transformer weights dir (NOT a separate Wan2.1 download)

print("Running EchoMimicV3 Flash inference...")
cmd = (
    f"python infer_flash.py "
    f"--image_path inputs/portrait.jpg "
    f"--audio_path inputs/voiceover.wav "
    f"--prompt 'A person is speaking naturally, looking at camera.' "
    f"--num_inference_steps 8 "
    f"--config_path config/config.yaml "
    f"--model_name flash "
    f"--transformer_path flash/transformer/diffusion_pytorch_model.safetensors "
    f"--save_path outputs "
    f"--wav2vec_model_dir flash/chinese-wav2vec2-base "
    f"--sampler_name Flow_Unipc "
    f"--video_length 81 "
    f"--guidance_scale 5.0 "
    f"--audio_guidance_scale 2.0 "
    f"--audio_scale 1.0 "
    f"--neg_scale 1.0 "
    f"--neg_steps 0 "
    f"--seed 43 "
    f"--enable_teacache "
    f"--teacache_threshold 0.1 "
    f"--num_skip_start_steps 5 "
    f"--riflex_k 6 "
    f"--ulysses_degree 1 "
    f"--ring_degree 1 "
    f"--weight_dtype bfloat16 "
    f"--sample_size 512 512 "
    f"--fps 25 "
    f"--shift 5.0"
)
print(f"Running: {cmd}")
ret = os.system(cmd)
print(f"EchoMimicV3 exit code: {ret}")

# --- Find output mp4 ---
output_file = None
for root, dirs, files in os.walk("outputs"):
    for f in files:
        if f.endswith(".mp4"):
            output_file = os.path.join(root, f)
            print(f"Found output: {output_file}")
            break
    if output_file:
        break

print("Listing ./outputs/:")
os.system("ls -lh outputs/ 2>/dev/null || echo 'no outputs dir'")

if not output_file or not os.path.exists(output_file):
    patch_supabase({"status": "failed", "error": "EchoMimicV3 produced no output"})
    raise RuntimeError("No output mp4 found")

print(f"Output file: {output_file} ({os.path.getsize(output_file)} bytes)")

print("Uploading to R2...")
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)
r2_key = f"raw/{JOB_ID}_lipsync.mp4"
s3.upload_file(output_file, R2_BUCKET_NAME, r2_key)
r2_url = f"{R2_PUBLIC_URL}/{r2_key}"

patch_supabase({"status": "lipsync_ready", "lipsync_video_url": r2_url})
print(f"Done. Uploaded to {r2_url}")
