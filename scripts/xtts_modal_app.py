import modal

app = modal.App("xtts-voice-clone")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "TTS==0.22.0",
        "torch==2.1.1",
        "torchaudio==2.1.1",
        "transformers==4.40.2",
    )
    .env({"COQUI_TOS_AGREED": "1"})
)

@app.function(
    image=image,
    gpu="A10G",
    timeout=600,
)
def clone_voice(reference_audio_bytes: bytes, text: str, language: str = "en") -> bytes:
    import tempfile
    import os
    from TTS.api import TTS

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as ref_file:
        ref_file.write(reference_audio_bytes)
        ref_path = ref_file.name

    out_path = ref_path.replace(".mp3", "_out.wav")

    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")
    tts.tts_to_file(
        text=text,
        speaker_wav=ref_path,
        language=language,
        file_path=out_path,
    )

    with open(out_path, "rb") as f:
        result = f.read()

    os.remove(ref_path)
    os.remove(out_path)
    return result


@app.local_entrypoint()
def main(reference_path: str, text: str, output_path: str = "/tmp/cloned_output.wav"):
    with open(reference_path, "rb") as f:
        ref_bytes = f.read()

    result = clone_voice.remote(ref_bytes, text)

    with open(output_path, "wb") as f:
        f.write(result)

    print(f"Saved cloned audio to {output_path}")
