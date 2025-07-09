import sys
import json
import os
from pathlib import Path

# Add the current directory to Python path to import your modules
current_dir = Path(__file__).parent
sys.path.append(str(current_dir))

try:
    from text_processor import TextProcessor
except ImportError as e:
    print(f"Error importing TextProcessor: {e}", file=sys.stderr)
    sys.exit(1)

def main():
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        text = input_data.get('text', '')
        
        if not text:
            raise ValueError("No text provided")
        
        # Initialize the text processor
        processor = TextProcessor()
        
        # Process the text
        result = processor.process_text(text, file_name="web_input.txt")
        
        # Convert to dictionary for JSON serialization
        result_dict = result.model_dump()
        
        # Output the result as JSON
        print(json.dumps(result_dict, default=str, ensure_ascii=False))
        
    except Exception as e:
        # Output error as JSON to stderr
        error_data = {
            "error": str(e),
            "type": type(e).__name__
        }
        print(json.dumps(error_data), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()