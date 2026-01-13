require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const selfsigned = require('selfsigned');
const path = require('path');
const fs = require('fs');

// Configuration
const app = express();
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Load Config
let config = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    DEFAULT_PROVIDER: 'ollama'
};

if (fs.existsSync(CONFIG_PATH)) {
    try {
        const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        config = { ...config, ...fileConfig };
    } catch (e) {
        console.error("Error reading config.json:", e);
    }
}

// Configuration for Self-Signed Certs
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });
const httpsOptions = {
    key: pems.private,
    cert: pems.cert
};

// Create Servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(httpsOptions, app);

// Socket.io (Attach to both)
const io = new Server({
    cors: { origin: "*" }
});
io.attach(httpServer);
io.attach(httpsServer);

// Middleware
app.use(express.static('public')); // Serve the frontend
app.use(express.json());

// Upload Setup (Memory Storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// State
const history = []; // Stores last 50 items
const connectedDevices = new Map(); // socketId -> { name, hasCamera }

// AI Helper Functions
const askGemini = async (prompt, imageBuffer = null, context = null) => {
    try {
        const apiKey = config.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API Key is missing in settings.");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let result;
        if (imageBuffer) {
            const imagePart = {
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: "image/jpeg"
                }
            };
            result = await model.generateContent([prompt, imagePart]);
        } else {
            // Text only (for follow-up)
            const fullPrompt = context ? `Context:\n${context}\n\nQuestion: ${prompt}` : prompt;
            result = await model.generateContent(fullPrompt);
        }
        return result.response.text();
    } catch (error) {
        console.error("Gemini Error:", error);
        return `Error calling Gemini: ${error.message}`;
    }
};

const askOllama = async (prompt, modelName, imageBuffer = null, context = null) => {
    try {
        const baseUrl = config.OLLAMA_BASE_URL;
        const requestBody = {
            model: modelName,
            stream: false
        };

        if (imageBuffer) {
            requestBody.prompt = prompt;
            requestBody.images = [imageBuffer.toString('base64')];
        } else {
            // Text only
            requestBody.prompt = context ? `Context:\n${context}\n\nQuestion: ${prompt}` : prompt;
        }

        const response = await axios.post(`${baseUrl}/api/generate`, requestBody);
        return response.data.response;

    } catch (error) {
        console.error("Ollama Error:", error);
        return `Error calling Ollama: ${error.message}`;
    }
};


// Helper: Get Daily Path
const getDailyPath = () => {
    const now = new Date();
    const folderName = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const fullPath = path.join(__dirname, 'public', 'history', folderName);

    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }

    return {
        fullPath,
        webPath: `/history/${folderName}`
    };
};

// Helper: Broadcast current device list
const broadcastDevices = () => {
    const devices = Array.from(connectedDevices.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        hasCamera: data.hasCamera
    }));
    io.emit('device_list', devices);
};

// --- Routes ---

// Settings Routes
app.get('/api/config', (req, res) => {
    // Return safe config (exclude full key if desired, but here we return for editing)
    res.json(config);
});

app.post('/api/settings', (req, res) => {
    const newConfig = req.body;
    config = { ...config, ...newConfig };

    // Save to disk
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
    res.json({ success: true, message: "Settings saved" });
});


// 1. Get Available Ollama Models
app.get('/api/ollama/models', async (req, res) => {
    try {
        const response = await axios.get(`${config.OLLAMA_BASE_URL}/api/tags`);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch Ollama models' });
    }
});

app.post('/analyze', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image');

        const { provider, modelName } = req.body;
        const timestamp = new Date().toLocaleTimeString();
        const dateObj = new Date();

        // 1. Persistence
        const { fullPath, webPath } = getDailyPath();
        const fileName = `${Date.now()}.jpg`;
        const filePath = path.join(fullPath, fileName);

        fs.writeFileSync(filePath, req.file.buffer);
        const imageUrl = `${webPath}/${fileName}`;

        // Broadcast Scan immediately
        const scanId = Date.now().toString();
        io.emit('new_scan', { id: scanId, image: imageUrl });

        // 2. AI Processing
        const persona = "You are a college student submitting an Internal Assessment (IA) for a Master’s level course. Solve this Step-by-Step. Be academic, concise, and professional.";
        let answer = '';

        if (provider === 'gemini') {
            answer = await askGemini(persona, req.file.buffer);
        } else {
            answer = await askOllama(persona, modelName || 'llama3', req.file.buffer);
        }

        // 3. Save Data
        const resultData = {
            id: scanId,
            image: imageUrl,
            answer,
            provider,
            model: modelName,
            timestamp,
            rawDate: dateObj.toISOString()
        };

        // Append to JSONL
        const jsonlPath = path.join(fullPath, 'data.jsonl');
        fs.appendFileSync(jsonlPath, JSON.stringify(resultData) + '\n');

        // Update Memory & Broadcast
        history.unshift(resultData);
        if (history.length > 50) history.pop();

        io.emit('new_answer', resultData);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        io.emit('error', { message: err.message });
        res.status(500).send(err.message);
    }
});

// --- Socket.IO ---
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send History & Devices
    socket.emit('history_update', history);
    socket.emit('device_list', Array.from(connectedDevices.values()));

    // 1. Register
    socket.on('device_register', (data) => {
        connectedDevices.set(socket.id, {
            id: socket.id,
            name: data.name,
            hasCamera: false
        });
        io.emit('device_list', Array.from(connectedDevices.values()));
    });

    // 2. Camera Status
    socket.on('camera_status', (data) => {
        const device = connectedDevices.get(socket.id);
        if (device) {
            device.hasCamera = data.active;
            connectedDevices.set(socket.id, device); // Update
            io.emit('device_list', Array.from(connectedDevices.values()));
        }
    });

    // 3. Remote Capture
    socket.on('request_remote_capture', (targetSocketId) => {
        io.to(targetSocketId).emit('trigger_check');
    });

    // 4. Live Preview (Optimized Volatile)
    socket.on('preview_frame', (frameData) => {
        socket.broadcast.volatile.emit('device_preview', {
            id: socket.id,
            image: frameData
        });
    });

    // 5. Follow-up Question
    socket.on('ask_followup', async (data) => {
        // data: { parentId, prompt, historyContext }
        try {
            const context = data.historyContext || "No previous context.";
            let reply = "";

            const provider = config.DEFAULT_PROVIDER;

            if (provider === 'gemini') {
                reply = await askGemini(data.prompt, null, context);
            } else {
                const model = data.model || 'llama3';
                reply = await askOllama(data.prompt, model, null, context);
            }

            // Emit back to EVERYONE so the thread updates on all devices
            io.emit('followup_result', {
                parentId: data.parentId,
                prompt: data.prompt,
                answer: reply,
                timestamp: new Date().toLocaleTimeString()
            });

        } catch (err) {
            socket.emit('error', { message: "Follow-up failed: " + err.message });
        }
    });

    socket.on('disconnect', () => {
        connectedDevices.delete(socket.id);
        io.emit('device_list', Array.from(connectedDevices.values()));
    });
});

const PORT_HTTP = process.env.PORT || 3000;
const PORT_HTTPS = 3001;

// Start Servers
httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
    console.log(`
    🚀 Vision Sync Server Running!
    ---------------------------------------
    🌐 Local (HTTP):  http://localhost:${PORT_HTTP}
    `);
});

httpsServer.listen(PORT_HTTPS, '0.0.0.0', () => {
    console.log(`
    📱 Mobile (HTTPS): https://<YOUR_PC_IP>:${PORT_HTTPS}
    
    ⚠️  NOTE: On Mobile, you will see a 'Not Secure' warning.
       Click 'Advanced' -> 'Proceed to...' to access the site.
       This is required for Camera access.
    ---------------------------------------
    `);
});
