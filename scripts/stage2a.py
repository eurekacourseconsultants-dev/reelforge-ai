import os
import json
import boto3
import requests
import numpy as np
import soundfile as sf

JOB_ID = os.environ["JOB_ID"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"]

with open("pipeline_data.json") as f:
    data = json.load(f)

script = data["script"]
print(f"Generating voiceover for script ({len(script)} chars)...")

from kokoro import KPipeline
pipeline = KPipeline(lang_code='a')
generator = pipeline(script, voice='af_heart', speed=1.0)

chunks = []
sample_rate = None
for chunk in generator:
    audio = chunk.audio
    if hasattr(audio, 'numpy'):
        audio = audio.numpy()
    chunks.append(audio)
    if sample_rate is None:
        sample_rate = chunk.sample_rate if hasattr(chunk, 'sample_rate') else 24000

audio_data = np.concatenate(chunks)
sf.write("voiceover.wav", audio_data, sample_rate)

# Convert to mp3
os.system("ffmpeg -i voiceover.wav -b:a 128k voiceover.mp3 -y")

print("Uploading voiceover to R2...")
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
)
r2_key = f"audio/{JOB_ID}.mp3"
s3.upload_file("voiceover.mp3", R2_BUCKET_NAME, r2_key)
audio_url = f"{R2_PUBLIC_URL}/{r2_key}"

# Save audio URL for stage 3a
with open("audio_url.txt", "w") as f:
    f.write(audio_url)

requests.patch(
    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{JOB_ID}",
    headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    },
    json={"status": "voice_ready", "audio_url": audio_url},
)
print(f"Voiceover uploaded: {audio_url}")
