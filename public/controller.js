const state = {
    isCapturing: false,
    isPaused: false,
    browserConnected: false,
    totalPages: 100
};

// Elements
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnStop = document.getElementById('btn-stop');
const btnBrowser = document.getElementById('btn-browser');
const btnTrim = document.getElementById('btn-trim');
const statusDot = document.querySelector('.status-dot');
const statusText = document.getElementById('status-text');
const capturedCount = document.getElementById('captured-count');
const totalPagesInput = document.getElementById('total-pages');
const delayInput = document.getElementById('delay-input');
const trimStatus = document.getElementById('trim-status');
const trimCoords = document.getElementById('trim-coords');

// Progress bar elements
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressCurrent = document.getElementById('progress-current');
const progressPercent = document.getElementById('progress-percent');
const progressTotal = document.getElementById('progress-total');

// History elements
const historyList = document.getElementById('history-list');

// Settings elements
const directionSelect = document.getElementById('direction-select');
const retryAttemptsInput = document.getElementById('retry-attempts');
const imageFormatSelect = document.getElementById('image-format');
const enableOcrCheckbox = document.getElementById('enable-ocr');
const btnSaveConfig = document.getElementById('btn-save-config');
const btnResetConfig = document.getElementById('btn-reset-config');

// API Helper
async function api(endpoint, method = 'POST', body = {}) {
    try {
        const res = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        console.error(e);
        return { success: false, message: e.message };
    }
}

// Event Listeners
btnBrowser.addEventListener('click', async () => {
    updateStatus('busy', 'Launching...');
    const res = await api('/api/browser/launch');
    if (res.success) {
        state.browserConnected = true;
        updateStatus('active', 'Ready');
        btnBrowser.disabled = true;
        btnTrim.disabled = false;
        btnStart.disabled = false;
    }
});

btnTrim.addEventListener('click', async () => {
    updateStatus('busy', 'Select Area...');
    const res = await api('/api/trim/start');
    if (res.success) {
         // The server waits for the selection. We can poll or wait for SSE.
         // For now, assume user selects on browser.
    }
});

btnStart.addEventListener('click', async () => {
    // If not paused, it's a fresh start
    if (!state.isPaused) {
        const total = parseInt(totalPagesInput.value) || 100;
        const delay = parseFloat(delayInput.value) * 1000;
        
        const res = await api('/api/capture/start', 'POST', {
            totalPages: total,
            delay: delay
        });

        if (res.success) {
            state.isCapturing = true;
            state.totalPages = total;
            progressTotal.textContent = total;
            progressContainer.classList.remove('hidden');
            updateProgress(0, total);
            toggleCaptureUI(true);
        }
    } else {
        // Resume
        await api('/api/capture/resume');
        state.isPaused = false;
        toggleCaptureUI(true);
    }
});

btnPause.addEventListener('click', async () => {
    await api('/api/capture/pause');
    state.isPaused = true;
    toggleCaptureUI(false, true); // paused state
});

btnStop.addEventListener('click', async () => {
    if (confirm('Finish capturing and save PDF?')) {
        updateStatus('busy', 'Saving...');
        await api('/api/capture/stop');
        state.isCapturing = false;
        state.isPaused = false;
        toggleCaptureUI(false);
        updateStatus('active', 'Saved');
    }
});

function toggleCaptureUI(capturing, paused = false) {
    if (capturing) {
        btnStart.classList.add('hidden');
        btnPause.classList.remove('hidden');
        btnStop.disabled = false;
        btnTrim.disabled = true;
        updateStatus('active', 'Capturing...');
    } else if (paused) {
        btnStart.classList.remove('hidden');
        btnStart.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Resume`;
        btnPause.classList.add('hidden');
        updateStatus('busy', 'Paused');
    } else {
        btnStart.classList.remove('hidden');
        btnStart.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Start`;
        btnPause.classList.add('hidden');
        btnStop.disabled = true;
        btnTrim.disabled = false;
    }
}

function updateStatus(type, text) {
    statusDot.className = `status-dot ${type}`;
    statusText.textContent = text;
}

// Validating Inputs
delayInput.addEventListener('change', () => {
    let val = parseFloat(delayInput.value);
    if (val < 0.5) delayInput.value = 0.5;
});

// SSE for Real-time Updates (Page Count, Trim Data, etc.)
const eventSource = new EventSource('/events');

eventSource.onopen = () => {
    updateStatus('active', 'Connected');
    // Check if browser is already running (not implemented yet in backend, but good practice)
};

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'progress') {
        capturedCount.innerText = data.count;
        updateProgress(data.count, state.totalPages);
    } else if (data.type === 'trim_set') {
        trimStatus.classList.remove('hidden');
        trimCoords.innerText = `${data.area.width}x${data.area.height}`;
        updateStatus('active', 'Area Set');
    } else if (data.type === 'completed') {
        state.isCapturing = false;
        toggleCaptureUI(false);
        updateStatus('success', 'Done!');
        alert('Capture Completed & PDF Saved.');
        progressContainer.classList.add('hidden');
        loadHistory();
    } else if (data.type === 'error') {
        console.error('[Server Error]', data.message, data.stack || '');
        updateStatus('error', 'Error');
        if (data.recoverable) {
            // Show recoverable error notification
            showNotification(`Error: ${data.message}. You may need to restart.`, 'warning');
        } else {
            // Show critical error
            showNotification(`Critical Error: ${data.message}`, 'error');
            state.isCapturing = false;
            state.browserConnected = false;
            toggleCaptureUI(false);
            btnBrowser.disabled = false;
        }
    } else if (data.type === 'log') {
        console.log('[Server]', data.message);
    }
};

// Notification helper
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        padding: 12px 20px; border-radius: 8px;
        background: ${type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--primary)'};
        color: white; font-size: 14px; z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Progress bar update function
function updateProgress(current, total) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = `${percent}%`;
    progressCurrent.textContent = current;
    progressPercent.textContent = `${percent}%`;
}

// Load history from server
async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        
        if (data.success && data.files.length > 0) {
            historyList.innerHTML = '';
            data.files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <div>
                        <div class="history-item-name">${file.name}</div>
                        <div class="history-item-date">${file.date}</div>
                    </div>
                    <div class="history-item-actions">
                        <button class="history-item-download" onclick="downloadFile('${file.name}')">DL</button>
                        <button class="history-item-delete" onclick="deleteFile('${file.name}')">✕</button>
                    </div>
                `;
                historyList.appendChild(item);
            });
        } else {
            historyList.innerHTML = '<p style="font-size: 11px; color: var(--text-muted); text-align: center;">キャプチャ履歴がありません</p>';
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

// Download file
function downloadFile(filename) {
    window.open(`/api/download/${encodeURIComponent(filename)}`, '_blank');
}

// Delete file
async function deleteFile(filename) {
    if (!confirm(`「${filename}」を削除しますか？`)) return;
    
    try {
        const res = await fetch(`/api/history/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showNotification('ファイルを削除しました', 'success');
            loadHistory(); // Reload history
        } else {
            showNotification('削除に失敗しました', 'error');
        }
    } catch (e) {
        console.error('Failed to delete:', e);
        showNotification('削除に失敗しました', 'error');
    }
}

// --- Configuration Management ---

// Load configuration from server
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        
        if (data.success && data.config) {
            const config = data.config;
            
            // Apply to UI elements
            if (config.slide) {
                if (config.slide.delay) {
                    delayInput.value = config.slide.delay / 1000;
                }
                if (config.slide.nextKey) {
                    directionSelect.value = config.slide.nextKey;
                }
                if (config.slide.maxPages) {
                    totalPagesInput.value = config.slide.maxPages;
                    state.totalPages = config.slide.maxPages;
                }
            }
            if (config.capture) {
                if (config.capture.retryAttempts) {
                    retryAttemptsInput.value = config.capture.retryAttempts;
                }
                if (config.capture.imageFormat) {
                    imageFormatSelect.value = config.capture.imageFormat;
                }
                if (config.capture.enableOcr !== undefined) {
                    enableOcrCheckbox.checked = config.capture.enableOcr;
                }
            }
            console.log('[Config] Loaded from server');
        }
    } catch (e) {
        console.error('Failed to load config:', e);
    }
}

// Save configuration to server
async function saveConfig() {
    try {
        const config = {
            slide: {
                delay: parseFloat(delayInput.value) * 1000,
                nextKey: directionSelect.value,
                maxPages: parseInt(totalPagesInput.value)
            },
            capture: {
                retryAttempts: parseInt(retryAttemptsInput.value),
                imageFormat: imageFormatSelect.value,
                enableOcr: enableOcrCheckbox.checked
            }
        };
        
        const res = await api('/api/config', 'POST', config);
        if (res.success) {
            showNotification('Settings saved!', 'success');
        } else {
            showNotification('Failed to save settings', 'error');
        }
    } catch (e) {
        console.error('Failed to save config:', e);
        showNotification('Failed to save settings', 'error');
    }
}

// Reset configuration to defaults
async function resetConfig() {
    if (!confirm('Reset all settings to defaults?')) return;
    
    try {
        const res = await api('/api/config/reset', 'POST', {});
        if (res.success) {
            loadConfig(); // Reload UI with defaults
            showNotification('Settings reset to defaults', 'info');
        }
    } catch (e) {
        console.error('Failed to reset config:', e);
    }
}

// Event listeners for config buttons
if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', saveConfig);
}
if (btnResetConfig) {
    btnResetConfig.addEventListener('click', resetConfig);
}

// Load history and config on page load
loadHistory();
loadConfig();

eventSource.onerror = () => {
    updateStatus('error', 'Connection Lost');
};
