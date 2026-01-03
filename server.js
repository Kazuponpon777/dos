const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const CaptureSession = require('./lib/capture-session');
const EventEmitter = require('events');
const { sanitizeFilename } = require('./lib/utils');
const configManager = require('./lib/config-manager');
const { authMiddleware, enableAuth, disableAuth, isAuthEnabled, getMaskedApiKey } = require('./lib/auth');
const BatchProcessor = require('./lib/batch-processor');

const app = express();
const PORT = 3000;
const OUTPUT_DIR = './output';

app.use(express.static('public'));
app.use(bodyParser.json());

// Event Bus for Internal Communication
const eventBus = new EventEmitter();

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Authentication Middleware (applied to API routes only)
app.use('/api', authMiddleware);

// SSE Clients Management
let clients = [];
function sendToClients(data) {
    clients.forEach(c => c.res.write(`data: ${JSON.stringify(data)}\n\n`));
}

// Hook up Event Bus to SSE
eventBus.on('log', (data) => sendToClients({ type: 'log', ...data }));
eventBus.on('progress', (data) => sendToClients({ type: 'progress', ...data }));
eventBus.on('trim_set', (data) => sendToClients({ type: 'trim_set', ...data }));
eventBus.on('completed', (data) => sendToClients({ type: 'completed', ...data }));
eventBus.on('error', (data) => sendToClients({ type: 'error', ...data }));

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const clientId = Date.now();
    clients.push({ id: clientId, res });
    req.on('close', () => clients = clients.filter(c => c.id !== clientId));
});

// Singleton Session
const session = new CaptureSession(eventBus);

// Batch Processor
const batchProcessor = new BatchProcessor(session, eventBus);

// Hook up batch events to SSE
eventBus.on('batch_progress', (data) => sendToClients({ type: 'batch_progress', ...data }));
eventBus.on('batch_complete', (data) => sendToClients({ type: 'batch_complete', ...data }));

// --- API Routes ---

// 1. Launch Browser
app.post('/api/browser/launch', async (req, res) => {
    try {
        await session.launchBrowser();
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});
app.get('/api/browser/launch', (req, res) => {
    res.status(405).json({ success: false, message: 'Method Not Allowed. Use POST.' });
});

// 2. Start Trimming Mode
app.post('/api/trim/start', async (req, res) => {
    try {
        await session.startTrimming();
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 3. Start Capture Loop
app.post('/api/capture/start', async (req, res) => {
    const { totalPages, delay } = req.body;
    try {
        // Run asynchronously
        session.startCapture({ totalPages, delay }); 
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 4. Pause
app.post('/api/capture/pause', (req, res) => {
    session.pauseCapture();
    res.json({ success: true });
});

// 5. Resume
app.post('/api/capture/resume', (req, res) => {
    session.resumeCapture();
    res.json({ success: true });
});

// 6. Stop & Save
app.post('/api/capture/stop', async (req, res) => {
    try {
        await session.stopAndSave();
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 7. Get History (list of saved PDFs)
app.get('/api/history', (req, res) => {
    try {
        if (!fs.existsSync(OUTPUT_DIR)) {
            return res.json({ success: true, files: [] });
        }
        
        const files = fs.readdirSync(OUTPUT_DIR)
            .filter(file => file.endsWith('.pdf'))
            .map(file => {
                const stats = fs.statSync(path.join(OUTPUT_DIR, file));
                // Convert to JST (UTC+9)
                const jstDate = new Date(stats.mtime.getTime() + 9 * 60 * 60 * 1000);
                return {
                    name: file,
                    size: stats.size,
                    date: jstDate.toISOString().slice(0, 16).replace('T', ' ')
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date)) // Newest first
            .slice(0, 10); // Limit to 10 files
        
        res.json({ success: true, files });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 8. Download a saved PDF
app.get('/api/download/:filename', (req, res) => {
    try {
        const filename = sanitizeFilename(req.params.filename);
        const filePath = path.join(OUTPUT_DIR, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        res.download(filePath, filename);
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 8.5 Delete a saved PDF
app.delete('/api/history/:filename', (req, res) => {
    try {
        const filename = sanitizeFilename(req.params.filename);
        const filePath = path.join(OUTPUT_DIR, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'ファイルが見つかりません' });
        }
        
        fs.unlinkSync(filePath);
        res.json({ success: true, message: 'ファイルを削除しました' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 9. Get Configuration
app.get('/api/config', (req, res) => {
    try {
        const config = configManager.getConfig();
        res.json({ success: true, config });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 10. Update Configuration
app.post('/api/config', (req, res) => {
    try {
        const updates = req.body;
        const success = configManager.updateConfig(updates);
        if (success) {
            // Also update the session config if applicable
            if (updates.slide) {
                if (updates.slide.delay !== undefined) {
                    session.config.delay = updates.slide.delay;
                }
                if (updates.slide.nextKey !== undefined) {
                    session.config.nextKey = updates.slide.nextKey;
                }
            }
            if (updates.capture) {
                if (updates.capture.retryAttempts !== undefined) {
                    session.config.retryAttempts = updates.capture.retryAttempts;
                }
                if (updates.capture.imageFormat !== undefined) {
                    session.config.imageFormat = updates.capture.imageFormat;
                }
                if (updates.capture.jpegQuality !== undefined) {
                    session.config.jpegQuality = updates.capture.jpegQuality;
                }
                if (updates.capture.enableOcr !== undefined) {
                    session.config.enableOcr = updates.capture.enableOcr;
                }
            }
            res.json({ success: true, config: configManager.getConfig() });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save config' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 11. Reset Configuration to defaults
app.post('/api/config/reset', (req, res) => {
    try {
        const config = configManager.resetConfig();
        res.json({ success: true, config });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// --- Auth Management Endpoints ---

// 12. Get Auth Status
app.get('/api/auth/status', (req, res) => {
    res.json({ 
        success: true, 
        enabled: isAuthEnabled(),
        maskedKey: getMaskedApiKey()
    });
});

// 13. Enable Auth (generates new API key)
app.post('/api/auth/enable', (req, res) => {
    try {
        const apiKey = enableAuth();
        res.json({ 
            success: true, 
            message: 'Authentication enabled',
            apiKey: apiKey,
            note: 'Save this API key! It will not be shown again in full.'
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 14. Disable Auth
app.post('/api/auth/disable', (req, res) => {
    try {
        disableAuth();
        res.json({ success: true, message: 'Authentication disabled' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// --- Batch Processing Endpoints ---

// 15. Add URLs to batch queue
app.post('/api/batch/add', (req, res) => {
    try {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ success: false, message: 'urls array required' });
        }
        const ids = batchProcessor.addToQueue(urls);
        res.json({ success: true, added: urls.length, ids });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 16. Get batch queue status
app.get('/api/batch/status', (req, res) => {
    res.json({ success: true, ...batchProcessor.getStatus() });
});

// 17. Start batch processing
app.post('/api/batch/start', async (req, res) => {
    try {
        if (!session.browser) {
            return res.status(400).json({ success: false, message: 'Launch browser first' });
        }
        const options = req.body || {};
        // Run async, don't wait
        batchProcessor.startProcessing(options).catch(e => {
            console.error('[Batch] Error:', e);
        });
        res.json({ success: true, message: 'Batch processing started' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 18. Stop batch processing
app.post('/api/batch/stop', (req, res) => {
    try {
        batchProcessor.stopProcessing();
        res.json({ success: true, message: 'Batch processing stopped' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 19. Clear batch queue
app.post('/api/batch/clear', (req, res) => {
    try {
        batchProcessor.clearQueue();
        res.json({ success: true, message: 'Queue cleared' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open this URL in your browser to control the capture tool.`);
    if (isAuthEnabled()) {
        console.log(`[Auth] API authentication is ENABLED. Key: ${getMaskedApiKey()}`);
    } else {
        console.log(`[Auth] API authentication is disabled (local mode).`);
    }
});
