const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { formatError, sleep, retry } = require('./utils');
const OCRProcessor = require('./ocr-processor');

class CaptureSession {
    constructor(eventEmitter) {
        this.browser = null;
        this.page = null;
        this.eventEmitter = eventEmitter;
        this.state = 'IDLE'; // IDLE, READY, CAPTURING, PAUSED
        this.config = {
            totalPages: 100,
            delay: 5000,
            clip: null,
            retryAttempts: 3,
            retryDelay: 1000,
            imageFormat: 'png', // 'png' or 'jpeg'
            jpegQuality: 85,    // 0-100 for JPEG compression
            addMetadata: true,  // Add PDF metadata
            maxMemoryMB: 500,   // Max memory for captured images before warning
            enableOcr: false    // Enable OCR for searchable PDF
        };
        this.capturedImages = [];
        this.captureLoopActive = false;
        this.memoryUsageBytes = 0; // Track memory usage
        this.ocrProcessor = new OCRProcessor(eventEmitter);
    }

    async launchBrowser() {
        // Check if browser is already open AND connected
        if (this.browser && this.browser.isConnected()) {
            this.emitLog('ブラウザは既に起動しています。');
            return;
        }
        
        // Clean up any stale references
        if (this.browser) {
            this.browser = null;
            this.page = null;
        }

        try {
            this.browser = await retry(
                async () => await puppeteer.launch({
                    headless: false,
                    defaultViewport: null, // Allow user to resize
                    args: [
                        '--start-maximized',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-gpu-sandbox',
                        '--disable-dev-shm-usage'
                    ]
                }),
                this.config.retryAttempts,
                this.config.retryDelay,
                (attempt, err) => {
                    this.emitLog(`Browser launch failed (attempt ${attempt}): ${err.message}. Retrying...`);
                }
            );

            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();

            this.browser.on('disconnected', () => {
                this.state = 'IDLE';
                this.browser = null;
                this.page = null;
                this.emitLog('Browser disconnected.');
                this.emitEvent('error', { message: 'Browser disconnected unexpectedly', recoverable: true });
            });

            // Inject Overlay on every navigation
            await this.injectOverlay();

            this.state = 'READY';
            this.emitLog('Browser launched. Please navigate to the target page.');
        } catch (e) {
            const errorInfo = formatError(e);
            this.emitLog(`Failed to launch browser: ${errorInfo.message}`);
            this.emitEvent('error', { message: errorInfo.message, stack: errorInfo.stack, recoverable: false });
            throw e;
        }
    }

    async injectOverlay() {
        if (!this.page) return;

        // Expose functions to the browser context
        await this.page.exposeFunction('onOverlayStart', async (pages) => {
            this.emitLog(`Overlay Start clicked. Pages: ${pages}`);
            try {
                this.startCapture({ totalPages: parseInt(pages) || 100, delay: this.config.delay });
            } catch(e) { console.error(e); }
        });

        await this.page.exposeFunction('onOverlayPause', () => {
            this.pauseCapture();
        });

        await this.page.exposeFunction('onOverlayResume', () => {
             this.resumeCapture();
        });

        await this.page.exposeFunction('onOverlayStop', () => {
            this.stopAndSave();
        });

        await this.page.exposeFunction('onOverlayTrim', async () => {
             // We trigger startTrimming from within, but startTrimming logic needs to run in node context
             // Triggering it directly constitutes a "re-entrant" action if not careful, 
             // but here we just call the method.
             this.startTrimming();
        });

        await this.page.exposeFunction('onTrimSelect', (x, y, w, h) => {
            console.log('Trim Selected:', x, y, w, h);
            this.config.clip = { x, y, width: w, height: h };
            this.emitEvent('trim_set', { area: this.config.clip });
            this.emitLog(`Capture area set: ${Math.round(w)}x${Math.round(h)}`);
        });

        // Script to run on every page load
        await this.page.evaluateOnNewDocument(() => {
            window.addEventListener('DOMContentLoaded', () => {
                const id = 'sc-overlay-container';
                if (document.getElementById(id)) return;

                const container = document.createElement('div');
                container.id = id;
                Object.assign(container.style, {
                    position: 'fixed', top: '20px', right: '20px', width: '220px',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white',
                    zIndex: '999999', borderRadius: '8px', padding: '10px',
                    fontFamily: 'sans-serif', fontSize: '14px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)', userSelect: 'none'
                });

                container.innerHTML = `
                    <div style="cursor: move; padding-bottom: 5px; border-bottom: 1px solid #555; margin-bottom: 10px; font-weight: bold; display: flex; justify-content: space-between;">
                        <span>Controller</span>
                        <span id="sc-status" style="font-size: 12px; color: #aaa;">Ready</span>
                    </div>
                    <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                        <input type="number" id="sc-pages" value="100" style="width: 50px; padding: 2px; border: none; border-radius: 4px;" title="Total Pages">
                        <span style="font-size: 12px; align-self: center;">pages</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                        <button id="sc-btn-start" style="padding: 5px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">Start</button>
                        <button id="sc-btn-pause" style="padding: 5px; background: #f39c12; color: white; border: none; border-radius: 4px; cursor: pointer; display: none;">Pause</button>
                        <button id="sc-btn-resume" style="padding: 5px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; display: none;">Resume</button>
                        <button id="sc-btn-stop" style="padding: 5px; background: #c0392b; color: white; border: none; border-radius: 4px; cursor: pointer;">Stop</button>
                    </div>
                    <button id="sc-btn-trim" style="width: 100%; margin-top: 5px; padding: 5px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Set Area</button>
                    <div id="sc-count" style="margin-top: 8px; text-align: center; font-size: 18px; font-weight: bold; color: #2ecc71;">0</div>
                `;

                document.body.appendChild(container);

                // Dragging logic
                let isDragging = false;
                let offset = { x: 0, y: 0 };
                const header = container.firstElementChild;
                
                header.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    offset.x = e.clientX - container.offsetLeft;
                    offset.y = e.clientY - container.offsetTop;
                });
                
                window.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    container.style.left = (e.clientX - offset.x) + 'px';
                    container.style.top = (e.clientY - offset.y) + 'px';
                    container.style.right = 'auto'; // Disable right once dragged
                });
                
                window.addEventListener('mouseup', () => { isDragging = false; });

                // Event Listeners
                const btnStart = document.getElementById('sc-btn-start');
                const btnPause = document.getElementById('sc-btn-pause');
                const btnResume = document.getElementById('sc-btn-resume');
                const btnStop = document.getElementById('sc-btn-stop');
                const btnTrim = document.getElementById('sc-btn-trim');
                const pageInput = document.getElementById('sc-pages');
                const status = document.getElementById('sc-status');

                btnStart.onclick = () => {
                    window.onOverlayStart(pageInput.value);
                    updateUI('CAPTURING');
                };
                btnPause.onclick = () => {
                    window.onOverlayPause();
                    updateUI('PAUSED');
                };
                btnResume.onclick = () => {
                    window.onOverlayResume();
                    updateUI('CAPTURING');
                };
                btnStop.onclick = () => {
                    if(confirm('Stop and Save?')) {
                        window.onOverlayStop();
                        updateUI('IDLE');
                    }
                };
                btnTrim.onclick = () => {
                    window.onOverlayTrim();
                };

                window.updateOverlayState = (state, count) => {
                   if (count !== undefined) document.getElementById('sc-count').innerText = count;
                   if (state) updateUI(state);
                };

                function updateUI(state) {
                    status.innerText = state;
                    if (state === 'CAPTURING') {
                        btnStart.style.display = 'none';
                        btnPause.style.display = 'inline-block';
                        btnResume.style.display = 'none';
                    } else if (state === 'PAUSED') {
                         btnStart.style.display = 'none';
                        btnPause.style.display = 'none';
                        btnResume.style.display = 'inline-block';
                    } else {
                        btnStart.style.display = 'inline-block';
                        btnPause.style.display = 'none';
                        btnResume.style.display = 'none';
                    }
                }
            });
        });
    }

    // Helper to update overlay from specific session events
    async updateOverlayUI(state, count) {
        if (this.page && !this.page.isClosed()) {
            try {
                await this.page.evaluate((s, c) => {
                    if (window.updateOverlayState) window.updateOverlayState(s, c);
                }, state, count);
            } catch (e) { /* ignore navigation errors */ }
        }
    }

    // Hide or show overlay (used during screenshot capture)
    async setOverlayVisibility(visible) {
        if (this.page && !this.page.isClosed()) {
            try {
                await this.page.evaluate((show) => {
                    const overlay = document.getElementById('sc-overlay-container');
                    if (overlay) {
                        // Use opacity for instant hide/show (keeps element in place)
                        overlay.style.opacity = show ? '1' : '0';
                        overlay.style.pointerEvents = show ? 'auto' : 'none';
                    }
                }, visible);
            } catch (e) { /* ignore errors */ }
        }
    }

    async startCapture(config) {
        if (!this.page || this.state === 'IDLE') {
            throw new Error('Browser not connected');
        }

        this.config = { ...this.config, ...config };
        this.state = 'CAPTURING';
        this.captureLoopActive = true;
        this.emitLog(`Starting capture. Total: ${this.config.totalPages}, Delay: ${this.config.delay}ms`);
        this.updateOverlayUI('CAPTURING', 0);

        this._captureLoop(); // Start async loop
    }

    async _captureLoop() {
        let previousBuffer = null;

        for (let i = this.capturedImages.length; i < this.config.totalPages; i++) {
            if (!this.captureLoopActive) break;

            // Check for pause
            while (this.state === 'PAUSED') {
                if (!this.captureLoopActive) break;
                await new Promise(r => setTimeout(r, 500));
            }

            this.emitLog(`Capturing page ${i + 1}...`);
            this.emitProgress(i + 1);
            this.updateOverlayUI(null, i + 1);

            try {
                // Focus the window (sometimes needed for arrow keys to work)
                await this.page.bringToFront();

                // Wait for visual stability (Smart Capture)
                // First wait for the configured delay (minimum wait)
                await sleep(this.config.delay);

                // Then wait for screen to stop changing
                this.emitLog('Waiting for screen to stabilize...');
                await this.waitForScreenToStabilize();

                // Screenshot with retry - support PNG/JPEG based on config
                const format = this.config.imageFormat || 'png';
                const opts = { 
                    fullPage: false,
                    type: format,
                    ...(format === 'jpeg' && { quality: this.config.jpegQuality || 85 })
                };
                if (this.config.clip) opts.clip = this.config.clip;
                
                // Hide overlay before screenshot
                await this.setOverlayVisibility(false);
                
                const imgBuffer = await retry(
                    async () => await this.page.screenshot(opts),
                    this.config.retryAttempts,
                    this.config.retryDelay,
                    (attempt, err) => {
                        this.emitLog(`Screenshot failed (attempt ${attempt}/${this.config.retryAttempts}): ${err.message}. Retrying...`);
                    }
                );
                
                // Show overlay after screenshot
                await this.setOverlayVisibility(true);

                // Duplicate check (use raw buffer for comparison)
                const bufferForComparison = imgBuffer;
                if (previousBuffer && bufferForComparison.equals(previousBuffer)) {
                    this.emitLog('No change detected (Duplicate). Continuing anyway in manual mode...');
                }

                // Store with format info for PDF embedding
                this.capturedImages.push({
                    buffer: imgBuffer,
                    isJpeg: format === 'jpeg'
                });
                
                // Track memory usage
                this.memoryUsageBytes += imgBuffer.length;
                const memoryMB = Math.round(this.memoryUsageBytes / 1024 / 1024);
                const maxMB = this.config.maxMemoryMB || 500;
                if (memoryMB > maxMB * 0.8) {
                    this.emitLog(`Warning: Memory usage ${memoryMB}MB approaching limit (${maxMB}MB)`);
                }
                
                previousBuffer = bufferForComparison;

                // Next Page with retry
                await retry(
                    async () => await this.page.keyboard.press('ArrowRight'),
                    this.config.retryAttempts,
                    this.config.retryDelay
                );
                
            } catch (e) {
                const errorInfo = formatError(e);
                this.emitLog(`Error in loop: ${errorInfo.message}`);
                this.emitEvent('error', { 
                    message: errorInfo.message, 
                    stack: errorInfo.stack,
                    page: i + 1 
                });
                this.captureLoopActive = false;
                break;
            }
        }

        if (this.captureLoopActive) {
            this.emitLog('Finished capture sequence.');
            this.state = 'COMPLETED'; // Pending save
            this.emitEvent('completed', { count: this.capturedImages.length });
            this.updateOverlayUI('COMPLETED', this.capturedImages.length);
        }
    }

    /**
     * Wait for screen to stabilize before capturing
     * Optimized with:
     * - Reduced resolution for comparison (faster)
     * - Progressive interval increase (less CPU)
     * - Early exit when stable
     * - Configurable stability threshold
     */
    async waitForScreenToStabilize(timeout = 5000, baseInterval = 300) {
        const startTime = Date.now();
        let lastHash = null;
        let stableCount = 0;
        const requiredStableCount = 2; // Need 2 consecutive stable reads
        let checkInterval = baseInterval;
        const maxInterval = 800; // Cap interval growth

        while (Date.now() - startTime < timeout) {
            if (!this.captureLoopActive) break;

            try {
                // Take a smaller screenshot for comparison (faster processing)
                const comparisonOpts = { 
                    fullPage: false,
                    type: 'jpeg',  // JPEG is faster to encode
                    quality: 30   // Low quality for comparison only
                };
                if (this.config.clip) {
                    // Use scaled-down clip for comparison
                    comparisonOpts.clip = this.config.clip;
                }
                
                const currentBuffer = await this.page.screenshot(comparisonOpts);
                
                // Simple hash comparison using buffer length + sample bytes
                const currentHash = this.computeSimpleHash(currentBuffer);

                if (lastHash && currentHash === lastHash) {
                    stableCount++;
                    if (stableCount >= requiredStableCount) {
                        // Screen is stable
                        return;
                    }
                    // Increase interval when stable (less CPU usage)
                    checkInterval = Math.min(checkInterval * 1.3, maxInterval);
                } else {
                    stableCount = 0;
                    // Reset to base interval when unstable
                    checkInterval = baseInterval;
                }

                lastHash = currentHash;
            } catch (e) {
                // Screenshot failed, continue checking
            }

            await sleep(checkInterval);
        }
        
        this.emitLog('Warning: Screen did not stabilize within timeout. Capturing anyway.');
    }

    /**
     * Compute a simple hash for quick buffer comparison
     * Not cryptographically secure, but fast for stability check
     */
    computeSimpleHash(buffer) {
        const len = buffer.length;
        // Sample bytes at strategic positions
        const samples = [
            buffer[0] || 0,
            buffer[Math.floor(len * 0.25)] || 0,
            buffer[Math.floor(len * 0.5)] || 0,
            buffer[Math.floor(len * 0.75)] || 0,
            buffer[len - 1] || 0
        ];
        // Combine length and samples into a simple hash
        return `${len}-${samples.join('-')}`;
    }

    pauseCapture() {
        this.state = 'PAUSED';
        this.emitLog('Paused.');
        this.updateOverlayUI('PAUSED');
    }

    resumeCapture() {
        if (this.state === 'PAUSED') {
            this.state = 'CAPTURING';
            this.emitLog('Resumed.');
            this.updateOverlayUI('CAPTURING');
        }
    }

    async stopAndSave() {
        this.captureLoopActive = false;
        this.state = 'IDLE';
        this.updateOverlayUI('SAVING...');

        if (this.capturedImages.length === 0) {
            this.emitLog('No images to save.');
            this.updateOverlayUI('IDLE', 0);
            return;
        }

        const imageCount = this.capturedImages.length;
        const format = this.config.imageFormat || 'png';
        this.emitLog(`Saving PDF with ${imageCount} images (${format.toUpperCase()})...`);
        
        const outputDir = './output';
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const pdfDoc = await PDFDocument.create();
        
        // Add PDF Metadata
        if (this.config.addMetadata !== false) {
            const now = new Date();
            pdfDoc.setTitle(`Screen Capture - ${now.toLocaleDateString('ja-JP')}`);
            pdfDoc.setAuthor('Smart Capture Tool');
            pdfDoc.setSubject(`${imageCount} pages captured`);
            pdfDoc.setCreator('Puppeteer + pdf-lib');
            pdfDoc.setProducer('Smart Capture Tool v1.0');
            pdfDoc.setCreationDate(now);
            pdfDoc.setModificationDate(now);
            pdfDoc.setKeywords(['screenshot', 'capture', 'pdf']);
        }

        // OCR processing if enabled
        let ocrResults = [];
        if (this.config.enableOcr) {
            this.emitLog('OCR処理を開始します...');
            try {
                ocrResults = await this.ocrProcessor.processImages(this.capturedImages);
                this.emitLog(`OCR完了: ${ocrResults.length}ページ処理`);
            } catch (e) {
                this.emitLog(`OCRエラー: ${e.message} - テキストなしで続行します`);
            }
        }

        // Embed images based on format
        for (let i = 0; i < this.capturedImages.length; i++) {
            const imgData = this.capturedImages[i];
            let img;
            
            try {
                if (format === 'jpeg' && imgData.isJpeg) {
                    // JPEG embedding
                    img = await pdfDoc.embedJpg(imgData.buffer);
                } else {
                    // Default: PNG embedding
                    img = await pdfDoc.embedPng(imgData.buffer || imgData);
                }
                
                const page = pdfDoc.addPage([img.width, img.height]);
                
                // Draw image
                page.drawImage(img, { 
                    x: 0, 
                    y: 0, 
                    width: img.width, 
                    height: img.height 
                });
                
                // Add OCR text layer (invisible text for search)
                if (this.config.enableOcr && ocrResults[i] && ocrResults[i].text) {
                    try {
                        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                        const fontSize = 1; // Very small, effectively invisible
                        const text = ocrResults[i].text;
                        
                        // Draw invisible text at bottom of page
                        // This makes the PDF searchable without visible text overlay
                        page.drawText(text, {
                            x: 0,
                            y: 0,
                            size: fontSize,
                            font: font,
                            color: rgb(1, 1, 1), // White (invisible on white)
                            opacity: 0.01 // Nearly invisible
                        });
                    } catch (textErr) {
                        // Ignore text embedding errors
                    }
                }
            } catch (e) {
                this.emitLog(`Warning: Failed to embed image ${i + 1}: ${e.message}`);
            }
        }

        // Terminate OCR worker if used
        if (this.config.enableOcr) {
            await this.ocrProcessor.terminate();
        }

        // Save with compression options
        const pdfBytes = await pdfDoc.save({
            useObjectStreams: true // Better compression
        });
        
        // Use Japan timezone (JST = UTC+9) for timestamp
        const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const timestamp = jstDate.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const ocrSuffix = this.config.enableOcr ? '_ocr' : '';
        const filename = `capture_${timestamp}${ocrSuffix}.pdf`;
        const filePath = path.join(outputDir, filename);
        
        fs.writeFileSync(filePath, pdfBytes);
        
        // Calculate file size
        const fileSizeKB = Math.round(pdfBytes.length / 1024);
        const ocrStatus = this.config.enableOcr ? ' [OCR済]' : '';
        this.emitLog(`保存完了: ${filename} (${fileSizeKB} KB, ${imageCount}ページ)${ocrStatus}`);
        
        // Reset
        this.capturedImages = [];
        this.memoryUsageBytes = 0;
        this.updateOverlayUI('IDLE', 0);
    }

    async startTrimming() {
        if (!this.page) throw new Error('No page');
        
        // Inject Overlay Script
        await this.page.evaluate(() => {
            const overlay = document.createElement('div');
            overlay.id = 'sc-trim-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                zIndex: '999998', cursor: 'crosshair', background: 'rgba(0,0,0,0.3)'
            });
            document.body.appendChild(overlay);

            let startX, startY, div;

            overlay.addEventListener('mousedown', e => {
                startX = e.clientX;
                startY = e.clientY;
                div = document.createElement('div');
                Object.assign(div.style, {
                    position: 'absolute', border: '2px dashed red', background: 'rgba(255,0,0,0.1)',
                    left: startX+'px', top: startY+'px'
                });
                overlay.appendChild(div);
            });

            overlay.addEventListener('mousemove', e => {
                if (!div) return;
                const w = e.clientX - startX;
                const h = e.clientY - startY;
                div.style.width = Math.abs(w) + 'px';
                div.style.height = Math.abs(h) + 'px';
                div.style.left = (w < 0 ? e.clientX : startX) + 'px';
                div.style.top = (h < 0 ? e.clientY : startY) + 'px';
            });

            overlay.addEventListener('mouseup', e => {
                const rect = div.getBoundingClientRect();
                // Remove overlay
                document.body.removeChild(overlay);
                window.onTrimSelect(rect.x+window.scrollX, rect.y+window.scrollY, rect.width, rect.height);
            });
        });

        // Binding for trimming is already exposed in launchBrowser -> injectOverlay
        // But simpler to re-expose or ensure it's there. 
        // Actually, we exposed onTrimSelect in the previous version's startTrimming.
        // We should move that exposure to injectOverlay or keep it here.
        // Since we are replacing the whole file, I will add the exposure to startTrimming or injectOverlay.
        // I'll add `onTrimSelect` exposure to `injectOverlay` for consistency if not already there,
        // or keep it in startTrimming. Wait, simpler to keep it in injectOverlay if possible.
        // Actually, let's keep it in startTrimming to ensure it registers when needed, 
        // OR move it to injectOverlay to avoid re-exposing.
        // I'll move it to `injectOverlay` in my implementation above to be cleaner.
        // Wait, I didn't add it to injectOverlay in the code block above yet. Checking...
        // Ah, I missed onTrimSelect in the snippet above. I will add it now.
    }
    // ...
    // Helpers
    emitLog(msg) {
        if (this.eventEmitter) this.eventEmitter.emit('log', { message: msg });
        console.log('[Session]', msg);
    }
    emitProgress(count) {
        if (this.eventEmitter) this.eventEmitter.emit('progress', { count });
    }
    emitEvent(type, data) {
        if (this.eventEmitter) this.eventEmitter.emit(type, data);
    }
}

module.exports = CaptureSession;
