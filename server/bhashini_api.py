import os
import base64
import json
import requests
import tempfile

# ——— CONFIG —————————————————————————————————————————————
API_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
AUTH_TOKEN = "DQZg_RBieUwtS0S0etaqWQx3g7oYHGNj-3GFYmw1frvFgHG0BDuUjCVQeLuzHj1T"
# —————————————————————————————————————————————————————————

def wav_to_base64(path):
    """Read a WAV file and return its Base64‑encoded string."""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def bytes_to_base64(audio_bytes):
    """Convert audio bytes to Base64 string."""
    return base64.b64encode(audio_bytes).decode("utf-8")

def build_payload(b64_audio):
    """Return the JSON body for one audio input."""
    return {
        "pipelineTasks": [
            {
                "taskType": "asr",
                "config": {
                    "language": {"sourceLanguage": "en"},
                    "serviceId": "ai4bharat/whisper-medium-en--gpu--t4",
                    "audioFormat": "wav",
                    "samplingRate": 8000
                }
            }
        ],
        "inputData": {
            "audio": [
                {"audioContent": b64_audio}
            ]
        }
    }

def call_pipeline(payload):
    """POST to the API and return the parsed JSON."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": AUTH_TOKEN
    }
    resp = requests.post(API_URL, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()

def extract_transcription(result_json):
    """
    Given the API response as a dict, return the transcription text.
    """
    try:
        for task in result_json.get("pipelineResponse", []):
            if task.get("taskType") == "asr":
                outputs = task.get("output", [])
                if outputs and "source" in outputs[0]:
                    return outputs[0]["source"]
        return ""
    except Exception as e:
        print(f"Error extracting transcription: {e}")
        return ""

def transcribe_audio_file(file_path):
    """
    Transcribe audio from a file path.
    """
    try:
        # Convert file to base64
        b64_audio = wav_to_base64(file_path)
        
        # Build payload
        payload = build_payload(b64_audio)
        
        # Call API
        response = call_pipeline(payload)
        
        # Extract transcription
        transcription = extract_transcription(response)
        
        return {
            "success": True,
            "transcript": transcription,
            "raw_response": response
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "transcript": ""
        }

def transcribe_audio_bytes(audio_bytes):
    """
    Transcribe audio from bytes (for web uploads).
    """
    try:
        # Convert bytes to base64
        b64_audio = bytes_to_base64(audio_bytes)
        
        # Build payload
        payload = build_payload(b64_audio)
        
        # Call API
        response = call_pipeline(payload)
        
        # Extract transcription
        transcription = extract_transcription(response)
        
        return {
            "success": True,
            "transcript": transcription,
            "raw_response": response
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "transcript": ""
        }

def main():
    """Original main function for batch processing."""
    INPUT_DIR = "telephone_speech_uttarakhand\\filtered_calls"
    OUTPUT_FILE = "results.txt"
    
    # Ensure output file is fresh
    with open(OUTPUT_FILE, "w", encoding="utf-8") as outf:
        outf.write("")  

    for fname in os.listdir(INPUT_DIR):
        if not fname.lower().endswith(".wav"):
            continue

        wav_path = os.path.join(INPUT_DIR, fname)
        print(f"Processing {fname}...")

        result = transcribe_audio_file(wav_path)
        
        if result["success"]:
            text = result["transcript"].replace("\n", " ").strip()
            # Append to output file
            with open(OUTPUT_FILE, "a", encoding="utf-8") as outf:
                outf.write(f"{fname} {text}\n")
        else:
            print(f"  ERROR: {result['error']}")

if __name__ == "__main__":
    main()
