/**
 * Utility functions for the Screen Capture Tool
 */

/**
 * Format error with stack trace for logging
 * @param {Error} error - The error object
 * @returns {object} Formatted error object
 */
function formatError(error) {
    return {
        message: error.message || 'Unknown error',
        stack: error.stack || '',
        timestamp: new Date().toISOString()
    };
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for async functions
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @param {number} delayMs - Delay between retries in ms (default: 1000)
 * @param {Function} onRetry - Callback on retry (optional)
 * @returns {Promise<any>}
 */
async function retry(fn, maxRetries = 3, delayMs = 1000, onRetry = null) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                if (onRetry) onRetry(attempt, error);
                await sleep(delayMs);
            }
        }
    }
    throw lastError;
}

/**
 * Sanitize filename to prevent path traversal
 * @param {string} filename - Input filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[\/\\]/g, '') // Remove slashes
        .replace(/\.\./g, '')   // Remove double dots
        .replace(/[<>:"|?*]/g, '') // Remove invalid chars
        .slice(0, 255);        // Limit length
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Bytes count
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get timestamp string for filenames
 * @returns {string}
 */
function getTimestamp() {
    const now = new Date();
    return now.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
}

module.exports = {
    formatError,
    sleep,
    retry,
    sanitizeFilename,
    formatBytes,
    getTimestamp
};
