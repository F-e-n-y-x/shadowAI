# ShadowAI
**Real-Time AI Vision & Device Sync System**

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Node.js](https://img.shields.io/badge/node.js-v18%2B-green.svg) ![Socket.io](https://img.shields.io/badge/socket.io-v4-black.svg)

**ShadowAI** is a powerful, real-time vision intelligence tool that connects multiple devices into a unified AI network. Stream camera feeds from mobile to desktop, perform remote AI analysis using **Google Gemini** or **Ollama**, and sync your history across devices instantly.

---

## 🚀 Key Features

*   **📱 Universal Device Sync**: Connect unlimited devices (Mobile, Desktop, Laptop) via a local network.
*   **📡 Real-Time WebRTC Streaming**: High-quality, low-latency live video streaming between devices (p2p/mesh).
*   **📷 Remote Capture & AI**: Trigger a camera capture on your phone *from your desktop* and get instant AI analysis.
*   **🔐 Secure Device Pairing**: Pair devices with unique 8-character IDs to authorize streams and enhanced security.
*   **🧠 Multi-Model Support**: Switch seamlessly between **Google Gemini (Cloud)** and **Ollama (Local)** models.
*   **💬 Contextual Follow-Up**: Chat with the AI about the captured image with history context.
*   **💾 Persistent History**: Automatically saves your scans and analysis locally.

---

## 🛠️ Tech Stack

*   **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Modern Floating UI)
*   **Backend**: Node.js, Express
*   **Real-Time**: Socket.io (Signaling), WebRTC (Streaming)
*   **AI Integration**: `@google/generative-ai`, axios (Ollama)

---

## 📥 Installation

### Option 1: Docker (Recommended)
Run ShadowAI instantly with verified settings.

```bash
# 1. Clone the repository
git clone https://github.com/your-username/shadow-ai.git
cd shadow-ai

# 2. Build and Run
docker build -t shadow-ai .
docker run -d -p 3000:3000 --name shadow-ai shadow-ai
```

### Option 2: Local Node.js
```bash
# 1. Install Dependencies
npm install

# 2. Configure Environment (Optional)
# Create a .env file or just export variables:
# PORT=3000
# GEMINI_API_KEY=your_key_here

# 3. Start Server
npm start
```
*Access the app at `https://localhost:3000` (Self-signed certs included for camera access).*

---

## 📖 Usage Guide

### 1. Connecting Devices
1.  Open **ShadowAI** on your Desktop.
2.  Open **ShadowAI** on your Mobile (make sure both are on the same Wi-Fi/Network).
3.  The "Available Devices" list will populate automatically.

### 2. Device Pairing (Security)
1.  Find your **Device ID** (top-left, e.g., `X7A9B2C1`).
2.  On the other device, enter this ID in the "Pair Device" box and click ✔️.
3.  Accept the request on the target device.
4.  Once paired, you can view live feeds and control the camera.

### 3. Remote Vision & AI
1.  Click the **Camera Icon** 📷 next to a paired device in the sidebar.
2.  The remote device will take a photo and upload it.
3.  ShadowAI analyzes the image (using your selected AI model) and displays the result on **all connected devices**.

### 4. Live Preview
1.  Click on any device's thumbnail in the "Connected Devices" list.
2.  A large, responsive **Live Preview** modal will open.
3.  You can take snapshots directly from this live view.

---

## ⚙️ Configuration

Start the server with specific flags or environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Server Port | `3000` |
| `GEMINI_API_KEY` | Google Gemini API Key | `""` |
| `OLLAMA_BASE_URL` | Local Ollama Instance | `http://127.0.0.1:11434` |
| `DATA_DIR` | Path to save history/uploads | `./public/uploads` |

---

## 🔌 WebSocket & WebRTC Events

| Event | Direction | Description |
| :--- | :--- | :--- |
| `device_register` | Client → Server | Broadcasting device presence |
| `request_stream` | Client → Server | Requesting WebRTC P2P connection |
| `signal_offer` | P2P | WebRTC SDP Offer exchange |
| `signal_answer` | P2P | WebRTC SDP Answer exchange |
| `signal_ice` | P2P | ICE Candidate exchange |
| `request_capture` | Client → Client | Triggering remote camera shutter |

---

## 📄 License
This project is licensed under the **MIT License**.