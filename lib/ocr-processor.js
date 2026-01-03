/**
 * OCR Module - Text extraction from images using Tesseract.js
 * Supports Japanese and English text recognition
 */

const Tesseract = require('tesseract.js');
const path = require('path');

class OCRProcessor {
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
        this.worker = null;
        this.isInitialized = false;
        this.language = 'jpn+eng'; // Japanese + English
    }

    /**
     * Initialize Tesseract worker
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            this.emitLog('OCRエンジンを初期化中...');
            
            this.worker = await Tesseract.createWorker(this.language, 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        // Progress update
                        const percent = Math.round(m.progress * 100);
                        if (percent % 20 === 0) {
                            this.emitLog(`OCR処理中... ${percent}%`);
                        }
                    }
                }
            });

            this.isInitialized = true;
            this.emitLog('OCRエンジン初期化完了');
        } catch (e) {
            this.emitLog(`OCR初期化エラー: ${e.message}`);
            throw e;
        }
    }

    /**
     * Extract text from an image buffer
     * @param {Buffer} imageBuffer - PNG or JPEG image buffer
     * @returns {Object} - { text, confidence, words }
     */
    async extractText(imageBuffer) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const result = await this.worker.recognize(imageBuffer);
            
            return {
                text: result.data.text,
                confidence: result.data.confidence,
                words: result.data.words.map(w => ({
                    text: w.text,
                    confidence: w.confidence,
                    bbox: w.bbox // Bounding box for text positioning
                }))
            };
        } catch (e) {
            this.emitLog(`OCRエラー: ${e.message}`);
            return { text: '', confidence: 0, words: [] };
        }
    }

    /**
     * Process multiple images and extract text
     * @param {Array} imageBuffers - Array of image buffers
     * @returns {Array} - Array of OCR results
     */
    async processImages(imageBuffers) {
        const results = [];
        
        for (let i = 0; i < imageBuffers.length; i++) {
            this.emitLog(`OCR処理中: ページ ${i + 1}/${imageBuffers.length}`);
            const buffer = imageBuffers[i].buffer || imageBuffers[i];
            const result = await this.extractText(buffer);
            results.push(result);
        }
        
        return results;
    }

    /**
     * Terminate the worker to free resources
     */
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
            this.emitLog('OCRエンジンを終了しました');
        }
    }

    /**
     * Set language for OCR
     * @param {string} lang - Language code (e.g., 'jpn', 'eng', 'jpn+eng')
     */
    setLanguage(lang) {
        this.language = lang;
        // Need to reinitialize if already initialized
        if (this.isInitialized) {
            this.terminate();
        }
    }

    /**
     * Emit log message
     */
    emitLog(message) {
        if (this.eventEmitter) {
            this.eventEmitter.emit('log', { message: `[OCR] ${message}` });
        }
        console.log(`[OCR] ${message}`);
    }
}

module.exports = OCRProcessor;
