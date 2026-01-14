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

// Pairing Persistence
const PAIRS_PATH = path.join(__dirname, 'pairs.json');
let pairs = {}; // { "deviceId": [ { id: "partnerDeviceId", name: "partnerName" } ] }

const loadPairs = () => {
    if (fs.existsSync(PAIRS_PATH)) {
        try {
            pairs = JSON.parse(fs.readFileSync(PAIRS_PATH, 'utf8'));
        } catch (e) {
            console.error("Failed to load pairs.json", e);
            pairs = {};
        }
    }
};
loadPairs();

const savePairs = () => {
    try {
        fs.writeFileSync(PAIRS_PATH, JSON.stringify(pairs, null, 2));
    } catch (e) {
        console.error("Failed to save pairs.json", e);
    }
};

const addPair = (idA, nameA, idB, nameB) => {
    if (!pairs[idA]) pairs[idA] = [];
    if (!pairs[idB]) pairs[idB] = [];

    // Avoid duplicates
    if (!pairs[idA].find(p => p.id === idB)) pairs[idA].push({ id: idB, name: nameB });
    if (!pairs[idB].find(p => p.id === idA)) pairs[idB].push({ id: idA, name: nameA });

    savePairs();
};

const removePair = (idA, idB) => {
    if (pairs[idA]) pairs[idA] = pairs[idA].filter(p => p.id !== idB);
    if (pairs[idB]) pairs[idB] = pairs[idB].filter(p => p.id !== idA);
    savePairs();
};

// State
const history = []; // Stores last 50 items
const connectedDevices = new Map(); // socketId -> { name, hasCamera }

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

// Load History from today's JSONL
const loadHistory = () => {
    try {
        const { fullPath } = getDailyPath();
        const jsonlPath = path.join(fullPath, 'data.jsonl');
        if (fs.existsSync(jsonlPath)) {
            const data = fs.readFileSync(jsonlPath, 'utf8');
            const lines = data.trim().split('\n');
            lines.forEach(line => {
                if (line) {
                    try {
                        history.unshift(JSON.parse(line));
                    } catch (err) {
                        console.warn("Skipping malformed history line:", err.message);
                    }
                }
            });
            // Keep limit
            if (history.length > 50) history.length = 50;
            console.log(`Loaded ${history.length} items from history.`);
        }
    } catch (e) {
        console.error("Failed to load history:", e);
    }
};
// Initial Load
loadHistory();

// AI Helper Functions
const askGemini = async (prompt, modelName, imageBuffer = null, context = null) => {
    try {
        const apiKey = config.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API Key is missing in settings.");

        const genAI = new GoogleGenerativeAI(apiKey);
        // Use provided model or default
        const model = genAI.getGenerativeModel({ model: modelName || "gemini-1.5-flash" });

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
        throw new Error(`Gemini API Error: ${error.message}`);
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
        throw new Error(`Ollama API Error: ${error.message}`);
    }
};


// Helper: Broadcast current device list
const broadcastDevices = () => {
    const devices = Array.from(connectedDevices.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        isMobile: data.isMobile,
        hasCamera: data.hasCamera,
        deviceId: data.deviceId // Include for client-side filtering
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

// 2. Test Ollama Connection
app.get('/api/test/ollama', async (req, res) => {
    try {
        const response = await axios.get(`${config.OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
        res.json({ success: true, models: response.data.models?.length || 0 });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// 3. Test Gemini API Key
app.get('/api/test/gemini', async (req, res) => {
    try {
        const apiKey = config.GEMINI_API_KEY;
        if (!apiKey) {
            return res.json({ success: false, error: 'No API key configured' });
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // Simple test - just list models or do a minimal call
        await model.generateContent("Hello");
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
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
            answer = await askGemini(persona, modelName, req.file.buffer);
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
        // Broadcast updated history to all clients
        io.emit('history_update', history);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        io.emit('scan_failed');
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
            isMobile: data.isMobile || false,
            hasCamera: false,
            deviceId: data.deviceId // New Unique ID for Paring
        });

        // Send back their saved pairs
        if (pairs[data.deviceId]) {
            socket.emit('paired_devices_sync', pairs[data.deviceId]);
        }

        broadcastDevices();
    });

    // Request History (explicit client request)
    socket.on('request_history', () => {
        socket.emit('history_update', history);
    });

    // Toggle Device Type (Manual Override)
    socket.on('toggle_device_type', () => {
        const device = connectedDevices.get(socket.id);
        if (device) {
            device.isMobile = !device.isMobile;
            connectedDevices.set(socket.id, device); // Update
            io.emit('device_list', Array.from(connectedDevices.values()));
        }
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

    // 4. WebRTC Signaling (Replaces old 'preview_frame')
    socket.on('signal_offer', (data) => {
        // data: { targetId, sdp }
        io.to(data.targetId).emit('signal_offer', {
            originId: socket.id,
            sdp: data.sdp
        });
    });

    socket.on('signal_answer', (data) => {
        // data: { targetId, sdp }
        io.to(data.targetId).emit('signal_answer', {
            originId: socket.id,
            sdp: data.sdp
        });
    });

    socket.on('signal_ice', (data) => {
        // data: { targetId, candidate }
        io.to(data.targetId).emit('signal_ice', {
            originId: socket.id,
            candidate: data.candidate
        });
    });

    socket.on('request_stream', (targetId) => {
        io.to(targetId).emit('request_stream', { requesterId: socket.id });
    });

    socket.on('stop_stream', (targetId) => {
        io.to(targetId).emit('stop_stream', { requesterId: socket.id });
    });

    // 5. Follow-up Question
    socket.on('ask_followup', async (data) => {
        // data: { parentId, prompt, historyContext, webSearch }
        try {
            const context = data.historyContext || "No previous context.";
            let reply = "";

            const provider = config.DEFAULT_PROVIDER;

            // Build the enhanced prompt
            let enhancedPrompt = data.prompt;

            if (data.webSearch) {
                // Web search persona - instructs AI to use grounding/search and synthesize
                enhancedPrompt = `You have access to real-time web information. Research this question using the internet, then provide a comprehensive, well-synthesized answer in your own words. Do NOT simply copy-paste from sources - analyze, summarize, and explain the information clearly. Cite sources when relevant.

Question: ${data.prompt}`;
            }

            if (provider === 'gemini') {
                const model = data.model || 'gemini-1.5-flash';
                reply = await askGemini(enhancedPrompt, model, null, context);
            } else {
                const model = data.model || 'llama3';
                reply = await askOllama(enhancedPrompt, model, null, context);
            }

            const timestamp = new Date().toLocaleTimeString();

            // Emit to clients
            io.emit('followup_result', {
                parentId: data.parentId,
                prompt: data.prompt,
                answer: reply,
                timestamp
            });

            // --- Persistence Logic ---
            const { fullPath } = getDailyPath();
            const jsonlPath = path.join(fullPath, 'data.jsonl');

            // Find item in memory
            const item = history.find(h => h.id === data.parentId);
            if (item) {
                if (!item.thread) item.thread = [];
                item.thread.push({ prompt: data.prompt, answer: reply, timestamp });
            }

            // Rewrite JSONL (Simplest approach for valid JSONL updates)
            if (fs.existsSync(jsonlPath)) {
                // Read all, update target, write back
                const content = fs.readFileSync(jsonlPath, 'utf8');
                const lines = content.trim().split('\n').filter(l => l);

                const newLines = lines.map(line => {
                    try {
                        const obj = JSON.parse(line);
                        if (obj.id === data.parentId) {
                            if (!obj.thread) obj.thread = [];
                            obj.thread.push({ prompt: data.prompt, answer: reply, timestamp });
                            return JSON.stringify(obj);
                        }
                        return line;
                    } catch (e) { return line; }
                });

                fs.writeFileSync(jsonlPath, newLines.join('\n') + '\n');
            }

        } catch (err) {
            socket.emit('error', { message: "Follow-up failed: " + err.message });
        }
    });

    socket.on('disconnect', () => {
        connectedDevices.delete(socket.id);
        io.emit('device_list', Array.from(connectedDevices.values()));
    });

    // --- Pairing Flow (Discovery & Confirmation) ---
    // 1. Origin requests pair -> Target
    socket.on('request_pair', (data) => {
        // data: { targetId (SocketID), originId (DeviceID), originName }
        io.to(data.targetId).emit('pair_request_received', {
            originId: data.originId,
            originName: data.originName,
            originSocketId: socket.id
        });
    });

    // 2. Target accepts -> Origin
    socket.on('pair_accepted', (data) => {
        // data: { partnerId (SocketID), partnerName, targetId (DeviceID), targetName }
        // partnerId is the SocketID of the original requester

        // Find Device ID of the partner (requester)
        const partnerSocket = connectedDevices.get(data.partnerId);
        const partnerDeviceId = partnerSocket ? partnerSocket.deviceId : null;

        if (partnerDeviceId) {
            // Save to Server Persistence
            addPair(data.targetId, data.targetName, partnerDeviceId, data.partnerName);

            // Sync BOTH sides immediately if online
            // 1. Sync Requester (Partner)
            io.to(data.partnerId).emit('pairing_success', {
                id: data.targetId,
                name: data.targetName
            });
            // Also send full sync to ensure state
            io.to(data.partnerId).emit('paired_devices_sync', pairs[partnerDeviceId]);

            // 2. Sync Acceptor (Target/Self)
            socket.emit('paired_devices_sync', pairs[data.targetId]);
        }
    });

    // 3. Unpair Request - GLOBAL SYNC
    socket.on('request_unpair', (data) => {
        // data: { originId (MyDeviceID), targetId (TargetDeviceID) }

        removePair(data.originId, data.targetId);

        // Notify Self (Updated List)
        if (pairs[data.originId]) {
            socket.emit('paired_devices_sync', pairs[data.originId]);
        } else {
            socket.emit('paired_devices_sync', []);
        }

        // Notify Target (If Online)
        // We need to find the socket(s) associated with targetId
        for (const [sId, device] of connectedDevices.entries()) {
            if (device.deviceId === data.targetId) {
                io.to(sId).emit('unpair_request_received', { originId: data.originId });
                io.to(sId).emit('paired_devices_sync', pairs[data.targetId] || []);
            }
        }
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
