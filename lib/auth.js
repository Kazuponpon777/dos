/**
 * Authentication Middleware
 * Simple API key authentication for the capture tool
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Auth configuration file path
const AUTH_CONFIG_PATH = path.join(__dirname, '..', 'auth-config.json');

// Default config (no auth required by default for local use)
const defaultAuthConfig = {
    enabled: false,
    apiKey: null,  // Will be auto-generated if enabled
    allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000']
};

let authConfig = { ...defaultAuthConfig };

/**
 * Load auth configuration from file
 */
function loadAuthConfig() {
    try {
        if (fs.existsSync(AUTH_CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(AUTH_CONFIG_PATH, 'utf8'));
            authConfig = { ...defaultAuthConfig, ...config };
        }
    } catch (e) {
        console.error('[Auth] Error loading config:', e.message);
    }
    return authConfig;
}

/**
 * Save auth configuration to file
 */
function saveAuthConfig(config) {
    try {
        authConfig = { ...authConfig, ...config };
        fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify(authConfig, null, 2));
        return true;
    } catch (e) {
        console.error('[Auth] Error saving config:', e.message);
        return false;
    }
}

/**
 * Generate a new API key
 */
function generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Enable authentication with a new API key
 */
function enableAuth() {
    const apiKey = generateApiKey();
    saveAuthConfig({ enabled: true, apiKey });
    console.log('[Auth] Authentication enabled. API Key:', apiKey);
    return apiKey;
}

/**
 * Disable authentication
 */
function disableAuth() {
    saveAuthConfig({ enabled: false, apiKey: null });
    console.log('[Auth] Authentication disabled');
}

/**
 * Authentication middleware
 * Checks for API key in header: X-API-Key
 */
function authMiddleware(req, res, next) {
    // Load latest config
    loadAuthConfig();
    
    // Skip auth if disabled
    if (!authConfig.enabled) {
        return next();
    }
    
    // Skip auth for static files and events
    if (req.path === '/' || req.path.match(/\.(html|css|js|png|jpg|ico)$/) || req.path === '/events') {
        return next();
    }
    
    // Check API key
    const providedKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!providedKey) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication required. Provide X-API-Key header.' 
        });
    }
    
    if (providedKey !== authConfig.apiKey) {
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid API key' 
        });
    }
    
    next();
}

/**
 * Check if auth is enabled
 */
function isAuthEnabled() {
    loadAuthConfig();
    return authConfig.enabled;
}

/**
 * Get current API key (masked for display)
 */
function getMaskedApiKey() {
    loadAuthConfig();
    if (!authConfig.apiKey) return null;
    return authConfig.apiKey.substring(0, 8) + '...' + authConfig.apiKey.slice(-4);
}

// Load config on module load
loadAuthConfig();

module.exports = {
    authMiddleware,
    enableAuth,
    disableAuth,
    isAuthEnabled,
    getMaskedApiKey,
    generateApiKey
};
