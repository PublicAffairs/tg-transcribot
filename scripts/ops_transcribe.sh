#!/bin/bash

# ops_transcribe.sh
# Category: Operations / Admin Tool
#
# Directly uploads a local audio file to the Groq Whisper API for quick transcription checks,
# bypassing the Telegram webhook flow.
#
# Usage:
#   ./scripts/ops_transcribe.sh <path_to_audio_file>

# Check if file argument is provided
if [ -z "$1" ]; then
    echo "Error: No audio file specified." >&2
    echo "Usage: $0 <path_to_file>" >&2
    exit 1
fi

FILE_PATH="$1"

# Check if file exists
if [ ! -f "$FILE_PATH" ]; then
    echo "Error: File '$FILE_PATH' not found." >&2
    exit 1
fi

# API Key: prioritize WHISPER_API_KEY, fallback to GROQ_API_KEY
API_KEY="${WHISPER_API_KEY:-${GROQ_API_KEY}}"

if [ -z "$API_KEY" ]; then
    echo "Error: Neither WHISPER_API_KEY nor GROQ_API_KEY environment variable is defined." >&2
    exit 1
fi

# Send request to Groq Whisper API via curl
curl -X POST "https://api.groq.com/openai/v1/audio/transcriptions" \
     -H "Authorization: Bearer $API_KEY" \
     -F "file=@$FILE_PATH" \
     -F "model=whisper-large-v3" \
     -F "response_format=text"