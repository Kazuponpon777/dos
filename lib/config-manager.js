/**
 * Runtime Configuration Manager
 * Allows dynamic configuration changes via API without server restart
 */

const fs = require('fs');
const path = require('path');

// Default configuration
const defaultConfig = {
    // Target URL
    url: "https://magazine.rakuten.co.jp/read/C8A0B4CD227432A3F4F056A3429AD757",
    
    // Mode: 'scroll' or 'slide'
    mode: "slide",
    
    // Output settings
    outputDir: "./output",
    outputFilename: "result",
    
    // Browser settings
    browser: {
        headless: false,
        defaultViewport: {
            width: 1280,
            height: 800
        }
    },
    
    // Scroll mode settings
    scroll: {
        delay: 1000,
        outputType: "pdf"
    },
    
    // Slide mode settings
    slide: {
        nextKey: "ArrowRight",
        delay: 5000,
        maxPages: 100,
        clip: null
    },
    
    // Capture settings
    capture: {
        retryAttempts: 3,
        retryDelay: 1000,
        imageFormat: "png", // 'png' or 'jpeg'
        jpegQuality: 85,
        addMetadata: true
    }
};

// Runtime config path (JSON file for persistence)
const RUNTIME_CONFIG_PATH = path.join(__dirname, '..', 'runtime-config.json');

// Current runtime configuration (merged with defaults)
let runtimeConfig = { ...defaultConfig };

/**
 * Load runtime configuration from file
 */
function loadConfig() {
    try {
        if (fs.existsSync(RUNTIME_CONFIG_PATH)) {
            const savedConfig = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_PATH, 'utf8'));
            runtimeConfig = deepMerge(defaultConfig, savedConfig);
            console.log('[Config] Loaded runtime configuration from file');
        } else {
            runtimeConfig = { ...defaultConfig };
            console.log('[Config] Using default configuration');
        }
    } catch (e) {
        console.error('[Config] Error loading config:', e.message);
        runtimeConfig = { ...defaultConfig };
    }
    return runtimeConfig;
}

/**
 * Save runtime configuration to file
 */
function saveConfig(config) {
    try {
        runtimeConfig = deepMerge(runtimeConfig, config);
        fs.writeFileSync(RUNTIME_CONFIG_PATH, JSON.stringify(runtimeConfig, null, 2));
        console.log('[Config] Saved runtime configuration to file');
        return true;
    } catch (e) {
        console.error('[Config] Error saving config:', e.message);
        return false;
    }
}

/**
 * Get current runtime configuration
 */
function getConfig() {
    return { ...runtimeConfig };
}

/**
 * Update configuration (partial update supported)
 */
function updateConfig(updates) {
    runtimeConfig = deepMerge(runtimeConfig, updates);
    return saveConfig(runtimeConfig);
}

/**
 * Reset configuration to defaults
 */
function resetConfig() {
    runtimeConfig = { ...defaultConfig };
    if (fs.existsSync(RUNTIME_CONFIG_PATH)) {
        fs.unlinkSync(RUNTIME_CONFIG_PATH);
    }
    return runtimeConfig;
}

/**
 * Deep merge helper
 */
function deepMerge(target, source) {
    const output = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            output[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            output[key] = source[key];
        }
    }
    return output;
}

// Load config on module load
loadConfig();

module.exports = {
    getConfig,
    updateConfig,
    saveConfig,
    loadConfig,
    resetConfig,
    defaultConfig
};
