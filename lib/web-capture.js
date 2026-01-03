const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function handleWebCapture(config, logCallback, eventEmitter) {
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    logCallback(`Launching browser... Target: ${config.url}`);

    const browser = await puppeteer.launch({
        headless: false, // Always visible as per request
        defaultViewport: { width: 1280, height: 800 }
    });

    // Detect unexpected browser disconnection
    browser.on('disconnected', () => {
        logCallback('Browser disconnected.');
    });

    const page = await browser.newPage();

    try {
        // Changed to domcontentloaded for faster initial load
        await page.goto(config.url, { waitUntil: 'domcontentloaded' });
        logCallback('Page loaded (domcontentloaded).');

        if (config.loginRequired) {
            logCallback('Waiting for login... Please log in and click "Continue" in the dashboard.');
            await new Promise(resolve => {
                eventEmitter.once('continue', resolve);
            });
            logCallback('Resuming capture process...');
        } else {
            // Small delay if no login required
            await new Promise(r => setTimeout(r, 2000));
        }

        if (config.mode === 'web-scroll') {
            await runScrollMode(page, config, outputDir, logCallback);
        } else if (config.mode === 'web-slide') {
            await runSlideMode(page, config, outputDir, logCallback);
        }

    } catch (error) {
        logCallback(`Error: ${error.message}`);
        // Don't throw here, just log. The finally block will close the browser if it's still open.
    } finally {
        if (browser.isConnected()) {
            await browser.close();
            logCallback('Browser closed.');
        }
    }
}

async function runScrollMode(page, config, outputDir, log) {
    log('Starting Scroll Mode...');
    try {
        await autoScroll(page, config.scroll.delay);

        const outputPath = path.join(outputDir, `${config.outputFilename}`);

        if (config.scroll.outputType === 'pdf') {
            await page.pdf({
                path: `${outputPath}.pdf`,
                format: 'A4',
                printBackground: true
            });
            log(`PDF saved to ${outputPath}.pdf`);
        } else {
            await page.screenshot({
                path: `${outputPath}.png`,
                fullPage: true
            });
            log(`Screenshot saved to ${outputPath}.png`);
        }
    } catch (error) {
        log(`Error during Scroll Mode: ${error.message}`);
        if (error.message.includes('Session closed') || error.message.includes('Target closed')) {
            log('Browser was closed during capture.');
        } else {
            throw error;
        }
    }
}

async function runSlideMode(page, config, outputDir, log) {
    log('Starting Slide Mode...');
    const images = [];
    let previousBuffer = null;
    const maxPages = config.slide.maxPages || 20;

    try {
        for (let i = 0; i < maxPages; i++) {
            log(`Capturing slide ${i + 1}...`);

            try {
                const imgBuffer = await page.screenshot({ fullPage: false });

                if (previousBuffer && imgBuffer.equals(previousBuffer)) {
                    log('No change detected. Reached end of slides.');
                    break;
                }

                images.push(imgBuffer);
                previousBuffer = imgBuffer;

                await page.keyboard.press(config.slide.nextKey);
                await new Promise(resolve => setTimeout(resolve, config.slide.delay));

            } catch (innerError) {
                if (innerError.message.includes('Session closed') || innerError.message.includes('Target closed')) {
                    log('Browser closed during slide capture. Stopping capture loop.');
                    break; // Exit the loop to save whatever we have
                }
                throw innerError; // Re-throw other errors
            }
        }
    } catch (error) {
        log(`Error during Slide Mode: ${error.message}`);
    }

    // Save whatever we captured, even if incomplete
    if (images.length > 0) {
        log(`Generating PDF from ${images.length} slides...`);
        try {
            const pdfDoc = await PDFDocument.create();

            for (const imgBuffer of images) {
                const img = await pdfDoc.embedPng(imgBuffer);
                const page = pdfDoc.addPage([img.width, img.height]);
                page.drawImage(img, {
                    x: 0, y: 0, width: img.width, height: img.height,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const outputPath = path.join(outputDir, `${config.outputFilename}_slides.pdf`);
            fs.writeFileSync(outputPath, pdfBytes);
            log(`PDF saved to ${outputPath}`);
        } catch (pdfError) {
            log(`Error generating PDF: ${pdfError.message}`);
        }
    } else {
        log('No slides captured.');
    }
}

async function autoScroll(page, delay) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
    await new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = { handleWebCapture };
