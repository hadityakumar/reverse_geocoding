'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { GoogleMap, LoadScript } from '@react-google-maps/api'

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

const libraries = ['places']

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
}

const center = {
  lat: 40.7128,
  lng: -74.0060
}

export default function Home() {
  const [map, setMap] = useState(null)
  const [searchValue, setSearchValue] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [transcriptText, setTranscriptText] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionStatus, setExtractionStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [currentMarker, setCurrentMarker] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState('')
  const [audioBlob, setAudioBlob] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  
  const autocompleteServiceRef = useRef(null)
  const placesServiceRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const fileInputRef = useRef(null)

  const debouncedSearchValue = useDebounce(searchValue, 500)

  const onLoad = useCallback((map) => {
    setMap(map)
    // Initialize Places services
    if (window.google && window.google.maps && window.google.maps.places) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService()
      placesServiceRef.current = new window.google.maps.places.PlacesService(map)
    }
  }, [])

  const onUnmount = useCallback(() => {
    setMap(null)
    autocompleteServiceRef.current = null
    placesServiceRef.current = null
  }, [])

  // Function to navigate to a place
  const navigateToPlace = (suggestion) => {
    if (placesServiceRef.current) {
      const request = {
        placeId: suggestion.place_id,
        fields: ['geometry', 'formatted_address', 'name']
      }
      
      placesServiceRef.current.getDetails(request, (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place && place.geometry) {
          const location = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
          }
          
          if (map) {
            map.panTo(location)
            map.setZoom(15)
            
            // Remove previous marker
            if (currentMarker) {
              currentMarker.setMap(null)
            }
            
            // Add new marker
            const marker = new window.google.maps.Marker({
              position: location,
              map: map,
              title: place.name || place.formatted_address
            })
            
            setCurrentMarker(marker)
          }
        }
      })
    }
  }

  // Dynamic search effect
  useEffect(() => {
    const searchPlaces = async () => {
      if (!debouncedSearchValue.trim() || debouncedSearchValue.length < 2) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      if (!autocompleteServiceRef.current) {
        console.warn('AutocompleteService not available')
        return
      }

      setIsSearching(true)

      try {
        const request = {
          input: debouncedSearchValue,
          types: ['establishment', 'geocode'],
          fields: ['place_id', 'formatted_address', 'name', 'geometry']
        }

        autocompleteServiceRef.current.getPlacePredictions(request, (predictions, status) => {
          setIsSearching(false)
          
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            const limitedSuggestions = predictions.slice(0, 5) // Limit to 5 suggestions
            setSuggestions(limitedSuggestions)
            setShowSuggestions(true)
            
            // Automatically navigate to the first suggestion
            if (limitedSuggestions.length > 0) {
              navigateToPlace(limitedSuggestions[0])
            }
          } else {
            setSuggestions([])
            setShowSuggestions(false)
          }
        })
      } catch (error) {
        console.error('Error searching places:', error)
        setIsSearching(false)
        setSuggestions([])
        setShowSuggestions(false)
      }
    }

    searchPlaces()
  }, [debouncedSearchValue])

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg'
    ]
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }
    
    return '' // Browser will use default
  }

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000, // Changed to 16kHz for better compatibility
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })
      
      const mimeType = getSupportedMimeType()
      console.log('Using MIME type:', mimeType || 'default')
      
      const options = mimeType ? { mimeType } : {}
      mediaRecorderRef.current = new MediaRecorder(stream, options)
      
      audioChunksRef.current = []
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current.mimeType || 'audio/webm'
        })
        setAudioBlob(audioBlob)
        transcribeAudio(audioBlob)
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingStatus('Recording... Click stop when finished')
      
    } catch (error) {
      console.error('Error starting recording:', error)
      setRecordingStatus('Error: Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingStatus('Processing recording...')
    }
  }

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      // Accept more audio formats, not just WAV
      const allowedTypes = ['wav', 'mp3', 'ogg', 'webm', 'm4a', 'aac']
      const fileExtension = file.name.toLowerCase().split('.').pop()
      
      if (!allowedTypes.includes(fileExtension)) {
        setRecordingStatus('Error: Please upload an audio file (WAV, MP3, OGG, WebM, M4A, AAC)')
        return
      }
      
      // Check file size (25MB limit - increased for various audio formats)
      if (file.size > 25 * 1024 * 1024) {
        setRecordingStatus('Error: File size too large. Maximum 25MB allowed.')
        return
      }
      
      setRecordingStatus(`Uploading ${file.name}...`)
      transcribeUploadedFile(file)
    }
  }

  const transcribeUploadedFile = async (file) => {
    setIsTranscribing(true)
    setIsUploading(true)
    setRecordingStatus('Uploading and transcribing audio file...')
    
    try {
      const formData = new FormData()
      formData.append('audio', file)
      
      const response = await fetch('http://localhost:5002/transcribe-audio', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success && data.transcript) {
        setTranscriptText(data.transcript)
        setRecordingStatus(`File transcription completed! ${data.transcript.length} characters transcribed.`)
      } else {
        setRecordingStatus(`Error: ${data.error || 'Could not transcribe uploaded file'}`)
      }
      
    } catch (error) {
      console.error('Error transcribing uploaded file:', error)
      setRecordingStatus('Error: Failed to transcribe uploaded file. Check if server is running.')
    } finally {
      setIsTranscribing(false)
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true)
    setRecordingStatus('Transcribing audio with Bhashini API...')
    
    try {
      const formData = new FormData()
      // Get file extension based on MIME type
      const mimeType = audioBlob.type || 'audio/webm'
      let extension = 'webm'
      
      if (mimeType.includes('webm')) extension = 'webm'
      else if (mimeType.includes('ogg')) extension = 'ogg'
      else if (mimeType.includes('mp4')) extension = 'm4a'
      else if (mimeType.includes('mpeg')) extension = 'mp3'
      
      formData.append('audio', audioBlob, `recording.${extension}`)
      
      const response = await fetch('http://localhost:5002/transcribe-audio', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success && data.transcript) {
        setTranscriptText(data.transcript)
        setRecordingStatus(`Transcription completed! ${data.transcript.length} characters transcribed.`)
      } else {
        setRecordingStatus(`Error: ${data.error || 'Could not transcribe audio'}`)
      }
      
    } catch (error) {
      console.error('Error transcribing audio:', error)
      setRecordingStatus('Error: Failed to transcribe audio. Check if server is running.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    setSearchValue(suggestion.description)
    setShowSuggestions(false)
    navigateToPlace(suggestion)
  }

  const handleSearchInputChange = (e) => {
    setSearchValue(e.target.value)
    if (e.target.value.trim() === '') {
      setSuggestions([])
      setShowSuggestions(false)
      // Remove marker when search is cleared
      if (currentMarker) {
        currentMarker.setMap(null)
        setCurrentMarker(null)
      }
    }
  }

  const extractLocation = async () => {
    if (!transcriptText.trim()) {
      setExtractionStatus('Please enter some text to extract location from.')
      return
    }

    setIsExtracting(true)
    setExtractionStatus('Processing transcript with AI...')

    try {
      const response = await fetch('http://localhost:5002/extract-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: transcriptText
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.location && data.success) {
        setSearchValue(data.location)
        setExtractionStatus(`Location extracted: ${data.location}`)
        
        // Log the extracted fields for debugging
        console.log('Extracted fields:', data.extractedFields)
        console.log('Raw LLM data:', data.rawData)
        
        // Use Google Geocoding to get coordinates and zoom to location
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({ address: data.location }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const location = {
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng()
            }
            
            if (map) {
              map.panTo(location)
              map.setZoom(15)
              
              // Remove previous marker
              if (currentMarker) {
                currentMarker.setMap(null)
              }
              
              // Add new marker
              const marker = new window.google.maps.Marker({
                position: location,
                map: map,
                title: data.location
              })
              
              setCurrentMarker(marker)
            }
          } else {
            setExtractionStatus('Location found but could not geocode: ' + data.location)
          }
        })
      } else {
        setExtractionStatus(data.message || 'No location found in the transcript.')
      }
    } catch (error) {
      console.error('Error extracting location:', error)
      setExtractionStatus('Error connecting to AI service. Please check if your server is running on localhost:5002.')
    } finally {
      setIsExtracting(false)
    }
  }

  const handleTranscriptChange = (e) => {
    setTranscriptText(e.target.value)
    if (extractionStatus) {
      setExtractionStatus('')
    }
  }

  return (
    <LoadScript
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      libraries={libraries}
    >
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          zoom={10}
          center={center}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          }}
        />

        {/* Dynamic Search Box - Top Right */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          backgroundColor: 'white',
          color: '#1f2937',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          padding: '8px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          width: '350px'
        }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Start typing to search for a location..."
              value={searchValue}
              onChange={handleSearchInputChange}
              style={{
                width: '100%',
                padding: '12px 16px',
                paddingRight: isSearching ? '40px' : '16px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6'
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                if (suggestions.length > 0) {
                  setShowSuggestions(true)
                }
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e2e8f0'
                e.target.style.boxShadow = 'none'
                // Delay hiding suggestions to allow clicking
                setTimeout(() => setShowSuggestions(false), 200)
              }}
            />
            
            {/* Loading indicator */}
            {isSearching && (
              <div style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                border: '2px solid #e2e8f0',
                borderTop: '2px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            
            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                right: '0',
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                marginTop: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 1001
              }}>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.place_id}
                    onClick={() => handleSuggestionClick(suggestion)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: index < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                      fontSize: '14px',
                      transition: 'background-color 0.2s',
                      backgroundColor: index === 0 ? '#f8fafc' : 'white' // Highlight first suggestion
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#f8fafc'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = index === 0 ? '#f8fafc' : 'white'
                    }}
                  >
                    <div style={{ fontWeight: '500', color: '#1f2937' }}>
                      {suggestion.structured_formatting?.main_text || suggestion.description}
                      {index === 0 && <span style={{ color: '#3b82f6', fontSize: '12px', marginLeft: '8px' }}>(Auto-selected)</span>}
                    </div>
                    {suggestion.structured_formatting?.secondary_text && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {suggestion.structured_formatting.secondary_text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Text Input Panel - Bottom Left */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
          padding: '24px',
          width: '450px',
          maxHeight: '500px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#1f2937'
          }}>
            Call Recording Transcript
          </h3>
          
          {/* Voice Recording Controls */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || isUploading}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  backgroundColor: isRecording ? '#dc2626' : (isTranscribing || isUploading ? '#9ca3af' : '#059669'),
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: isTranscribing || isUploading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {isRecording ? (
                  <>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      backgroundColor: 'white',
                      borderRadius: '2px'
                    }} />
                    Stop
                  </>
                ) : isTranscribing ? (
                  <>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid transparent',
                      borderTop: '2px solid white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Processing...
                  </>
                ) : (
                  <>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: 'white',
                      borderRadius: '50%'
                    }} />
                    Record
                  </>
                )}
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isTranscribing || isUploading || isRecording}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  backgroundColor: isTranscribing || isUploading || isRecording ? '#9ca3af' : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: isTranscribing || isUploading || isRecording ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                onMouseOver={(e) => {
                  if (!isTranscribing && !isUploading && !isRecording) {
                    e.target.style.backgroundColor = '#6d28d9'
                  }
                }}
                onMouseOut={(e) => {
                  if (!isTranscribing && !isUploading && !isRecording) {
                    e.target.style.backgroundColor = '#7c3aed'
                  }
                }}
              >
                {isUploading ? (
                  <>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid transparent',
                      borderTop: '2px solid white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7,10 12,15 17,10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Upload Audio
                  </>
                )}
              </button>
              
              {/* Hidden file input - Updated to accept more audio formats */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.ogg,.webm,.m4a,.aac,audio/*"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </div>
            
            {recordingStatus && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: recordingStatus.includes('Error') ? '#fef2f2' : 
                               recordingStatus.includes('Recording') ? '#fef3c7' : 
                               recordingStatus.includes('Uploading') ? '#f3e8ff' : '#f0f9ff',
                color: recordingStatus.includes('Error') ? '#dc2626' : 
                       recordingStatus.includes('Recording') ? '#d97706' : 
                       recordingStatus.includes('Uploading') ? '#7c3aed' : '#0369a1',
                borderRadius: '6px',
                fontSize: '12px',
                border: `1px solid ${recordingStatus.includes('Error') ? '#fecaca' : 
                                   recordingStatus.includes('Recording') ? '#fed7aa' : 
                                   recordingStatus.includes('Uploading') ? '#e9d5ff' : '#bae6fd'}`
              }}>
                {recordingStatus}
              </div>
            )}
          </div>
          
          <textarea
            value={transcriptText}
            onChange={handleTranscriptChange}
            placeholder="Paste your call recording transcript here, record using the button above, or upload an audio file..."
            style={{
              width: '100%',
              height: '150px',
              padding: '12px',
              border: '1px solid #e2e8f0',
              color: '#1f2937',
              borderRadius: '8px',
              fontSize: '14px',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#3b82f6'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e2e8f0'
            }}
          />
          
          <button
            onClick={extractLocation}
            disabled={isExtracting || !transcriptText.trim()}
            style={{
              width: '100%',
              marginTop: '16px',
              padding: '12px 24px',
              backgroundColor: isExtracting || !transcriptText.trim() ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isExtracting || !transcriptText.trim() ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              if (!isExtracting && transcriptText.trim()) {
                e.target.style.backgroundColor = '#2563eb'
              }
            }}
            onMouseOut={(e) => {
              if (!isExtracting && transcriptText.trim()) {
                e.target.style.backgroundColor = '#3b82f6'
              }
            }}
          >
            {isExtracting ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid transparent',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Processing...
              </>
            ) : (
              'Extract Location'
            )}
          </button>
          
          {extractionStatus && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              backgroundColor: extractionStatus.includes('Error') ? '#fef2f2' : '#f0f9ff',
              color: extractionStatus.includes('Error') ? '#dc2626' : '#0369a1',
              borderRadius: '6px',
              fontSize: '13px',
              border: `1px solid ${extractionStatus.includes('Error') ? '#fecaca' : '#bae6fd'}`
            }}>
              {extractionStatus}
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </LoadScript>
  )
}
