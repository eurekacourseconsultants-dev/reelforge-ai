"""
stage1_5_character.py — Generate full-body character reference image via FLUX on Modal
Runs only when has_character=true and no avatar is selected.
Uploads reference image to R2, saves character_ref_url to Supabase and pipeline_data.json.
Falls back gracefully if generation fails — pipeline continues without character ref.
"""

import os
import json
import requests
import tempfile
import subprocess
import sys

SUPABASE_URL        = os.environ["SUPABASE_URL"]
SUPABASE_KEY        = os.environ["SUPABASE_KEY"]
JOB_ID              = os.environ["JOB_ID"]
R2_ACCOUNT_ID       = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID    = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME      = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL       = os.environ["R2_PUBLIC_URL"]

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

def main():
    with open("pipeline_data.json", "r") as f:
        pipeline_data = json.load(f)

    has_character = pipeline_data.get("has_character", False)
    character_description = pipeline_data.get("character_description", "")

    if not has_character or not character_description:
        print("[stage1_5] No character detected — skipping.")
        return

    print(f"[stage1_5] Generating character reference via Modal FLUX...")
    print(f"[stage1_5] Prompt: {character_description}")

    try:
        # Write description to file to avoid shell quoting issues
        with open("character_desc.txt", "w") as f:
            f.write(character_description)

        result = subprocess.run(
            [
                "modal", "run",
                "modal-scripts/flux_character.py",
                "--job-id", JOB_ID,
                "--desc-file", "character_desc.txt",
            ],
            capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            print(f"[stage1_5] Modal FLUX failed:\n{result.stderr}")
            print("[stage1_5] Continuing without character ref — pipeline will use T2V for all clips.")
            return

        print(result.stdout)

        # Modal script writes character_ref_url to character_ref_url.txt
        if os.path.exists("character_ref_url.txt"):
            with open("character_ref_url.txt", "r") as f:
                character_ref_url = f.read().strip()

            pipeline_data["character_ref_url"] = character_ref_url
            with open("pipeline_data.json", "w") as f:
                json.dump(pipeline_data, f)

            patch_supabase({"character_ref_url": character_ref_url})
            print(f"[stage1_5] Done. character_ref_url={character_ref_url}")
        else:
            print("[stage1_5] No character_ref_url.txt written — continuing without ref.")

    except Exception as e:
        print(f"[stage1_5] Error: {e}")
        print("[stage1_5] Continuing without character ref.")

if __name__ == "__main__":
    main()
