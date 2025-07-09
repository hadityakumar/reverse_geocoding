const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 5002;

const STATE = "Uttarakhand"


const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Function to call Python LLM processor
function callPythonProcessor(text) {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, 'llm_processor.py');
    
    // Spawn Python process
    const pythonProcess = spawn('python', [pythonScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    // Send input text to Python script
    pythonProcess.stdin.write(JSON.stringify({ text: text }));
    pythonProcess.stdin.end();

    // Collect output
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', errorOutput);
        reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
        return;
      }

      try {
        const result = JSON.parse(output.trim());
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse Python output:', output);
        reject(new Error('Failed to parse Python script output'));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python script: ${error.message}`));
    });
  });
}

// Function to call Bhashini API for transcription
function callBhashiniTranscription(audioFilePath) {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, 'transcribe_audio.py');
    
    // Spawn Python process
    const pythonProcess = spawn('python', [pythonScriptPath, audioFilePath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    // Collect output
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Transcription script error:', errorOutput);
        reject(new Error(`Transcription script exited with code ${code}: ${errorOutput}`));
        return;
      }

      try {
        const result = JSON.parse(output.trim());
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse transcription output:', output);
        reject(new Error('Failed to parse transcription script output'));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start transcription script: ${error.message}`));
    });
  });
}

// Function to extract and format location from processed JSON
function formatLocationString(processedData) {
  try {
    const incidentLocation = processedData.incident_location || '';
    const area = processedData.area || '';
    
    // Clean and format the location components
    const cleanIncidentLocation = incidentLocation !== 'not specified' ? incidentLocation.trim() : '';
    const cleanArea = area !== 'not specified' ? area.trim() : '';
    
    // Build location string
    let locationParts = [];
    
    if (cleanIncidentLocation) {
      locationParts.push(cleanIncidentLocation);
    }
    
    // Check if area is already included in incident_location (case insensitive)
    if (cleanArea && cleanIncidentLocation) {
      const incidentLower = cleanIncidentLocation.toLowerCase();
      const areaLower = cleanArea.toLowerCase();
      
      // Only add area if it's not already included in incident_location
      if (!incidentLower.includes(areaLower)) {
        locationParts.push(cleanArea);
      }
    } else if (cleanArea) {
      locationParts.push(cleanArea);
    }
    
    // Always append Uttarakhand
    locationParts.push(STATE);
    
    // Join with commas and clean up
    const locationString = locationParts
      .filter(part => part.length > 0)
      .join(', ')
      .replace(/,+/g, ',') // Remove multiple consecutive commas
      .replace(/^,|,$/g, '') // Remove leading/trailing commas
      .trim();
    
    return locationString || STATE;
  } catch (error) {
    console.error('Error formatting location:', error);
    return STATE;
  }
}

// Routes
app.post('/extract-location', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request. Text is required.' 
      });
    }

    console.log('Processing text with LLM...');
    
    // Call Python LLM processor
    const processedData = await callPythonProcessor(text);
    
    console.log('LLM processing complete:', processedData);
    
    // Extract and format location
    const locationString = formatLocationString(processedData);
    
    console.log('Formatted location:', locationString);
    
    // Send response
    res.json({ 
      location: locationString,
      success: true,
      rawData: processedData, // Include raw processed data for debugging
      extractedFields: {
        incident_location: processedData.incident_location || 'not specified',
        area: processedData.area || 'not specified'
      }
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to process the text.',
      success: false
    });
  }
});

// New route for audio transcription
app.post('/transcribe-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided'
      });
    }

    console.log('Received audio file:', req.file.originalname, 'Size:', req.file.size);
    
    // Call Bhashini API for transcription
    const transcriptionResult = await callBhashiniTranscription(req.file.path);
    
    // Clean up uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting uploaded file:', err);
    });
    
    if (transcriptionResult.success) {
      res.json({
        success: true,
        transcript: transcriptionResult.transcript,
        message: 'Audio transcribed successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: transcriptionResult.error,
        transcript: ''
      });
    }
    
  } catch (error) {
    console.error('Error transcribing audio:', error);
    
    // Clean up uploaded file in case of error
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting uploaded file:', err);
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to transcribe audio'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    llmEnabled: true,
    transcriptionEnabled: true
  });
});

// Test endpoint to verify Python integration
app.post('/test-llm', async (req, res) => {
  try {
    const testText = "Hello, there was an accident near Dehradun railway station in Uttarakhand.";
    const result = await callPythonProcessor(testText);
    res.json({
      success: true,
      testText: testText,
      result: result,
      formattedLocation: formatLocationString(result)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Enhanced location extraction server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Test LLM: http://localhost:${PORT}/test-llm`);
  console.log(`Audio transcription: http://localhost:${PORT}/transcribe-audio`);
});
