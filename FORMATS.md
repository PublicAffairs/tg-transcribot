# FORMATS: Supported Audio Formats and AAC Processing 🎵⚙️

The Whisper API (specifically Groq's Speech-to-Text service) natively supports a specific set of audio file formats. However, Telegram voice messages and audio files are often delivered in formats like raw ADTS-AAC streams, Apple CAF, or raw AMR/GSM bitstreams, which are not natively supported and must be processed or re-wrapped.

## 1. Supported Formats

### 1.1. Natively Supported Formats

According to the official [Groq Speech-to-Text Documentation](https://console.groq.com/docs/speech-to-text#working-with-audio-files), the natively supported audio formats are:
* **flac**
* **mp3**
* **mp4**
* **mpeg**
* **mpga**
* **m4a** (standard container formats containing AAC or ALAC)
* **ogg**
* **wav**
* **webm**

Additionally, files must be within size limits (typically **25 MB** for the Groq free tier) and have a valid audio track.

### 1.2. Non-Native Formats (Supported via WAV Container Wrapping)

To support non-native and raw audio streams without introducing heavy dependencies like FFmpeg or WebAssembly, the bot implements a pure-JS containerization strategy. These formats are detected, wrapped on-the-fly into a standard WAV container, and transmitted to the Whisper API as `audio/wav`:
* **aac** (raw ADTS-AAC streams, often sent by Telegram or renamed as `.m4a`)
* **caf** (Apple Core Audio Format containing AAC payload, typical for Telegram voice messages on iOS)
* **amr** (AMR-NB, Adaptive Multi-Rate Narrowband)
* **awb** (AMR-WB, Adaptive Multi-Rate Wideband)
* **gsm** (GSM 06.10 Full Rate raw files)
* **al** / **alaw** (A-Law raw PCM audio)
* **ul** / **ulaw** / **mulaw** (Mu-Law/u-Law raw PCM audio)

This allows the bot to seamlessly process and transcribe Telegram's native voice formats without losing audio quality or requiring resource-heavy re-encoding.

---

## 2. Format Validation & Rejection

### 2.1. Early Extension Validation & MIME Mapping

In the Telegram bot implementation, supported formats are verified and mapped in two stages to handle edge cases where Telegram metadata is generic or missing:

1. **Document Regex Matching (Early Gating)**:
   When files are sent as documents (rather than voice/audio messages), Telegram often labels them with a generic MIME type like `application/octet-stream`. To ensure these are not falsely rejected, the bot matches the file name extension against a supported media regex:
   `/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|oga|flac|amr|awb|gsm|caf|aac|al|alaw|ul|ulaw|mulaw)$/i`
   This allows `.flac` and other natively supported formats, as well as convertible formats like `.amr` or `.caf`, to bypass prefix-based MIME requirements (`audio/` or `video/`).

2. **MIME Mapping for the Whisper API**:
   The Whisper API requires a correct `Content-Type` header (e.g. `audio/flac`, `audio/wav`, `audio/mpeg`) in the multipart form upload. If the file is uploaded with an incorrect or generic MIME type (such as the default `audio/ogg`), the API will fail to decode it.
   The bot parses the file extension and maps it to the precise MIME type:
   * `.flac` -> `audio/flac`
   * `.mp3` -> `audio/mpeg`
   * `.m4a` / `.mp4` -> `audio/mp4`
   * `.webm` -> `audio/webm`
   * `.wav` -> `audio/wav`

3. **Media Format and MIME Validation**
   * When implementing file or media validation logic, never reject a file solely because it has a generic, binary, or empty MIME type (such as `application/octet-stream` or `application/x-zip-compressed`) if its file extension is in the supported formats list.
   * Only reject unsupported formats by explicitly targeting known unsupported MIME types (e.g. `video/quicktime`) or known unsupported file extensions (e.g. `.mov`, `.mkv`).
   * Always verify that files with generic MIME types but valid extensions (like `audio.webm` or `music.flac` sent as generic documents) are allowed to proceed to downstream processing.

### 2.2. Unsupported Video Formats Rejection

Since the bot runs in a serverless environment without heavy media utilities (such as FFmpeg), parsing and extracting audio from heavy, unsupported video containers like **MOV**, **MKV**, or **AVI** is not feasible.

To prevent unnecessary resource usage, timeouts, and API errors, the bot automatically rejects these formats during the validation step:
* Supported video formats: **MP4** and **WebM** (which Whisper supports natively for audio extraction).
* Rejected video formats: **MOV**, **MKV**, **AVI**, **3gp**, **flv**, **wmv**, **m4v**, etc.
* When an unsupported video is received, the bot responds with a localized error message explaining the supported video formats.

---

## 3. Format Detection & Processing

### 3.1. Format Detection (Magic Bytes)

The bot inspects the first bytes of the downloaded stream to detect the exact audio codec:
* **AMR-NB**: Starts with `#!AMR\n` (`0x23, 0x21, 0x41, 0x4D, 0x52, 0x0A`).
* **AMR-WB**: Starts with `#!AMR-WB\n` (`0x23, 0x21, 0x41, 0x4D, 0x52, 0x2D, 0x57, 0x42, 0x0A`).
* **Apple CAF**: Starts with `'caff'` (`0x63, 0x61, 0x66, 0x66`).
* **ADTS-AAC**: Starts with the 12-bit sync-word `1111 1111 1111` (`0xFFF`), so `buffer[0] === 0xFF` and `(buffer[1] & 0xF0) === 0xF0`.

### 3.2. WAV Container Wrapping

Instead of transmuxing to M4A, the bot generates a lightweight, 46-byte RIFF-WAV header on-the-fly and prepends it to the raw stream. 

#### ADTS-AAC & CAF Wrapping (tag `0x1600`)
For raw ADTS-AAC buffers:
1. The ADTS header is parsed to extract the sampling rate and channel count.
2. A 46-byte WAV header is built using:
   - `wFormatTag` = `0x1600`
   - `cbSize` = `0`
3. The WAV header is concatenated with the raw ADTS-AAC buffer.

For Apple CAF files:
1. The file structure is parsed (extracting `'desc'`, `'pakt'`, and `'data'` chunks).
2. The raw AAC frames are extracted.
3. A 7-byte ADTS header is generated for each raw AAC frame.
4. The generated ADTS frames are concatenated and wrapped in the `0x1600` WAV container.

#### AMR, GSM & log-PCM Wrapping
For raw bitstreams, the bot prepends a WAV header using the registered codec tags:
* **AMR-NB**: Tag `0x0057`, sample rate 8000 Hz, 1 channel. Standalone AMR file header (`#!AMR\n`) is stripped before wrapping.
* **AMR-WB**: Tag `0x0058`, sample rate 16000 Hz, 1 channel. Standalone AWB file header (`#!AMR-WB\n`) is stripped.
* **GSM 6.10**: Tag `0x0031`, sample rate 8000 Hz, 1 channel, block alignment 65 bytes, `wSamplesPerBlock` = 320.
* **A-Law / U-Law**: Tags `0x0006` / `0x0007`, sample rate 8000 Hz, 1 channel.

---

## 4. Webhook Integration Flow

When a file is received:
1. **Range Check (for unknown/non-native formats > 5 MB)**:
   - Perform a partial HTTP request (`Range: bytes=0-63`) using fetch stream cancellation.
   - Run format detection on the first bytes.
   - If the format is unknown or unsupported, immediately abort processing and reply with a friendly format error to save network/RAM resources.
2. **Download & Process**:
   - If valid, download the rest of the file.
   - Wrap the audio stream in a WAV container.
   - Set the MIME type to `audio/wav`.
3. **Transcribe**:
   - Send the constructed WAV buffer to the Groq Whisper API.
