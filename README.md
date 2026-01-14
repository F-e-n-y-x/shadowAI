# Vision Sync

<div align="center">

**Real-Time AI Vision Sync System**

Capture images from any device, analyze them with AI, and view results instantly — all synchronized in real-time across your devices.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?style=flat-square&logo=socket.io&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)

</div>

---

## ✨ Features

### 🤖 AI-Powered Image Analysis
- **Dual AI Provider Support**: Seamlessly switch between **Google Gemini** and **Ollama** (local LLMs)
- **Multiple Models**: Choose from various models including Gemini 1.5 Flash, Gemini 1.5 Pro, LLaMA 3, and more
- **Academic Persona**: AI responds as a college student solving internal assessments — step-by-step, academic, and professional

### 📱 Multi-Device Sync
- **Real-time Device Discovery**: Automatically detects all connected devices
- **Live Camera Preview**: View live camera feeds from any device on your network
- **Remote Capture**: Trigger camera capture from another device with one click
- **Device Naming**: Custom device names with persistent storage

### 🎥 Camera Features
- **Live Streaming**: Broadcast camera feed to all connected clients
- **Orientation Control**: Rotate camera preview (0°, 90°, 180°, 270°)
- **Image Upload**: Upload existing images for analysis
- **Full-Screen Preview**: Expand any device's camera to full screen with capture button

### 💬 Smart Conversation
- **Follow-up Questions**: Ask contextual follow-up questions on any AI response
- **Threaded Chat**: Conversation threads persist with each image analysis
- **Markdown Rendering**: AI responses rendered with full Markdown support (code blocks, tables, lists)

### 📜 History & Persistence
- **Daily Archives**: All analyses automatically saved in daily JSON Lines (`.jsonl`) files
- **Image Storage**: Captured images stored in organized daily folders
- **Session History**: Quick access to recent scans via history carousel

### 🎨 Modern UI
- **Dark/Light Theme**: Toggle between sleek dark and clean light modes
- **Premium Design**: Glassmorphism, smooth animations, and Inter font
- **Mobile Optimized**: Responsive design with mobile-specific actions
- **Toast Notifications**: Non-intrusive feedback for all actions

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ 
- **Ollama** (optional, for local AI) — [Install Ollama](https://ollama.ai)
- **Gemini API Key** (optional, for cloud AI) — [Get API Key](https://makersuite.google.com/app/apikey)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/vision-sync.git
cd vision-sync

# Install dependencies
npm install

# Start the server
npm start
```

### Access the App

| Environment | URL |
|-------------|-----|
| **Desktop (HTTP)** | `http://localhost:3000` |
| **Mobile (HTTPS)** | `https://<YOUR_PC_IP>:3001` |

> ⚠️ **Mobile Note**: You'll see a "Not Secure" warning due to self-signed certificates. Click **Advanced → Proceed** to access. This is required for camera permissions.

---

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t vision-sync .
docker run -p 3000:3000 -p 3001:3001 vision-sync
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `GEMINI_API_KEY` | - | Google Gemini API key |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |

For Docker on Windows/Mac, use `http://host.docker.internal:11434` to reach host's Ollama.

---

## ⚙️ Configuration

### Settings Panel
Click the ⚙️ gear icon to access settings:

- **Theme**: Toggle Dark/Light mode
- **Gemini API Key**: Enter and test your API key
- **Ollama URL**: Configure local Ollama endpoint
- **Default Provider**: Set preferred AI provider

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analyze` | POST | Submit image for AI analysis |
| `/api/config` | GET | Get current configuration |
| `/api/settings` | POST | Update configuration |
| `/api/ollama/models` | GET | List available Ollama models |
| `/api/test/ollama` | GET | Test Ollama connection |
| `/api/test/gemini` | GET | Test Gemini API key |

---

## 📁 Project Structure

```
vision-sync/
├── server.js              # Express + Socket.IO server
├── public/
│   ├── index.html         # Main application (SPA)
│   └── history/           # Daily archives (auto-created)
│       └── YYYY-MM-DD/    # Daily folders
│           ├── data.jsonl # Analysis data
│           └── *.jpg      # Captured images
├── config.json            # Persistent configuration
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env                   # Environment variables
```

---

## 🔌 WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `device_register` | `{name, isMobile}` | Register device |
| `camera_status` | `{active}` | Camera on/off status |
| `preview_frame` | Base64 JPEG | Live preview frame |
| `request_remote_capture` | `socketId` | Trigger remote capture |
| `ask_followup` | `{parentId, prompt, historyContext}` | Ask follow-up question |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `device_list` | Array of devices | Connected devices update |
| `device_preview` | `{id, image}` | Live preview from device |
| `new_scan` | `{id, image}` | New image being processed |
| `new_answer` | Full result object | AI analysis complete |
| `followup_result` | `{parentId, prompt, answer}` | Follow-up response |
| `trigger_check` | - | Remote capture trigger |
| `history_update` | Array of results | History refresh |
| `error` | `{message}` | Error notification |

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **AI Integration**: Google Generative AI SDK, Ollama REST API
- **Real-time**: Socket.IO with volatile events for low-latency streaming
- **Security**: Self-signed HTTPS certificates for secure mobile camera access
- **Persistence**: JSON Lines (JSONL) format for efficient append-only storage

---

## 📝 License

MIT License — feel free to use, modify, and distribute.

---

<div align="center">

**Made with ❤️ for seamless AI-powered vision workflows**

</div>
