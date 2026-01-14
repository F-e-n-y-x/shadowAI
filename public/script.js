/**
 * =========================================
 * Vision Sync - Main Application Script
 * =========================================
 * This script handles:
 * 1. Socket.io connections for real-time communication.
 * 2. WebRTC logic for p2p camera streaming.
 * 3. UI Interactions (Tabs, Modals, Forms).
 * 4. API Testing and Config Management.
 */

const socket = io();
socket.on('connect', () => {
    console.log("Socket Connected:", socket.id);
    showToast("Server Connected");
});
console.log("Script loaded, socket initialized");

// --- Configuration State ---
let config = {
    DEFAULT_PROVIDER: 'ollama'
};

// --- WebRTC Configuration ---
// STUN servers are used to traverse NATs for P2P connections.
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- Application State ---
// Retrieve or generate a persistent Device ID
let myDeviceId = localStorage.getItem('vision_deviceId');
if (!myDeviceId) {
    myDeviceId = Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem('vision_deviceId', myDeviceId);
}

// Static list of Gemini models for the dropdown
const GEMINI_MODELS = [
    { name: "gemini-1.5-flash", label: "Gemini 1.5 Flash (Fast)" },
    { name: "gemini-1.5-pro", label: "Gemini 1.5 Pro (Powerful)" },
    { name: "gemini-pro-vision", label: "Gemini Pro Vision" }
];

// --- DOM Elements ---
const deviceNameInput = document.getElementById('deviceNameInput');
const deviceList = document.getElementById('deviceList');
const feedPanel = document.getElementById('feedPanel');
const historyList = document.getElementById('historyList');
const modelSelect = document.getElementById('modelSelect');

// --- Initialization ---
function checkIsMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
const savedName = localStorage.getItem('shadow_device_name') || `Device-${Math.floor(Math.random() * 1000)}`;
const isMobile = checkIsMobile();
deviceNameInput.value = savedName;

// --- Device ID & Pairing Logic ---
document.getElementById('deviceIdText').innerText = myDeviceId;
document.getElementById('deviceIdDisplay').onclick = () => {
    navigator.clipboard.writeText(myDeviceId);
    showToast("Device ID Copied!");
};

// Data - Sync with Server
let pairedDevices = []; // Managed by server sync
let availableDevices = [];

/**
 * Socket Event: paired_devices_sync
 * Receives the updated list of paired devices from the server.
 */
socket.on('paired_devices_sync', (devices) => {
    pairedDevices = devices || [];
    updatePairedListUI();
    if (window.lastDeviceList) renderDeviceList(window.lastDeviceList);
});

/**
 * Updates the UI list of paired devices in the Settings modal.
 */
function updatePairedListUI() {
    const list = document.getElementById('pairedList');
    list.innerHTML = '';
    if (pairedDevices.length === 0) {
        list.innerHTML = '<div class="paired-item" style="justify-content:center; color:var(--text-secondary);">No devices paired.</div>';
        return;
    }
    pairedDevices.forEach(d => {
        const item = document.createElement('div');
        item.className = 'paired-item';
        item.innerHTML = `
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:500; font-size:0.9rem;">${d.name}</span>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${d.id}</span>
            </div>
            <button class="unpair-btn" onclick="unpairDevice('${d.id}')" title="Unpair"><i class="ph ph-trash"></i></button>
        `;
        list.appendChild(item);
    });
}
updatePairedListUI();

// Handle Manual Pairing Button
document.getElementById('pairBtn').onclick = () => {
    const inputVal = document.getElementById('pairingInput').value.trim().toUpperCase();
    if (!inputVal) return;
    initiatePairing(inputVal);
};

/**
 * Initiates a pairing request to a target device ID.
 * @param {string} targetId - The ID of the device to pair with.
 * @param {string} targetName - (Optional) Name of the target device.
 */
function initiatePairing(targetId, targetName = "Unknown") {
    if (targetId === myDeviceId) { showToast("Cannot pair with yourself."); return; }
    if (pairedDevices.find(d => d.id === targetId)) { showToast("Device already paired."); return; }

    const foundDev = availableDevices.find(d => d.deviceId === targetId);

    if (foundDev) {
        socket.emit('request_pair', {
            targetId: foundDev.id, // Socket ID
            originId: myDeviceId,
            originName: deviceNameInput.value
        });
        showToast(`Request sent to ${foundDev.name}...`);
    } else {
        showToast("Device not found on network.");
    }
}

/**
 * Unpairs a device by sending a request to the server.
 * @param {string} id - The Device ID to unpair.
 */
window.unpairDevice = (id) => {
    socket.emit('request_unpair', {
        targetId: id,
        originId: myDeviceId
    });
    showToast("Unpairing...");
};

// Handle Notification when unpaired by someone else
socket.on('unpair_request_received', (data) => {
    showToast(`Device ${data.originId} unpaired you.`);
});

// Handle Incoming Pairing Request
let pendingRequest = null;
socket.on('pair_request_received', (data) => {
    // If already paired, auto-accept (e.g. re-connection)
    if (pairedDevices.find(d => d.id === data.originId)) {
        const originDev = availableDevices.find(d => d.deviceId === data.originId);
        if (originDev) {
            socket.emit('pair_accepted', {
                partnerId: originDev.id,
                partnerName: originDev.name,
                targetId: myDeviceId,
                targetName: deviceNameInput.value
            });
        }
        return;
    }
    // Otherwise show modal
    pendingRequest = data;
    document.getElementById('pairingRequestMsg').innerText = `Device "${data.originName}" (${data.originId}) wants to pair with you.`;
    document.getElementById('pairingModal').classList.add('open');
});

// User Actions for Pairing Request
window.acceptPairing = () => {
    if (pendingRequest) {
        if (pendingRequest.originSocketId) {
            socket.emit('pair_accepted', {
                partnerId: pendingRequest.originSocketId,
                partnerName: pendingRequest.originName,
                targetId: myDeviceId,
                targetName: deviceNameInput.value
            });
        }
    }
    closePairingModal();
};

window.rejectPairing = () => {
    pendingRequest = null;
    closePairingModal();
};

function closePairingModal() {
    document.getElementById('pairingModal').classList.remove('open');
}

socket.on('pairing_success', (data) => {
    showToast(`${data.name} accepted pairing!`);
});

// Register this device on the network
socket.emit('device_register', { name: savedName, isMobile, deviceId: myDeviceId });

// --- Load Initial Configuration ---
fetch('/api/config').then(res => res.json()).then(data => {
    config = data;
    document.getElementById('ollamaUrlInput').value = data.OLLAMA_BASE_URL;
    document.getElementById('defaultProviderSelect').value = data.DEFAULT_PROVIDER;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.seg-btn[data-val="${data.DEFAULT_PROVIDER}"]`)?.classList.add('active');
    updateModelDropdown(data.DEFAULT_PROVIDER);
});

// --- Settings Modal UI ---
const themeToggle = document.getElementById('themeToggle');
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.textContent = 'Switch to Dark Mode';
}
document.getElementById('settingsBtn').onclick = () => document.getElementById('settingsModal').classList.add('open');
window.closeSettings = () => document.getElementById('settingsModal').classList.remove('open');

// Close modals on clicking backdrop
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('open');
    });
});

themeToggle.onclick = () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.textContent = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
};

/**
 * Saves server-side settings (API Keys, etc.)
 */
window.saveSettings = async () => {
    const payload = {
        GEMINI_API_KEY: document.getElementById('geminiKeyInput').value || undefined,
        OLLAMA_BASE_URL: document.getElementById('ollamaUrlInput').value,
        DEFAULT_PROVIDER: document.getElementById('defaultProviderSelect').value
    };
    const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        showToast("Settings Saved Successfully");
        setTimeout(closeSettings, 800);
        setTimeout(() => location.reload(), 1200);
    }
};

/**
 * Helper to show toast messages.
 */
function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// Save Device Name
document.getElementById('saveNameBtn').onclick = () => {
    const newName = deviceNameInput.value.trim();
    if (!newName) { showToast("Please enter a device name"); return; }
    localStorage.setItem('shadow_device_name', newName);
    socket.emit('device_register', { name: newName, isMobile, deviceId: myDeviceId });
    showToast(`Name saved: ${newName}`);
};

// --- WebRTC Video Logic ---
let localStream = null;
let peerConnections = {}; // Map: socketId -> RTCPeerConnection
const iceCandidatesQueue = {}; // Map: socketId -> [RTCIceCandidateInit]

const video = document.getElementById('video');
let currentRotation = 0;

document.getElementById('camRotateBtn').onclick = () => {
    currentRotation = (currentRotation + 90) % 360;
    video.style.transform = `rotate(${currentRotation}deg)`;
    if (currentRotation % 180 !== 0) video.style.objectFit = "contain";
    else video.style.objectFit = "cover";
};

/**
 * Starts the local camera stream.
 */
async function startCamera() {
    if (localStream) return;
    try {
        const constraints = {
            video: {
                facingMode: 'environment', // Use back camera on mobile
                // Ask for highest possible resolution; browser will provide native aspect ratio
                width: { ideal: 4096 },
                height: { ideal: 2160 }
            }
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = localStream;
        document.getElementById('cameraContainer').classList.add('active');
        document.getElementById('mobileActionBtns').classList.add('active');
        document.getElementById('cameraToggle').textContent = "Stop Camera";

        socket.emit('camera_status', { active: true });

        currentRotation = 0;
        video.style.transform = 'none';
        return true;
    } catch (e) {
        console.error("Camera Start Error:", e);
        showToast("Camera Error: " + e.message);
        return false;
    }
}

document.getElementById('cameraToggle').onclick = async () => {
    if (localStream) {
        stopCamera();
        document.getElementById('cameraToggle').textContent = "Start Camera";
    } else {
        await startCamera();
    }
};

function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    // Close all peer connections serving this stream
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    document.getElementById('cameraContainer').classList.remove('active');
    document.getElementById('mobileActionBtns').classList.remove('active');
    socket.emit('camera_status', { active: false });
}

// --- WebRTC Signaling Events ---

// 1. Handle incoming stream request (Camera/Broadcaster Side)
socket.on('request_stream', async (data) => {
    console.log("Received Stream Request:", data);
    // data: { requesterId }
    const requesterId = data.requesterId;
    if (!requesterId) {
        console.warn("Invalid requesterId in request_stream", data);
        // Fallback if data IS the id string
        if (typeof data === 'string') requesterId = data;
        else return;
    }
    console.log("Stream requested by:", requesterId);

    if (!localStream) {
        console.warn("Local stream not active, cannot share.");
        return;
    }

    // Create PeerConnection
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[requesterId] = pc;

    // Monitor Connection State
    pc.oniceconnectionstatechange = () => {
        console.log(`PC State [${requesterId}]:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            // Optional: cleanup?
        }
    };

    // Add Tracks to PC
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // ICE Candidate Handler
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal_ice', { targetId: requesterId, candidate: event.candidate });
        }
    };

    // Create and Send Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log("Sending Offer to", requesterId);
    socket.emit('signal_offer', { targetId: requesterId, sdp: offer });
    showToast("Streaming to new viewer...");
});

// 2. Handle Answer (Camera Side)
socket.on('signal_answer', async (data) => {
    console.log("Received Signal Answer", data);
    const pc = peerConnections[data.originId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else {
        console.warn("No PC found for answer", data.originId);
    }
});

// 3. Handle ICE Candidate (Both Sides)
socket.on('signal_ice', async (data) => {
    let pc = peerConnections[data.originId];

    // Viewer side check
    if (!pc && window.activeRemotePC && window.activeRemotePC.remoteId === data.originId) {
        pc = window.activeRemotePC;
    }

    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error("Error adding ICE candidate", e);
        }
    } else {
        // Buffer connection if PC not ready yet
        console.log("Buffering ICE candidate for:", data.originId);
        iceCandidatesQueue[data.originId].push(data.candidate);
    }
});

// 4. Handle Stop Stream (Cleanup)
socket.on('stop_stream', (data) => {
    // data: { requesterId }
    const requesterId = data.requesterId;
    console.log("Stopping stream for:", requesterId);
    if (peerConnections[requesterId]) {
        peerConnections[requesterId].close();
        delete peerConnections[requesterId];
    }
});

// --- Viewer Side Logic ---
window.activeRemotePC = null; // Stores single active view PC (Modal)

window.openPreview = (targetSocketId) => {
    if (targetSocketId === socket.id) return; // Can't view self

    const modal = document.getElementById('previewModal');
    modal.classList.add('open');

    // Create or locate the video element
    let remoteVid = document.getElementById('remoteVideo');
    if (!remoteVid) {
        const img = document.getElementById('largePreviewImg');
        remoteVid = document.createElement('video');
        remoteVid.id = 'remoteVideo';
        remoteVid.autoplay = true;
        remoteVid.playsInline = true;
        remoteVid.className = 'preview-large';
        img.replaceWith(remoteVid);
    }

    // Optimization: If we already have a mini-stream, clone it locally
    const miniVid = document.getElementById(`video-${targetSocketId}`);
    if (miniVid && miniVid.srcObject) {
        remoteVid.srcObject = miniVid.srcObject;
        showToast("Opened Live Feed");
        return;
    }

    remoteVid.srcObject = null;

    // Cleanup previous connection
    if (window.activeRemotePC) {
        window.activeRemotePC.close();
        window.activeRemotePC = null;
    }

    // Request new stream from owner
    console.log("Requesting stream from:", targetSocketId);
    socket.emit('request_stream', targetSocketId);
    showToast("Requesting Signal...");

    window.pendingRemoteId = targetSocketId;
};

// Handle Offer (Viewer Side)
socket.on('signal_offer', async (data) => {
    console.log("Received Offer from:", data.originId);

    // Allow offer if it is pending OR if it's a new background stream (thumbnails)
    // We only block if we are strictly in a state where we shouldn't receive offers,
    // but for this app, we want to allow auto-connections for the list.

    const pc = new RTCPeerConnection(rtcConfig);
    pc.remoteId = data.originId;

    // Monitor Connection State (Viewer Side)
    pc.oniceconnectionstatechange = () => {
        console.log(`Viewer PC State [${data.originId}]:`, pc.iceConnectionState);
    };

    peerConnections[data.originId] = pc;

    if (window.pendingRemoteId === data.originId) {
        window.activeRemotePC = pc;
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal_ice', { targetId: data.originId, candidate: event.candidate });
        }
    };

    // When remote stream arrives
    pc.ontrack = (event) => {
        // Update mini-video if exists
        const listVid = document.getElementById(`video-${data.originId}`);
        if (listVid) {
            listVid.srcObject = event.streams[0];
        }

        // Update modal video if active
        const remoteVid = document.getElementById('remoteVideo');
        if (remoteVid && window.pendingRemoteId === data.originId) {
            remoteVid.srcObject = event.streams[0];
        }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

    // Process Buffered ICE Candidates
    if (iceCandidatesQueue[data.originId]) {
        console.log("Processing buffered ICE candidates for:", data.originId);
        iceCandidatesQueue[data.originId].forEach(async (c) => {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
            catch (e) { console.error("Error adding buffered ICE", e); }
        });
        delete iceCandidatesQueue[data.originId];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('signal_answer', { targetId: data.originId, sdp: answer });
});

window.closePreview = () => {
    document.getElementById('previewModal').classList.remove('open');
    if (window.activeRemotePC) {
        const target = window.activeRemotePC.remoteId;
        window.activeRemotePC.close();
        window.activeRemotePC = null;
        socket.emit('stop_stream', target);
    }
    window.pendingRemoteId = null;

    const remoteVid = document.getElementById('remoteVideo');
    if (remoteVid) remoteVid.srcObject = null;
};

// --- Capture & Analyze Logic ---

socket.on('trigger_check', () => {
    if (localStream) takePicture();
});

document.getElementById('captureBtn').onclick = async () => {
    if (!localStream) {
        showToast("Starting Camera...");
        const started = await startCamera();
        if (started) {
            setTimeout(takePicture, 800); // Wait for camera to warm up
        }
    } else {
        takePicture();
    }
};

// Wired up Remote Capture Button
document.getElementById('remoteCaptureBtn').onclick = () => {
    if (window.pendingRemoteId) {
        requestCapture(window.pendingRemoteId);
    } else {
        showToast("No active stream to capture");
    }
};

function takePicture() {
    if (!localStream) return;

    // Draw video frame to canvas
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Convert to Blob and Upload
    canvas.toBlob(blob => {
        const fd = new FormData();
        fd.append('image', blob, 'capture.jpg');
        const activeProvider = document.querySelector('.seg-btn.active').dataset.val;
        fd.append('provider', activeProvider);
        fd.append('modelName', modelSelect.value);

        fetch('/analyze', { method: 'POST', body: fd });
        showToast("Analyzing...");
    }, 'image/jpeg', 0.95);
}

window.requestCapture = (targetId) => {
    socket.emit('request_remote_capture', targetId);
    showToast("Capture Requested");
};


// --- File Upload Logic ---
document.getElementById('uploadInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    const activeProvider = document.querySelector('.seg-btn.active').dataset.val;
    fd.append('provider', activeProvider);
    fd.append('modelName', modelSelect.value);

    fetch('/analyze', { method: 'POST', body: fd });
    showToast("Uploading image...");
    e.target.value = '';
};

// --- Device List & Status Events ---
let lastDeviceList = [];
function renderDeviceList(devices) {
    window.lastDeviceList = devices;
    const others = devices.filter(d => d.id !== socket.id);
    const pairedList = others.filter(d => pairedDevices.find(p => p.id === d.deviceId));
    availableDevices = others.filter(d => !pairedDevices.find(p => p.id === d.deviceId) && d.deviceId);

    deviceList.innerHTML = '';

    // 1. Cleanup Stale Connections
    // If we have a PC for a device that is NO LONGER in the list or NO LONGER has a camera, close it.
    Object.keys(peerConnections).forEach(remoteSocketId => {
        const device = others.find(d => d.id === remoteSocketId);
        if (!device || !device.hasCamera) {
            console.log("Cleaning up stale connection for:", remoteSocketId);
            peerConnections[remoteSocketId].close();
            delete peerConnections[remoteSocketId];
        }
    });

    // 2. Render Paired Devices
    pairedList.forEach(d => {
        const el = document.createElement('div');
        el.className = 'device-item';

        let previewContent = '';

        if (d.hasCamera) {
            // Check connection state
            if (!peerConnections[d.id]) {
                // No connection yet, verify we aren't viewing someone else exclusively in modal 
                // (though we relaxed this, let's keep it safe)
                setTimeout(() => {
                    if (!peerConnections[d.id]) {
                        console.log("Auto-requesting stream for:", d.id);
                        socket.emit('request_stream', d.id);
                    }
                }, 500);
            }

            previewContent = `
                <div class="mini-live-feed" onclick="openPreview('${d.id}')" style="cursor:pointer; margin-top:10px; position:relative; width:100%; height:auto; min-height:150px; background:#000; border-radius:8px; overflow:hidden;">
                    <video id="video-${d.id}" autoplay playsinline webkit-playsinline muted style="width:100%; height:auto; max-height:300px; display:block; object-fit:contain; margin: 0 auto;"></video>
                    <div class="play-overlay" id="play-${d.id}" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.4); justify-content:center; align-items:center; color:white; z-index:10;"><i class="ph ph-play-circle" style="font-size:3rem;"></i></div>
                    <div style="position:absolute; bottom:5px; right:5px; background:rgba(0,0,0,0.6); color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem;">LIVE</div>
                </div>
            `;
        }

        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <strong class="device-name">${d.name}</strong>
                    <div class="device-status" style="font-size:0.7em; opacity:0.7;">ID: ${d.deviceId}</div>
                </div>
                 ${d.hasCamera ? `
                <button onclick="requestCapture('${d.id}')" title="Capture" style="background:var(--accent); color:white; border:none; border-radius:4px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                    <i class="ph ph-camera"></i>
                </button>
                ` : ''}
            </div>
            ${previewContent}
        `;
        deviceList.appendChild(el);

        // 3. Re-attach Stream to New DOM Element
        if (d.hasCamera && peerConnections[d.id]) {
            const videoEl = el.querySelector(`#video-${d.id}`);
            const pc = peerConnections[d.id];
            const stream = pc.getRemoteStreams()[0];
            if (videoEl && stream) {
                console.log("Re-attaching existing stream to:", d.id);
                videoEl.srcObject = stream;
                // Safari & Mobile Compatibility Enforcement
                videoEl.muted = true;
                videoEl.playsInline = true;
                videoEl.setAttribute('playsinline', '');
                videoEl.setAttribute('webkit-playsinline', '');

                // Robust Playback
                const p = videoEl.play();
                if (p !== undefined) {
                    p.catch(e => {
                        console.warn("Auto-play failed (Safari?), showing play button", e);
                        const playOverlay = el.querySelector(`#play-${d.id}`);
                        if (playOverlay) {
                            playOverlay.style.display = 'flex';
                            playOverlay.onclick = (ev) => {
                                ev.stopPropagation();
                                videoEl.play().then(() => playOverlay.style.display = 'none');
                            };
                        }
                    });
                }
            }
        }
    });

    if (pairedList.length === 0) {
        deviceList.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary); font-size:0.9rem;">No paired devices connected.<br>Use "Available Devices" below or enter ID.</div>';
    }

    // Render Available Devices
    const availContainer = document.getElementById('availableDeviceList');
    availContainer.innerHTML = '';
    if (availableDevices.length === 0) {
        availContainer.innerHTML = '<div style="text-align:center; padding:10px; color:var(--text-secondary); font-size:0.8rem;">No new devices found.</div>';
    } else {
        availableDevices.forEach(d => {
            const el = document.createElement('div');
            el.className = 'device-item';
            el.style.background = 'rgba(255, 255, 255, 0.03)';
            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong class="device-name">${d.name}</strong>
                        <div class="device-status" style="font-size:0.7em; opacity:0.5;">${d.deviceId}</div>
                    </div>
                    <button class="pair-action-btn" onclick="initiatePairing('${d.deviceId}', '${d.name}')">Pair</button>
                </div>
            `;
            availContainer.appendChild(el);
        });
    }
}
socket.on('device_list', renderDeviceList);
window.toggleDeviceType = () => socket.emit('toggle_device_type');

// --- Real-time Results & History ---
socket.on('scan_failed', () => {
    document.getElementById('liveProcessing').style.display = 'none';
    document.getElementById('placeholder').style.display = 'flex';
    showToast("Scan Processing Failed");
});

socket.on('new_scan', (data) => {
    document.getElementById('placeholder').style.display = 'none';
    const proc = document.getElementById('liveProcessing');
    proc.style.display = 'block';
    document.getElementById('processingImg').src = data.image;
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
});

socket.on('new_answer', (data) => {
    document.getElementById('liveProcessing').style.display = 'none';
    renderResultCard(data, true);
    fetchHistory();
});

socket.on('history_update', (hist) => {
    historyList.innerHTML = '';
    hist.forEach(item => {
        const el = document.createElement('img');
        el.src = item.image;
        el.style = "width:100px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer;";
        el.onclick = () => {
            if (!document.getElementById(`result-${item.id}`)) renderResultCard(item, false);
            document.getElementById(`result-${item.id}`).scrollIntoView({ behavior: 'smooth' });
        };
        historyList.appendChild(el);
    });
});

/**
 * Renders a result card (Question + Answer + Follow-up UI).
 * @param {object} data - The result object.
 * @param {boolean} prepend - Whether to add to the top of the feed.
 */
function renderResultCard(data, prepend) {
    document.getElementById('placeholder').style.display = 'none';
    if (document.getElementById(`result-${data.id}`)) return;
    const div = document.createElement('div');
    div.className = 'result-card';
    div.id = `result-${data.id}`;
    div.innerHTML = `
        <div class="result-header">
            <span>${data.provider.toUpperCase()} (${data.model || ''})</span>
            <span>${data.timestamp}</span>
        </div >
        <div class="markdown-body">${marked.parse(data.answer ? data.answer.trim() : '')}</div>
        <div class="followup-section">
            <div id="thread-${data.id}" class="followup-thread"></div>
            <div class="followup-input-container">
                <div class="followup-actions">
                    <button class="followup-action-btn active" id="web-${data.id}" onclick="toggleWebSearch('${data.id}')" title="Web Search (On by Default)"><i class="ph ph-globe"></i></button>
                    <button class="followup-action-btn" onclick="triggerAttachment('${data.id}')" title="Attach Image"><i class="ph ph-paperclip"></i></button>
                </div>
                <textarea class="followup-input" placeholder="Ask a follow-up..." id="input-${data.id}" rows="1" onkeydown="handleChatKey(event, '${data.id}')"></textarea>
                <button class="followup-btn" onclick="sendFollowUp('${data.id}')" title="Send"><i class="ph ph-paper-plane-right"></i></button>
            </div>
        </div>
            `;
    if (prepend) feedPanel.insertBefore(div, document.getElementById('liveProcessing').nextSibling);
    else feedPanel.appendChild(div);

    if (data.thread && Array.isArray(data.thread)) {
        data.thread.forEach(msg => {
            addChatBubble(data.id, msg.prompt, 'user');
            addChatBubble(data.id, msg.answer, 'ai');
        });
    }
}

// --- Follow-up / Chat Logic ---
window.handleChatKey = (e, id) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFollowUp(id);
    }
};

const webSearchEnabled = {};
window.toggleWebSearch = (id) => {
    const btn = document.getElementById(`web-${id}`);
    if (webSearchEnabled[id] === undefined) webSearchEnabled[id] = true;
    webSearchEnabled[id] = !webSearchEnabled[id];
    btn.classList.toggle('active', webSearchEnabled[id]);
    showToast(webSearchEnabled[id] ? "Web Search Enabled" : "Web Search Disabled");
};

window.triggerAttachment = (id) => showToast("Attachment feature coming soon!");

window.sendFollowUp = (parentId) => {
    const input = document.getElementById(`input-${parentId}`);
    const prompt = input.value.trim();
    if (!prompt) return;
    const thread = document.getElementById(`thread-${parentId}`);

    addChatBubble(parentId, prompt, 'user');
    input.value = '';

    if (thread && !document.getElementById(`thinking-${parentId}`)) {
        const thinking = document.createElement('div');
        thinking.id = `thinking-${parentId}`;
        thinking.className = 'typing-indicator';
        thinking.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
        thread.appendChild(thinking);
        thread.scrollTop = thread.scrollHeight;
    }

    const card = document.getElementById(`result-${parentId}`);
    const contextText = card.querySelector('.markdown-body').innerText;
    const useWebSearch = webSearchEnabled[parentId] !== false;

    socket.emit('ask_followup', {
        parentId,
        prompt,
        historyContext: contextText,
        model: config.DEFAULT_PROVIDER === 'ollama' ? modelSelect.value : undefined,
        webSearch: useWebSearch
    });
};

socket.on('followup_result', (data) => {
    const thinking = document.getElementById(`thinking-${data.parentId}`);
    if (thinking) thinking.remove();
    const thread = document.getElementById(`thread-${data.parentId}`);
    if (thread) {
        const lastMsg = thread.lastElementChild;
        const alreadyShowingUser = lastMsg && lastMsg.classList.contains('chat-user') && lastMsg.innerText === data.prompt;
        if (!alreadyShowingUser) addChatBubble(data.parentId, data.prompt, 'user');
        addChatBubble(data.parentId, data.answer, 'ai');
    }
});

function addChatBubble(parentId, text, type) {
    const thread = document.getElementById(`thread-${parentId}`);
    if (!thread) return;
    const div = document.createElement('div');
    div.className = `chat-bubble chat-${type}`;
    div.innerHTML = type === 'ai' ? marked.parse(text) : text;
    thread.appendChild(div);
}

function fetchHistory() { socket.emit('request_history'); }

// --- UI Helper: Custom Dropdowns ---
/**
 * Enhances a select element with a custom UI.
 * @param {HTMLElement} selectElement 
 */
function createCustomDropdown(selectElement) {
    if (!selectElement || selectElement.classList.contains('custom-dropdown-initialized')) return;
    selectElement.classList.add('hidden-select', 'custom-dropdown-initialized');
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';
    wrapper.dataset.for = selectElement.id;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-dropdown-trigger';
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    trigger.innerHTML = `<span>${selectedOption ? selectedOption.text : 'Select...'}</span><i class="ph ph-caret-down"></i>`;
    const menu = document.createElement('div');
    menu.className = 'custom-dropdown-menu';

    function buildOptions() {
        menu.innerHTML = '';
        Array.from(selectElement.options).forEach((opt, idx) => {
            const optEl = document.createElement('div');
            optEl.className = 'custom-dropdown-option';
            if (idx === selectElement.selectedIndex) optEl.classList.add('selected');
            optEl.textContent = opt.text;
            optEl.dataset.value = opt.value;
            optEl.onclick = (e) => {
                e.stopPropagation();
                selectElement.selectedIndex = idx;
                selectElement.dispatchEvent(new Event('change'));
                trigger.querySelector('span').textContent = opt.text;
                menu.querySelectorAll('.custom-dropdown-option').forEach(o => o.classList.remove('selected'));
                optEl.classList.add('selected');
                wrapper.classList.remove('open');
            };
            menu.appendChild(optEl);
        });
    }
    buildOptions();
    trigger.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-dropdown.open').forEach(d => { if (d !== wrapper) d.classList.remove('open'); });
        wrapper.classList.toggle('open');
    };
    document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) wrapper.classList.remove('open'); });
    selectElement.parentNode.insertBefore(wrapper, selectElement);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    wrapper.appendChild(selectElement);
    wrapper.refreshOptions = () => {
        buildOptions();
        const selectedOpt = selectElement.options[selectElement.selectedIndex];
        trigger.querySelector('span').textContent = selectedOpt ? selectedOpt.text : 'Select...';
    };
    return wrapper;
}

const modelSelectDropdown = createCustomDropdown(document.getElementById('modelSelect'));
const providerSelectDropdown = createCustomDropdown(document.getElementById('defaultProviderSelect'));

// --- Async Functions: Models & Status ---
async function updateModelDropdown(provider) {
    modelSelect.innerHTML = '';
    if (provider === 'gemini') {
        GEMINI_MODELS.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.label;
            modelSelect.appendChild(opt);
        });
    } else {
        try {
            const res = await fetch('/api/ollama/models');
            const data = await res.json();
            if (data.models && data.models.length > 0) {
                data.models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.name;
                    opt.textContent = m.name;
                    if (m.name.includes('llama3')) opt.selected = true;
                    modelSelect.appendChild(opt);
                });
            } else {
                modelSelect.innerHTML = '<option>No models found</option>';
            }
        } catch (e) {
            modelSelect.innerHTML = '<option>Error fetch models</option>';
        }
    }
    if (modelSelectDropdown) setTimeout(() => modelSelectDropdown.refreshOptions(), 100);
}

// --- API Connection Tests ---
window.testGeminiAPI = async () => {
    const btn = document.getElementById('testGeminiBtn');
    btn.textContent = '...';
    try {
        const key = document.getElementById('geminiKeyInput').value;
        if (key) await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ GEMINI_API_KEY: key }) });
        const res = await fetch('/api/test/gemini');
        const data = await res.json();
        if (data.success) { btn.textContent = '✓ OK'; btn.className = 'test-btn success'; showToast("Gemini Working"); }
        else { btn.textContent = '✗ Fail'; btn.className = 'test-btn error'; showToast("Gemini Error"); }
    } catch (e) { btn.textContent = '✗ Fail'; btn.className = 'test-btn error'; }
    setTimeout(() => { btn.textContent = 'Test'; btn.className = 'test-btn'; }, 3000);
};

window.testOllamaAPI = async () => {
    const btn = document.getElementById('testOllamaBtn');
    btn.textContent = '...';
    try {
        const url = document.getElementById('ollamaUrlInput').value;
        if (url) await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ OLLAMA_BASE_URL: url }) });
        const res = await fetch('/api/test/ollama');
        const data = await res.json();
        if (data.success) { btn.textContent = '✓ OK'; btn.className = 'test-btn success'; showToast("Ollama Working"); }
        else { btn.textContent = '✗ Fail'; btn.className = 'test-btn error'; showToast("Ollama Error"); }
    } catch (e) { btn.textContent = '✗ Fail'; btn.className = 'test-btn error'; }
    setTimeout(() => { btn.textContent = 'Test'; btn.className = 'test-btn'; }, 3000);
};

// Check Initial Status of Providers
async function checkProviderStatus() {
    try {
        const r1 = await fetch('/api/test/ollama'); const d1 = await r1.json();
        const oBtn = document.querySelector('.seg-btn[data-val="ollama"]');
        const oStat = document.getElementById('ollamaStatus');
        if (d1.success) { oStat.className = 'status-dot online'; oBtn.classList.remove('disabled'); }
        else { oStat.className = 'status-dot offline'; oBtn.classList.add('disabled'); }
    } catch (e) { }

    try {
        const r2 = await fetch('/api/test/gemini'); const d2 = await r2.json();
        const gBtn = document.querySelector('.seg-btn[data-val="gemini"]');
        const gStat = document.getElementById('geminiStatus');
        if (d2.success) { gStat.className = 'status-dot online'; gBtn.classList.remove('disabled'); }
        else { gStat.className = 'status-dot offline'; gBtn.classList.add('disabled'); }
    } catch (e) { }
}
checkProviderStatus();

// Initial Event Listeners
document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateModelDropdown(btn.dataset.val);
    });
});
