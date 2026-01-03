const screenshot = require('screenshot-desktop');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

async function handleDesktopCapture(config, logCallback) {
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    logCallback('Starting Desktop Capture...');
    logCallback('Please focus the target window immediately! Starting in 5 seconds...');

    await new Promise(resolve => setTimeout(resolve, 5000));

    const images = [];
    const maxPages = config.slide.maxPages || 20;
    const nextKey = config.slide.nextKey; // 'ArrowRight' or 'ArrowLeft'

    // AppleScript key codes
    // 124: Right Arrow
    // 123: Left Arrow
    const keyCode = nextKey === 'ArrowLeft' ? 123 : 124;

    for (let i = 0; i < maxPages; i++) {
        logCallback(`Capturing slide ${i + 1}...`);

        try {
            const imgBuffer = await screenshot();
            images.push(imgBuffer);

            // Send key press
            await pressKey(keyCode);

            // Wait for transition
            await new Promise(resolve => setTimeout(resolve, config.slide.delay));

        } catch (err) {
            logCallback(`Error capturing screen: ${err.message}`);
            break;
        }
    }

    if (images.length > 0) {
        logCallback(`Generating PDF from ${images.length} slides...`);
        const pdfDoc = await PDFDocument.create();

        for (const imgBuffer of images) {
            const img = await pdfDoc.embedPng(imgBuffer);
            // Use screen dimensions or image dimensions
            const page = pdfDoc.addPage([img.width, img.height]);
            page.drawImage(img, {
                x: 0, y: 0, width: img.width, height: img.height,
            });
        }

        const pdfBytes = await pdfDoc.save();
        const outputPath = path.join(outputDir, `${config.outputFilename}_desktop.pdf`);
        fs.writeFileSync(outputPath, pdfBytes);
        logCallback(`PDF saved to ${outputPath}`);
    } else {
        logCallback('No slides captured.');
    }
}

function pressKey(keyCode) {
    return new Promise((resolve, reject) => {
        const script = `tell application "System Events" to key code ${keyCode}`;
        exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(error);
                return;
            }
            resolve();
        });
    });
}

module.exports = { handleDesktopCapture };
