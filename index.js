const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./config');

(async () => {
    // 出力ディレクトリの作成
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
    }

    console.log(`Launching browser... Target: ${config.url}, Mode: ${config.mode}`);

    const browser = await puppeteer.launch({
        headless: config.browser.headless,
        defaultViewport: config.browser.defaultViewport
    });

    const page = await browser.newPage();

    try {
        await page.goto(config.url, { waitUntil: 'networkidle0' });
        console.log('Page loaded.');

        // ログイン等のための待機 (ユーザー入力待ち)
        // ログイン等のための待機 (ユーザー入力待ち) & ページ数確認
        let customMaxPages = null;
        if (config.browser.headless === false) {
            console.log('Please log in or navigate to the target content if needed.');
            
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            await new Promise(resolve => {
                rl.question('Enter total pages to capture (or press Enter to use config default): ', (answer) => {
                    const parsed = parseInt(answer, 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        customMaxPages = parsed;
                        console.log(`Set total pages to: ${customMaxPages}`);
                    } else {
                        console.log('Using default max pages from config.');
                    }
                    rl.close();
                    resolve();
                });
            });
        }

        if (config.mode === 'scroll') {
            await handleScrollMode(page);
        } else if (config.mode === 'slide') {
            await handleSlideMode(page, customMaxPages);
        } else {
            console.error('Invalid mode specified in config.js');
        }

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
})();

async function handleScrollMode(page) {
    console.log('Starting Scroll Mode...');

    // ページの最後までスクロールしてLazy Loadをトリガー
    await autoScroll(page);

    const outputPath = path.join(config.outputDir, `${config.outputFilename}`);

    if (config.scroll.outputType === 'pdf') {
        await page.pdf({
            path: `${outputPath}.pdf`,
            format: 'A4',
            printBackground: true
        });
        console.log(`PDF saved to ${outputPath}.pdf`);
    } else {
        await page.screenshot({
            path: `${outputPath}.png`,
            fullPage: true
        });
        console.log(`Screenshot saved to ${outputPath}.png`);
    }
}

async function handleSlideMode(page, customMaxPages) {
    console.log('Starting Slide Mode...');
    const images = [];
    let previousBuffer = null;
    const maxPages = customMaxPages || config.slide.maxPages || 100;

    for (let i = 0; i < maxPages; i++) {
        // スクリーンショットをバッファとして取得
        const screenshotOptions = { fullPage: false };
        if (config.slide.clip) {
            screenshotOptions.clip = config.slide.clip;
        }
        const imgBuffer = await page.screenshot(screenshotOptions);

        // 前の画像と比較して、変化がなければ終了
        if (previousBuffer && imgBuffer.equals(previousBuffer)) {
            console.log('No change detected in screen content. Reached end of slides.');
            break;
        }

        images.push(imgBuffer);
        previousBuffer = imgBuffer;

        // 次のページへ
        await page.keyboard.press(config.slide.nextKey);
        await new Promise(resolve => setTimeout(resolve, config.slide.delay));
    }

    // 画像を結合してPDFを作成
    if (images.length > 0) {
        console.log(`Generating PDF from ${images.length} slides...`);
        const pdfDoc = await PDFDocument.create();

        for (const imgBuffer of images) {
            const img = await pdfDoc.embedPng(imgBuffer);
            const page = pdfDoc.addPage([img.width, img.height]);
            page.drawImage(img, {
                x: 0,
                y: 0,
                width: img.width,
                height: img.height,
            });
        }

        const pdfBytes = await pdfDoc.save();
        const outputPath = path.join(config.outputDir, `${config.outputFilename}_slides.pdf`);
        fs.writeFileSync(outputPath, pdfBytes);
        console.log(`PDF saved to ${outputPath}`);
    } else {
        console.log('No slides captured.');
    }
}

async function autoScroll(page) {
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
    // スクロール完了後、少し待つ
    await new Promise(resolve => setTimeout(resolve, config.scroll.delay));
}
