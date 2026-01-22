# Running QuizGen AI Locally

This guide covers setting up the development environment, configuring API keys, and testing the Gemini Files API upload feature.

## Prerequisites

*   Node.js (v18 or higher)
*   Google Cloud Project with **Generative Language API** enabled.
*   API Key from Google AI Studio.

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Configuration**
    Create a `.env` file in the root directory (do not commit this file):
    ```env
    # Required for Gemini API calls
    API_KEY=your_actual_api_key_here
    
    # Optional: For Google Drive Picker
    GOOGLE_CLIENT_ID=your_client_id_here
    ```

## Development Server

Start the Vite development server:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

## Testing "Upload to Gemini" Feature

1.  **Locate the Button**: On the home screen, inside the dashed upload area, look for the **"Upload to Gemini"** button (next to "Drive").
2.  **Select File**: Click the button and select a PDF file (max 50MB).
3.  **Observation**:
    *   An overlay should appear showing the upload progress bar.
    *   You can click "Hủy" to abort the upload.
    *   On success, a green message will appear at the bottom of the box with the `fileUri`.
4.  **Verification**: The `fileUri` returned (e.g., `https://generativelanguage.googleapis.com/v1beta/files/...`) can be used in subsequent prompt generation calls.

## Running Tests

Run the included unit tests to verify the component logic:
```bash
# If using vitest (configured in vite.config.ts)
npm run test

# Or if you simply want to check the file logic manually, 
# refer to components/FileUpload.test.tsx
```

## Troubleshooting

*   **403 Forbidden / API Key Error**: Ensure `API_KEY` is set in `.env` and `vite.config.ts` maps it correctly to `process.env.API_KEY`.
*   **CORS Error during Upload**: 
    *   The `uploadToGeminiFiles` service uses the official Google endpoint. 
    *   Ensure your API Key has permissions for the Generative Language API.
    *   Note: Direct browser-to-Google-API uploads usually work, but strict corporate proxies might block XHR to `googleapis.com`.

## Production Build

To build for production:
```bash
npm run build
```
