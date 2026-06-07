import os
import sys
import json
import requests
import subprocess

# Must pin these exact versions for P100 (sm_60 Pascal) compatibility:
# - torch 2.6.0+cu126: last build with sm_60 support
# - diffusers 0.31.0: required by Wan2.1
# - transformers 4.44.2: FLAX_WEIGHTS_NAME removed in 4.45+, breaks diffusers 0.31.0
subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "torch==2.6.0+cu126", "torchvision", "torchaudio",
    "--index-url", "https://download.pytorch.org/whl/cu126"
], check=True)

subprocess.run([
    sys.executable, "-m", "pip", "install", "-q",
    "diffusers==0.31.0",
    "transformers==4.44.2",
    "accelerate",
    "boto3",
    "huggingface_hub",
    "Pillow"
], check=True)

import boto3
from huggingface_hub import login

HF_TOKEN = os.environ.get("HF_TOKEN", "")
if HF_TOKEN:
    login(token=HF_TOKEN)

from huggingface_hub import snapshot_download

JOB_ID           = os.environ["JOB_ID"]
SCENES_JSON      = os.environ["SCENES_JSON"]
WAN21_MODE       = os.environ.get("WAN21_MODE", "t2v")  # "t2v" or "i2v"
AVATAR_PHOTO_URL = os.environ.get("AVATAR_PHOTO_URL", "")
SUPABASE_URL     = os.environ["SUPABASE_URL"]
SUPABASE_KEY     = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID        = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME   = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL    = os.environ["R2_PUBLIC_URL"]

scenes = json.loads(SCENES_JSON)

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

# Portrait download removed — T2V-1.3B only, no I2V available at this model size

# Download model weights
# NOTE: Wan2.1-I2V-1.3B does not exist. Only I2V-14B exists (~15GB, exceeds Kaggle disk).
# All modes use T2V-1.3B for testing. Avatar appearance is driven by scene prompts.
import subprocess as sp
print("Cloning Wan2.1 inference code...")
sp.run(["git", "clone", "https://github.com/Wan-Video/Wan2.1.git", "wan2.1"], check=True)
os.chdir("wan2.1")
print("Installing Wan2.1 requirements...")
sp.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
# Uninstall flash_attn — not supported on P100 (sm_60, Pascal).
sp.run([sys.executable, "-m", "pip", "uninstall", "-y", "flash_attn", "flash_attn_interface"], check=False)

# Patch attention.py to use torch SDPA fallback instead of asserting flash_attn is available.
# The cloned repo's attention.py has a hard assert FLASH_ATTN_2_AVAILABLE with no fallback.
attention_patch = """
import torch
import warnings

FLASH_ATTN_3_AVAILABLE = False
FLASH_ATTN_2_AVAILABLE = False

__all__ = ['flash_attention', 'attention']

def flash_attention(q, k, v, q_lens=None, k_lens=None, dropout_p=0., softmax_scale=None,
                    q_scale=None, causal=False, window_size=(-1, -1), deterministic=False,
                    dtype=torch.bfloat16, version=None):
    half_dtypes = (torch.float16, torch.bfloat16)
    assert dtype in half_dtypes
    b, lq, lk, out_dtype = q.size(0), q.size(1), k.size(1), q.dtype
    def half(x):
        return x if x.dtype in half_dtypes else x.to(dtype)
    if q_lens is not None or k_lens is not None:
        warnings.warn('Padding mask is disabled when using scaled_dot_product_attention.')
    q = half(q).transpose(1, 2)
    k = half(k).transpose(1, 2)
    v = half(v).transpose(1, 2)
    if q_scale is not None:
        q = q * q_scale
    out = torch.nn.functional.scaled_dot_product_attention(
        q, k, v, is_causal=causal, dropout_p=dropout_p)
    return out.transpose(1, 2).contiguous().type(out_dtype)

def attention(q, k, v, q_lens=None, k_lens=None, dropout_p=0., softmax_scale=None,
              q_scale=None, causal=False, window_size=(-1, -1), deterministic=False,
              dtype=torch.bfloat16, fa_version=None):
    return flash_attention(q=q, k=k, v=v, q_lens=q_lens, k_lens=k_lens,
                           dropout_p=dropout_p, softmax_scale=softmax_scale,
                           q_scale=q_scale, causal=causal, window_size=window_size,
                           deterministic=deterministic, dtype=dtype, version=fa_version)
"""
with open("wan/modules/attention.py", "w") as f:
    f.write(attention_patch)
print("Patched attention.py with SDPA fallback")

print("Downloading Wan2.1-T2V-1.3B weights...")
snapshot_download("Wan-AI/Wan2.1-T2V-1.3B", local_dir="./Wan2.1-T2V-1.3B")
ckpt_dir = "./Wan2.1-T2V-1.3B"
task_flag = "t2v-1.3B"

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)

for i, scene in enumerate(scenes):
    print(f"Generating clip {i+1}/6 [{WAN21_MODE}]: {scene[:60]}...")
    output_file = f"clip_{i}.mp4"

    cmd = (
        f'PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True '
        f'python generate.py '
        f'--task {task_flag} '
        f'--size 832*480 '
        f'--frame_num 16 '
        f'--ckpt_dir {ckpt_dir} '
        f'--prompt "{scene}" '
        f'--offload_model True '
        f'--t5_cpu '
        f'--save_file {output_file}'
    )

    print(f"Running: {cmd}")
    ret = os.system(cmd)
    print(f"Exit code: {ret}")

    if not os.path.exists(output_file):
        patch_supabase({"status": "failed", "error": f"Clip {i+1} generation failed"})
        raise RuntimeError(f"{output_file} not found")

    r2_key = f"clips/{JOB_ID}/clip_{i}.mp4"
    s3.upload_file(output_file, R2_BUCKET_NAME, r2_key)
    print(f"Uploaded clip_{i}.mp4 → R2")

patch_supabase({"status": "clips_ready"})
print("All clips generated and uploaded.")
