/**
 * Batch Processing Module
 * Handle multiple URL captures in sequence
 */

const fs = require('fs');
const path = require('path');

class BatchProcessor {
    constructor(captureSession, eventEmitter) {
        this.session = captureSession;
        this.eventEmitter = eventEmitter;
        this.queue = [];
        this.isProcessing = false;
        this.currentIndex = 0;
        this.results = [];
    }

    /**
     * Add URLs to the batch queue
     * @param {Array} items - Array of { url, options } objects
     */
    addToQueue(items) {
        const newItems = items.map((item, idx) => ({
            id: Date.now() + idx,
            url: typeof item === 'string' ? item : item.url,
            options: typeof item === 'string' ? {} : (item.options || {}),
            status: 'pending',
            result: null
        }));
        this.queue.push(...newItems);
        this.emitProgress();
        return newItems.map(i => i.id);
    }

    /**
     * Clear the queue
     */
    clearQueue() {
        if (this.isProcessing) {
            throw new Error('Cannot clear queue while processing');
        }
        this.queue = [];
        this.results = [];
        this.currentIndex = 0;
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            total: this.queue.length,
            completed: this.results.length,
            current: this.currentIndex,
            queue: this.queue.map(item => ({
                id: item.id,
                url: item.url,
                status: item.status
            })),
            results: this.results
        };
    }

    /**
     * Start processing the queue
     */
    async startProcessing(options = {}) {
        if (this.isProcessing) {
            throw new Error('Already processing');
        }
        if (this.queue.length === 0) {
            throw new Error('Queue is empty');
        }

        this.isProcessing = true;
        this.currentIndex = 0;
        this.results = [];

        const { 
            pagesPerUrl = 10, 
            delayBetweenUrls = 2000 
        } = options;

        this.emitLog(`Starting batch processing of ${this.queue.length} URLs...`);

        for (let i = 0; i < this.queue.length; i++) {
            if (!this.isProcessing) {
                this.emitLog('Batch processing cancelled.');
                break;
            }

            const item = this.queue[i];
            this.currentIndex = i;
            item.status = 'processing';
            this.emitProgress();

            try {
                this.emitLog(`[${i + 1}/${this.queue.length}] Processing: ${item.url}`);

                // Navigate to URL
                if (this.session.page) {
                    await this.session.page.goto(item.url, { 
                        waitUntil: 'networkidle2',
                        timeout: 30000 
                    });
                    
                    // Wait for page to settle
                    await new Promise(r => setTimeout(r, 2000));

                    // Take a single screenshot for batch mode
                    const outputDir = './output/batch';
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }

                    const filename = `batch_${Date.now()}_${this.sanitizeForFilename(item.url)}.png`;
                    const filePath = path.join(outputDir, filename);
                    
                    await this.session.page.screenshot({ 
                        path: filePath, 
                        fullPage: true 
                    });

                    item.status = 'completed';
                    item.result = { 
                        success: true, 
                        filename,
                        path: filePath
                    };
                    this.results.push(item.result);
                    this.emitLog(`✓ Saved: ${filename}`);
                } else {
                    throw new Error('Browser not launched');
                }

            } catch (e) {
                item.status = 'failed';
                item.result = { 
                    success: false, 
                    error: e.message 
                };
                this.results.push(item.result);
                this.emitLog(`✗ Failed: ${item.url} - ${e.message}`);
            }

            this.emitProgress();

            // Delay between URLs
            if (i < this.queue.length - 1 && this.isProcessing) {
                await new Promise(r => setTimeout(r, delayBetweenUrls));
            }
        }

        this.isProcessing = false;
        this.emitLog(`Batch processing complete. ${this.results.filter(r => r.success).length}/${this.queue.length} succeeded.`);
        this.emitEvent('batch_complete', this.getStatus());
    }

    /**
     * Stop processing
     */
    stopProcessing() {
        if (this.isProcessing) {
            this.isProcessing = false;
            this.emitLog('Stopping batch processing...');
        }
    }

    /**
     * Sanitize URL for use in filename
     */
    sanitizeForFilename(url) {
        return url
            .replace(/^https?:\/\//, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 50);
    }

    /**
     * Emit log message
     */
    emitLog(message) {
        if (this.eventEmitter) {
            this.eventEmitter.emit('log', { message: `[Batch] ${message}` });
        }
        console.log(`[Batch] ${message}`);
    }

    /**
     * Emit event
     */
    emitEvent(type, data) {
        if (this.eventEmitter) {
            this.eventEmitter.emit(type, data);
        }
    }

    /**
     * Emit progress update
     */
    emitProgress() {
        this.emitEvent('batch_progress', {
            current: this.currentIndex + 1,
            total: this.queue.length,
            status: this.getStatus()
        });
    }
}

module.exports = BatchProcessor;
