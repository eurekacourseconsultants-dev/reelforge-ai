"""
flux_character.py — Generate full-body character reference image via FLUX.1-schnell on Modal
Called by stage1_5_character.py
Writes character_ref_url.txt to the working directory on exit.
"""

import modal
import os

weights_volume = modal.Volume.from_name("reelforge-wan21-weights", create_if_missing=True)
WEIGHTS_DIR = "/weights"

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch==2.6.0+cu124",
        "torchvision==0.21.0+cu124",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    .pip_install(
        "diffusers==0.33.0",
        "transformers==4.47.0",
        "accelerate==1.2.1",
        "huggingface_hub==0.27.0",
        "boto3==1.35.0",
        "Pillow==10.4.0",
        "sentencepiece",
        "requests",
    )
)

app = modal.App("reelforge-flux-character", image=image)


@app.function(
    gpu="A10G",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=60 * 15,
    memory=32768,
    cpu=4,
    secrets=[modal.Secret.from_name("reelforge-secrets")],
)
def generate_character_ref(job_id: str, character_description: str) -> str:
    import torch
    import boto3
    import tempfile
    from diffusers import FluxPipeline
    from huggingface_hub import snapshot_download

    flux_dir = f"{WEIGHTS_DIR}/FLUX.1-schnell"
    if not os.path.exists(flux_dir):
        print("Downloading FLUX.1-schnell weights...")
        snapshot_download(
            repo_id="black-forest-labs/FLUX.1-schnell",
            local_dir=flux_dir,
            token=os.environ.get("HF_TOKEN"),
        )
        weights_volume.commit()

    print(f"Loading FLUX pipeline from {flux_dir}")
    pipe = FluxPipeline.from_pretrained(flux_dir, torch_dtype=torch.bfloat16)
    pipe.enable_sequential_cpu_offload()

    print(f"Generating: {character_description}")
    output = pipe(
        prompt=character_description,
        height=896,
        width=512,
        num_inference_steps=4,
        guidance_scale=0.0,
    )

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        output.images[0].save(f.name, format="JPEG", quality=95)
        tmp_path = f.name

    print(f"Image saved to {tmp_path}")

    r2_key = f"jobs/{job_id}/character_ref.jpg"
    r2_client = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    with open(tmp_path, "rb") as f:
        r2_client.upload_fileobj(
            f, os.environ["R2_BUCKET_NAME"], r2_key,
            ExtraArgs={"ContentType": "image/jpeg"}
        )

    character_ref_url = f"{os.environ['R2_PUBLIC_URL']}/{r2_key}"
    print(f"Uploaded: {character_ref_url}")
    return character_ref_url


@app.local_entrypoint()
def main(job_id: str, desc_file: str):
    with open(desc_file, "r") as f:
        character_description = f.read().strip()

    print(f"Generating character ref for job {job_id}")
    character_ref_url = generate_character_ref.remote(job_id, character_description)

    # Write URL to file so stage1_5_character.py can read it
    with open("character_ref_url.txt", "w") as f:
        f.write(character_ref_url)

    print(f"character_ref_url={character_ref_url}")
