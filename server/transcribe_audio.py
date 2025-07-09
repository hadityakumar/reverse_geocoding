import sys
import json
import os
import tempfile
from pathlib import Path

# Add the current directory to Python path to import modules
current_dir = Path(__file__).parent
sys.path.append(str(current_dir))

try:
    from bhashini_api import transcribe_audio_file
    # Try to import pydub for audio conversion
    try:
        from pydub import AudioSegment
        PYDUB_AVAILABLE = True
    except ImportError:
        PYDUB_AVAILABLE = False
        print("Warning: pydub not available. Install with: pip install pydub", file=sys.stderr)
        
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Error importing required modules: {e}"}), file=sys.stderr)
    sys.exit(1)

def convert_to_wav(input_path, output_path):
    """Convert audio file to WAV format using pydub"""
    try:
        if not PYDUB_AVAILABLE:
            # If pydub is not available, try to use the file as-is
            if input_path.lower().endswith('.wav'):
                return input_path
            else:
                raise Exception("pydub is required for audio format conversion. Install with: pip install pydub")
        
        # Load audio file
        audio = AudioSegment.from_file(input_path)
        
        # Convert to WAV with specific parameters for Bhashini API
        audio = audio.set_frame_rate(16000)  # 16kHz sample rate
        audio = audio.set_channels(1)        # Mono
        audio = audio.set_sample_width(2)    # 16-bit
        
        # Export as WAV
        audio.export(output_path, format="wav")
        return output_path
        
    except Exception as e:
        raise Exception(f"Audio conversion failed: {str(e)}")

def get_audio_info(file_path):
    """Get audio file information"""
    try:
        if PYDUB_AVAILABLE:
            audio = AudioSegment.from_file(file_path)
            return {
                "duration": len(audio) / 1000.0,  # Duration in seconds
                "channels": audio.channels,
                "frame_rate": audio.frame_rate,
                "sample_width": audio.sample_width
            }
    except:
        pass
    return {}

def main():
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Audio file path required"}), file=sys.stderr)
        sys.exit(1)
    
    input_audio_path = sys.argv[1]
    
    if not os.path.exists(input_audio_path):
        print(json.dumps({"success": False, "error": "Audio file not found"}), file=sys.stderr)
        sys.exit(1)
    
    try:
        # Get original file info
        audio_info = get_audio_info(input_audio_path)
        
        # Check if conversion is needed
        file_extension = Path(input_audio_path).suffix.lower()
        needs_conversion = file_extension != '.wav'
        
        if needs_conversion:
            # Create temporary WAV file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_wav:
                temp_wav_path = temp_wav.name
            
            try:
                # Convert to WAV
                convert_to_wav(input_audio_path, temp_wav_path)
                audio_file_path = temp_wav_path
                
            except Exception as conv_error:
                # If conversion fails, try using original file
                print(f"Warning: Conversion failed ({conv_error}), trying original file", file=sys.stderr)
                audio_file_path = input_audio_path
                
        else:
            audio_file_path = input_audio_path
        
        # Transcribe the audio file
        result = transcribe_audio_file(audio_file_path)
        
        # Add audio info to result
        if audio_info:
            result['audio_info'] = audio_info
        
        # Clean up temporary file if created
        if needs_conversion and 'temp_wav_path' in locals() and os.path.exists(temp_wav_path):
            try:
                os.unlink(temp_wav_path)
            except:
                pass
        
        # Output the result as JSON
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        # Clean up temporary file if created
        if 'temp_wav_path' in locals() and os.path.exists(temp_wav_path):
            try:
                os.unlink(temp_wav_path)
            except:
                pass
                
        # Output error as JSON
        error_data = {
            "success": False,
            "error": str(e),
            "transcript": ""
        }
        print(json.dumps(error_data), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()