const socket=io();

        // Config State
        let config= {
            DEFAULT_PROVIDER: 'ollama'
        }

        ;

        // Static Models list for fallback if fetch fails or for Gemini
        const GEMINI_MODELS=[ {
            name: "gemini-1.5-flash", label: "Gemini 1.5 Flash (Fast)"
        }

        ,
        {
        name: "gemini-1.5-pro", label: "Gemini 1.5 Pro (Powerful)"
        }

        ,
        {
        name: "gemini-pro-vision", label: "Gemini Pro Vision"
        }

        ];

        // Elements
        const deviceNameInput=document.getElementById('deviceNameInput');
        const deviceList=document.getElementById('deviceList');
        const feedPanel=document.getElementById('feedPanel');
        const historyList=document.getElementById('historyList');
        const modelSelect=document.getElementById('modelSelect');

        // Init
        const savedName=localStorage.getItem('vision_device_name') || `Device-$ {
            Math.floor(Math.random() * 1000)
        }

        `;
        const isMobile=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        deviceNameInput.value=savedName;

        socket.emit('device_register', {
            name: savedName, isMobile
        });

        // Load Config
        fetch('/api/config').then(res=> res.json()).then(data=> {
                config=data;
                document.getElementById('ollamaUrlInput').value=data.OLLAMA_BASE_URL;
                document.getElementById('defaultProviderSelect').value=data.DEFAULT_PROVIDER;

                // Set Active Provider
                document.querySelectorAll('.seg-btn').forEach(b=> b.classList.remove('active'));
                document.querySelector(`.seg-btn[data-val="${data.DEFAULT_PROVIDER}"]`)?.classList.add('active');

                updateModelDropdown(data.DEFAULT_PROVIDER);
            });

        // --- Settings Logic ---
        const themeToggle=document.getElementById('themeToggle');

        if (localStorage.getItem('theme')==='light') {
            document.body.classList.add('light-theme');
            themeToggle.textContent='Switch to Dark Mode';
        }

        document.getElementById('settingsBtn').onclick=()=>document.getElementById('settingsModal').classList.add('open');
        window.closeSettings=()=>document.getElementById('settingsModal').classList.remove('open');

        // Universal Click Outside to Close
        document.querySelectorAll('.modal-backdrop').forEach(backdrop=> {
                backdrop.addEventListener('click', (e)=> {
                        if (e.target===backdrop) {
                            backdrop.classList.remove('open');
                        }
                    });
            });

        themeToggle.onclick=()=> {
            document.body.classList.toggle('light-theme');
            const isLight=document.body.classList.contains('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            themeToggle.textContent=isLight ? 'Switch to Dark Mode': 'Switch to Light Mode';
        }

        ;

        window.saveSettings=async ()=> {
            const payload= {
                GEMINI_API_KEY: document.getElementById('geminiKeyInput').value || undefined,
                    OLLAMA_BASE_URL: document.getElementById('ollamaUrlInput').value,
                    DEFAULT_PROVIDER: document.getElementById('defaultProviderSelect').value
            }

            ;

            const res=await fetch('/api/settings', {

                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }

                ,
                body: JSON.stringify(payload)
            });

        if (res.ok) {
            showToast("Settings Saved Successfully");
            setTimeout(closeSettings, 800);
            setTimeout(()=> location.reload(), 1200); // Reload to apply new keys if needed
        }
        }

        ;

        function showToast(msg) {
            const t=document.getElementById('toast');
            document.getElementById('toastMsg').innerText=msg;
            t.classList.add('show');
            setTimeout(()=> t.classList.remove('show'), 3000);
        }

        // --- Provider Switching ---
        document.querySelectorAll('.seg-btn').forEach(btn=> {
                btn.addEventListener('click', ()=> {
                        document.querySelectorAll('.seg-btn').forEach(b=> b.classList.remove('active'));
                        btn.classList.add('active');
                        const val=btn.dataset.val;
                        updateModelDropdown(val);
                    });
            });

        async function updateModelDropdown(provider) {
            modelSelect.innerHTML='';

            if (provider==='gemini') {

                // Populate Gemini
                GEMINI_MODELS.forEach(m=> {
                        const opt=document.createElement('option');
                        opt.value=m.name;
                        opt.textContent=m.label;
                        modelSelect.appendChild(opt);
                    });
            }

            else {
                // Populate Ollama
                await fetchOllamaModels();
            }
        }

        async function fetchOllamaModels() {
            try {
                const res=await fetch('/api/ollama/models');
                const data=await res.json();
                modelSelect.innerHTML='';

                if (data.models && data.models.length > 0) {
                    data.models.forEach(m=> {
                            const opt=document.createElement('option');
                            opt.value=m.name;
                            opt.textContent=m.name;
                            // Select llama3 if available, else first one
                            if (m.name.includes('llama3')) opt.selected=true;
                            modelSelect.appendChild(opt);
                        });
                }

                else {
                    // Fallback/Error state
                    const opt=document.createElement('option');
                    opt.textContent="No models found (Check Ollama)";
                    modelSelect.appendChild(opt);
                }
            }

            catch (e) {
                const opt=document.createElement('option');
                opt.textContent="Error fetching models";
                modelSelect.appendChild(opt);
            }
        }

        // --- Camera & Capture ---
        let stream=null;
        let previewInterval=null;
        const video=document.getElementById('video');
        const captureBtn=document.getElementById('captureBtn');

        // Orientation State
        let currentRotation=0;

        document.getElementById('camRotateBtn').onclick=()=> {
            currentRotation=(currentRotation + 90) % 360;

            video.style.transform=`rotate($ {
                    currentRotation
                }

                deg)`;

            // Fix fitting when rotated
            if (currentRotation % 180 !==0) {
                video.style.objectFit="contain";
            }

            else {
                video.style.objectFit="cover";
            }
        }

        ;

        document.getElementById('cameraToggle').onclick=async ()=> {
            if (stream) {
                stopCamera();
                document.getElementById('cameraToggle').textContent="Start Camera";
            }

            else {
                try {

                    // Try to force 4K or 1080p landscape.
                    // Note: 'environment' implies rear camera.
                    const constraints= {
                        video: {

                            facingMode: 'environment',
                            width: {
                                ideal: 3840
                            }

                            ,
                            // Try 4K
                            height: {
                                ideal: 2160
                            }
                        }
                    }

                    ;

                    stream=await navigator.mediaDevices.getUserMedia(constraints);
                    video.srcObject=stream;
                    document.getElementById('cameraContainer').classList.add('active');
                    captureBtn.style.display='block';
                    document.getElementById('cameraToggle').textContent="Stop Camera";

                    socket.emit('camera_status', {
                        active: true
                    });
                startPreviewBroadcast();

                // Reset rotation
                currentRotation=0;
                video.style.transform='none';

            }

            catch (e) {
                alert("Camera Error: " + e.message);
            }
        }
        }

        ;

        function stopCamera() {
            if (stream) stream.getTracks().forEach(t=> t.stop());
            stream=null;
            document.getElementById('cameraContainer').classList.remove('active');
            captureBtn.style.display='none';

            socket.emit('camera_status', {
                active: false
            });
        if (previewInterval) clearInterval(previewInterval);
        }

        function startPreviewBroadcast() {
            const canvas=document.createElement('canvas'); // Small canvas for preview
            // Auto-detect Aspect Ratio
            const isPortrait=video.videoHeight>video.videoWidth;

            if (isPortrait) {
                canvas.width=168;
                canvas.height=300;
            }

            else {
                canvas.width=300;
                canvas.height=168;
            }

            const ctx=canvas.getContext('2d');

            previewInterval=setInterval(()=> {
                    if ( !stream || !video.videoWidth) return;

                    // Draw respecting loose rotation simulation? 
                    // We'll just draw raw and let user rotate on their end if needed.
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    socket.emit('preview_frame', canvas.toDataURL('image/jpeg', 0.8));
                }

                , 500);
        }

        captureBtn.onclick=()=> {
            takePicture();
        }

        ;

        function takePicture() {
            if ( !stream) return;
            const canvas=document.createElement('canvas');
            // Use actual video dimensions
            canvas.width=video.videoWidth;
            canvas.height=video.videoHeight;

            const ctx=canvas.getContext('2d');

            // Rotation Handling (Basic)
            if (currentRotation !==0) {
                // Complex rotation logic might be needed here effectively
                // For now, simpler to just capture raw. The user can rotate preview.
                // Ideally backend rotates it or we use proper canvas transforms.
                // Let's rely on raw capture to avoid cutoff bugs.
            }

            ctx.drawImage(video, 0, 0);

            canvas.toBlob(blob=> {
                    const fd=new FormData();
                    fd.append('image', blob, 'capture.jpg');

                    // Get active provider from UI
                    const activeProvider=document.querySelector('.seg-btn.active').dataset.val;
                    fd.append('provider', activeProvider);
                    fd.append('modelName', modelSelect.value); // Send selected model (Generic)

                    fetch('/analyze', {
                        method: 'POST', body: fd
                    });
            }

            , 'image/jpeg', 0.95); // Higher quality JPEG
        }

        // --- Events ---
        // Local Device Settings (View Preferences)
        const deviceViewPrefs=JSON.parse(localStorage.getItem('vision_device_prefs') || '{}');

        window.setDeviceOrientation=(id, type)=> {
            deviceViewPrefs[id]=type;
            localStorage.setItem('vision_device_prefs', JSON.stringify(deviceViewPrefs));
            // Trigger re-render by asking server or manual (easier to just wait for next update or force reload? let's force re-render if we had the list)
            // But we don't have the full list stored locally easily. 
            // We can just rely on the next list update or reload.
            // Actually better to just toggle the class immediately if possible, but full re-render is cleaner.
            socket.emit('request_device_list'); // Add this event to server or valid existing one?
            // "device_register" emits list.
            // Let's just reload list from the data we just had?
            // Hack: trigger a dummy event or just wait. 
            // Better: Store lastDevices and re-render.
            if (window.lastDeviceList) renderDeviceList(window.lastDeviceList);
        }

        ;

        let lastDeviceList=[];

        function renderDeviceList(devices) {
            window.lastDeviceList=devices;
            deviceList.innerHTML='';

            devices.forEach(d=> {
                    const isMe=d.id===socket.id;

                    // Determine effective type: Local Pref > Device Reported
                    let viewType=deviceViewPrefs[d.id] || (d.isMobile ? 'portrait' : 'landscape');
                    const isPortrait=viewType==='portrait';
                    const previewClass=isPortrait ? 'mobile-portrait' : '';

                    const el=document.createElement('div');
                    el.className='device-item';

                    // Conditional display of preview
                    const previewHtml=d.hasCamera ? ` <div class="device-preview-wrapper" > <img id="preview-${d.id}" class="device-preview ${previewClass}" onclick="openPreview('${d.id}')" > <button class="quick-capture-btn" onclick="requestCapture('${d.id}')" title="Capture" > <i class="ph ph-camera" ></i> </button> </div> ` : '';

                    // Icons to toggle
                    const desktopIconClass= !isPortrait ? 'color:var(--accent);' : 'color:var(--text-secondary); opacity:0.5;';
                    const mobileIconClass=isPortrait ? 'color:var(--accent);' : 'color:var(--text-secondary); opacity:0.5;';

                    el.innerHTML=` <div style="display:flex; justify-content:space-between; align-items:center;" > <div style="display:flex; align-items:center; gap:8px;" > <strong class="device-name" >$ {
                        d.name
                    }

                    $ {
                        isMe ? '(You)' : ''
                    }

                    </strong> <div style="display:flex; gap:2px; background:var(--bg); padding:2px; border-radius:6px; border:1px solid var(--border);" > <i class="ph ph-desktop" style="cursor:pointer; padding:4px; ${desktopIconClass}" onclick="setDeviceOrientation('${d.id}', 'landscape')" title="View as Desktop" ></i> <i class="ph ph-device-mobile" style="cursor:pointer; padding:4px; ${mobileIconClass}" onclick="setDeviceOrientation('${d.id}', 'portrait')" title="View as Mobile" ></i> </div> </div> <span>$ {
                        d.hasCamera ? '📸' : '💤'
                    }

                    </span> </div> $ {
                        previewHtml
                    }

                    `;
                    deviceList.appendChild(el);
                });
        }

        socket.on('device_list', renderDeviceList);

        // Toggle Device Type Logic
        window.toggleDeviceType=()=> {
            socket.emit('toggle_device_type');
        }

        ;

        window.requestCapture=(targetId)=> {
            socket.emit('request_remote_capture', targetId);
            showToast("Capture Requested");
        }

        ;

        socket.on('device_preview', (data)=> {
                const img=document.getElementById(`preview-$ {
                        data.id
                    }

                    `);
                if (img) img.src=data.image;

                // Update Modal if open
                const largeImg=document.getElementById('largePreviewImg');

                if (document.getElementById('previewModal').classList.contains('open') && largeImg.dataset.target===data.id) {
                    largeImg.src=data.image;
                }
            });

        // Preview Modal Logic
        window.openPreview=(targetId)=> {
            if (targetId===socket.id) return; // Don't preview self (pointless loop)
            const modal=document.getElementById('previewModal');
            const largeImg=document.getElementById('largePreviewImg');
            largeImg.dataset.target=targetId;

            const src=document.getElementById(`preview-$ {
                    targetId
                }

                `).src;
            if (src) largeImg.src=src;

            document.getElementById('remoteCaptureBtn').onclick=()=> {
                socket.emit('request_remote_capture', targetId);
                showToast("Capture Requested");
            }

            ;

            modal.classList.add('open');
        }

        window.closePreview=()=>document.getElementById('previewModal').classList.remove('open');

        // Manual Rotation for Preview Modal
        let previewRotation=0;

        window.rotatePreview=()=> {
            previewRotation=(previewRotation + 90) % 360;
            const img=document.getElementById('largePreviewImg');

            img.style.transform=`rotate($ {
                    previewRotation
                }

                deg)`;
            // Reset scale logic if needed
        }

        ;


        // Trigger Check (Remote Capture Recv)
        socket.on('trigger_check', ()=> {
                if (stream) {
                    takePicture();
                    showToast("Remote Capture Triggered!");
                }
            });

        // Error Handling
        socket.on('error', (data)=> {
                showToast("Error: " + (data.message || "Unknown Error"));
            });

        socket.on('scan_failed', ()=> {
                document.getElementById('liveProcessing').style.display='none';
                document.getElementById('placeholder').style.display='flex';
                showToast("Scan Processing Failed");
            });

        // New Scan
        socket.on('new_scan', (data)=> {
                document.getElementById('placeholder').style.display='none';
                const proc=document.getElementById('liveProcessing');
                proc.style.display='block';
                document.getElementById('processingImg').src=data.image;

                if (window.innerWidth < 1024) window.scrollTo({
                    top: 0, behavior: 'smooth'
                });
        });

        // New Answer
        socket.on('new_answer', (data)=> {
                document.getElementById('liveProcessing').style.display='none';
                renderResultCard(data, true);
                fetchHistory(); // Update sync
            });

        // History
        socket.on('history_update', (hist)=> {
                // Render thumbs
                historyList.innerHTML='';

                hist.forEach(item=> {
                        const el=document.createElement('img');
                        el.src=item.image;
                        el.style="width:100px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer;";

                        el.onclick=()=> {
                            if ( !document.getElementById(`result-$ {
                                        item.id
                                    }

                                    `)) renderResultCard(item, false);

                            document.getElementById(`result-$ {
                                    item.id
                                }

                                `).scrollIntoView({
                                behavior: 'smooth'
                            });
                    }

                    ;
                    historyList.appendChild(el);
                });
        });

        function renderResultCard(data, prepend) {
            document.getElementById('placeholder').style.display='none';

            if (document.getElementById(`result-$ {
                        data.id
                    }

                    `)) return; // Duplicate check

            const div=document.createElement('div');
            div.className='result-card';

            div.id=`result-$ {
                data.id
            }

            `;

            div.innerHTML=` <div class="result-header"><span>$ {
                data.provider.toUpperCase()
            }

            ($ {
                    data.model || ''

                })</span><span>$ {
                data.timestamp
            }

            </span></div><div class="markdown-body">$ {
                marked.parse(data.answer ? data.answer.trim() : '')
            }

            </div>< !-- Follow Up Section --><div class="followup-section"><div id="thread-${data.id}" class="followup-thread"></div><div class="followup-input-container"><textarea class="followup-input" placeholder="Ask a follow-up..." id="input-${data.id}" rows="1" onkeydown="handleChatKey(event, '${data.id}')"></textarea><button class="primary-btn followup-btn" onclick="sendFollowUp('${data.id}')"><i class="ph ph-paper-plane-right"></i></button></div></div>`;

            if (prepend) feedPanel.insertBefore(div, document.getElementById('liveProcessing').nextSibling);
            else feedPanel.appendChild(div);

            // If data has history thread, load it
            if (data.thread && Array.isArray(data.thread)) {
                data.thread.forEach(msg=> {
                        addChatBubble(data.id, msg.prompt, 'user');
                        addChatBubble(data.id, msg.answer, 'ai');
                    });
            }
        }

        // --- Follow-up Logic ---
        window.handleChatKey=(e, id)=> {
            if (e.key==='Enter' && !e.shiftKey) {
                e.preventDefault();
                sendFollowUp(id);
            }
        }

        ;

        window.sendFollowUp=(parentId)=> {

            // Add Thinking Bubble
            const thread=document.getElementById(`thread-$ {
                    parentId
                }

                `);

            if (thread && !document.getElementById(`thinking-$ {
                        parentId
                    }

                    `)) {
                const thinking=document.createElement('div');

                thinking.id=`thinking-$ {
                    parentId
                }

                `;
                thinking.className='typing-indicator';
                thinking.innerHTML=`<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
                thread.appendChild(thinking);
                thread.scrollTop=thread.scrollHeight;
            }

            const input=document.getElementById(`input-$ {
                    parentId
                }

                `);
            const prompt=input.value.trim();
            if ( !prompt) return;

            // Optimistic UI
            addChatBubble(parentId, prompt, 'user');
            input.value='';

            const card=document.getElementById(`result-$ {
                    parentId
                }

                `);
            const contextText=card.querySelector('.markdown-body').innerText;

            socket.emit('ask_followup', {
                parentId,
                prompt,
                historyContext: contextText,
                model: config.DEFAULT_PROVIDER==='ollama' ? modelSelect.value : undefined // Optional model pass
            });
        }

        ;

        socket.on('followup_result', (data)=> {

                // Remove Thinking Bubble
                const thinking=document.getElementById(`thinking-$ {
                        data.parentId
                    }

                    `);
                if (thinking) thinking.remove();

                const thread=document.getElementById(`thread-$ {
                        data.parentId
                    }

                    `);

                if (thread) {
                    // Check last user message
                    const lastMsg=thread.lastElementChild;
                    const alreadyShowingUser=lastMsg && lastMsg.classList.contains('chat-user') && lastMsg.innerText===data.prompt;

                    if ( !alreadyShowingUser) addChatBubble(data.parentId, data.prompt, 'user');
                    addChatBubble(data.parentId, data.answer, 'ai');
                }
            });

        function addChatBubble(parentId, text, type) {
            const thread=document.getElementById(`thread-$ {
                    parentId
                }

                `);
            if ( !thread) return;
            const div=document.createElement('div');

            div.className=`chat-bubble chat-$ {
                type
            }

            `;
            div.innerHTML=type==='ai' ? marked.parse(text) : text;
            thread.appendChild(div);
        }

        // Helper to refresh history list
        function fetchHistory() {
            // Server emits it on change usually, but we can request it if needed.
        }

    
