"""
longcat_modal.py — LongCat-Video-Avatar 1.5 lipsync on Modal A10G
Handles Pipeline 3 (avatar + speech): portrait + audio → lipsync video
Triggered by stage3a_modal.js via GitHub Actions
"""

import modal
import os

# ── Persistent volume for weights (LongCat base ~27GB + Avatar-1.5 LoRA) ──
weights_volume = modal.Volume.from_name("reelforge-longcat-weights", create_if_missing=True)
WEIGHTS_DIR = "/weights"
REPO_DIR = "/longcat"

# ── Container image ──
# Flash-attn must be compiled — we pre-build it into the image
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.6.0+cu124",
        "torchvision==0.21.0+cu124",
        "torchaudio==2.6.0",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    # flash-attn: use pre-built wheel to avoid compiling from source (no nvcc at build time)
    .pip_install("ninja", "psutil", "packaging", "wheel")
    .pip_install(
        "https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-cp310-cp310-linux_x86_64.whl"
    )
    .pip_install(
        "huggingface_hub==0.27.0",
        "boto3==1.35.0",
        "requests",
        "supabase",
        "librosa",
        "soundfile",
    )
    .run_commands(
        # Clone LongCat repo
        "git clone --single-branch --branch main https://github.com/meituan-longcat/LongCat-Video /longcat",
        # Install base requirements
        "cd /longcat && pip install -r requirements.txt",
        # Strip system packages (libsndfile1, ffmpeg) from requirements_avatar.txt before pip install
        # These must be installed via apt (done above), not pip
        "grep -viE '^libsndfile|^ffmpeg|^tritonserverclient' /longcat/requirements_avatar.txt > /tmp/req_avatar_clean.txt && pip install -r /tmp/req_avatar_clean.txt",
    )
)

app = modal.App("reelforge-longcat", image=image)


# ── One-time weight download ──
@app.function(
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 120,  # 2 hours — weights are large
    cpu=4,
    memory=16384,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def download_weights():
    """Download LongCat weights to volume. Run this once manually before first job."""
    from huggingface_hub import snapshot_download
    import os

    base_dir = f"{WEIGHTS_DIR}/LongCat-Video"
    avatar_dir = f"{WEIGHTS_DIR}/LongCat-Video-Avatar-1.5"

    if not os.path.exists(base_dir):
        print("Downloading LongCat-Video base weights (~27GB)...")
        snapshot_download(
            repo_id="meituan-longcat/LongCat-Video",
            local_dir=base_dir,
            token=os.environ.get("HF_TOKEN"),
        )
        print("Base weights done.")
    else:
        print("Base weights already present.")

    if not os.path.exists(avatar_dir):
        print("Downloading LongCat-Video-Avatar-1.5 weights...")
        snapshot_download(
            repo_id="meituan-longcat/LongCat-Video-Avatar-1.5",
            local_dir=avatar_dir,
            token=os.environ.get("HF_TOKEN"),
        )
        print("Avatar-1.5 weights done.")
    else:
        print("Avatar-1.5 weights already present.")

    weights_volume.commit()
    print("All weights committed to volume.")


# ── Main lipsync function ──
@app.function(
    gpu="A10G",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 30,  # 30 min max
    memory=32768,
    cpu=4,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def run_lipsync(
    job_id: str,
    portrait_url: str,
    audio_url: str,
    prompt: str,
):
    """
    Run LongCat Avatar 1.5 lipsync.
    portrait_url: R2 URL of the avatar portrait image
    audio_url: R2 URL of the TTS audio .wav file
    Returns the R2 public URL of the lipsync video.
    """
    import torch
    import boto3
    import requests
    import tempfile
    import json
    import subprocess
    import os
    from pathlib import Path

    print(f"[LongCat] job={job_id}")
    print(f"[LongCat] GPU: {torch.cuda.get_device_name(0)}")
    print(f"[LongCat] VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")

    workdir = tempfile.mkdtemp()

    # ── Download portrait ──
    print("[LongCat] Downloading portrait...")
    portrait_path = os.path.join(workdir, "portrait.jpg")
    r = requests.get(portrait_url, timeout=30)
    r.raise_for_status()
    with open(portrait_path, "wb") as f:
        f.write(r.content)

    # ── Download audio ──
    print("[LongCat] Downloading audio...")
    audio_path = os.path.join(workdir, "audio.wav")
    r = requests.get(audio_url, timeout=30)
    r.raise_for_status()
    with open(audio_path, "wb") as f:
        f.write(r.content)

    # ── Build input JSON ──
    input_json = {
        "image": portrait_path,
        "audio": audio_path,
        "prompt": prompt,
    }
    input_json_path = os.path.join(workdir, "input.json")
    with open(input_json_path, "w") as f:
        json.dump(input_json, f)

    # ── Output path ──
    output_path = os.path.join(workdir, "lipsync.mp4")

    # ── Run LongCat inference ──
    # Single GPU: nproc_per_node=1, context_parallel_size=1
    # --use_distill required for v1.5
    # --use_int8 reduces VRAM usage (fits A10G 24GB)
    cmd = [
        "torchrun",
        "--nproc_per_node=1",
        f"{REPO_DIR}/run_demo_avatar_single_audio_to_video.py",
        "--context_parallel_size=1",
        f"--checkpoint_dir={WEIGHTS_DIR}/LongCat-Video-Avatar-1.5",
        "--stage_1=ai2v",       # audio + image → video
        f"--input_json={input_json_path}",
        "--use_distill",        # required for v1.5
        "--model_type=avatar-v1.5",
        "--use_int8",           # reduces VRAM, supported on v1.5 only
        f"--output_path={output_path}",
    ]

    print(f"[LongCat] Running: {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=REPO_DIR,
        capture_output=False,
        text=True,
        env={**os.environ, "PYTHONPATH": REPO_DIR},
    )

    if result.returncode != 0:
        raise RuntimeError(f"LongCat inference failed with exit code {result.returncode}")

    if not os.path.exists(output_path):
        raise FileNotFoundError(f"Expected output not found at {output_path}")

    print(f"[LongCat] Inference done. Output: {output_path}")

    # ── Upload to R2 ──
    r2_key = f"jobs/{job_id}/lipsync/lipsync.mp4"
    r2_client = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    print(f"[LongCat] Uploading to R2: {r2_key}")
    with open(output_path, "rb") as f:
        r2_client.upload_fileobj(f, os.environ["R2_BUCKET_NAME"], r2_key)

    lipsync_url = f"{os.environ['R2_PUBLIC_URL']}/{r2_key}"
    print(f"[LongCat] Uploaded: {lipsync_url}")
    return lipsync_url


# ── Entrypoint called from GitHub Actions ──
@app.local_entrypoint()
def main(
    job_id: str,
    portrait_url: str,
    audio_url: str,
    prompt: str,
):
    """
    Called via: modal run longcat_modal.py --job-id X --portrait-url Y --audio-url Z --prompt "..."
    """
    import os
    from supabase import create_client

    print(f"Starting lipsync for job {job_id}")

    supabase = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    supabase.table("jobs").update({"status": "generating_lipsync"}).eq("id", job_id).execute()

    lipsync_url = run_lipsync.remote(
        job_id=job_id,
        portrait_url=portrait_url,
        audio_url=audio_url,
        prompt=prompt,
    )

    supabase.table("jobs").update({
        "status": "lipsync_ready",
        "lipsync_url": lipsync_url,
    }).eq("id", job_id).execute()

    print(f"Lipsync complete: {lipsync_url}")
