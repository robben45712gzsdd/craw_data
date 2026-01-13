const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

let browser = null;

// Khởi tạo Puppeteer browser
async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    return browser;
}

// API lấy HTML của trang web (dùng Puppeteer để render JavaScript)
app.post('/api/fetch-page', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const browserInstance = await initBrowser();
        const page = await browserInstance.newPage();
        
        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Navigate to URL
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Wait for content to load
        await page.waitForTimeout(2000);
        
        // Get the full HTML
        const html = await page.content();
        
        // Get base URL for relative paths
        const baseUrl = new URL(url).origin;
        
        await page.close();
        
        res.json({ 
            html, 
            baseUrl,
            originalUrl: url 
        });
    } catch (error) {
        console.error('Error fetching page:', error);
        res.status(500).json({ error: error.message });
    }
});

// API crawl dữ liệu theo CSS selectors
app.post('/api/crawl', async (req, res) => {
    try {
        const { url, selectors, crawlMultiple } = req.body;
        
        if (!url || !selectors || selectors.length === 0) {
            return res.status(400).json({ error: 'URL and selectors are required' });
        }

        const browserInstance = await initBrowser();
        const page = await browserInstance.newPage();
        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        await page.waitForTimeout(2000);
        
        const html = await page.content();
        const $ = cheerio.load(html);
        
        let results = [];
        
        if (crawlMultiple) {
            // Crawl nhiều item (ví dụ: danh sách sản phẩm)
            const firstSelector = selectors[0];
            const elements = $(firstSelector.selector);
            
            elements.each((index, element) => {
                const row = {};
                selectors.forEach(sel => {
                    // Tìm element tương ứng trong cùng context
                    let value = '';
                    const el = $(element);
                    
                    if (sel.selector === firstSelector.selector) {
                        value = extractValue($, el, sel.attribute);
                    } else {
                        // Tìm trong siblings hoặc parent
                        const found = el.find(sel.selector).first();
                        if (found.length) {
                            value = extractValue($, found, sel.attribute);
                        } else {
                            // Tìm trong parent container
                            const parent = el.parent();
                            const siblingFound = parent.find(sel.selector).first();
                            if (siblingFound.length) {
                                value = extractValue($, siblingFound, sel.attribute);
                            }
                        }
                    }
                    row[sel.name] = value;
                });
                results.push(row);
            });
        } else {
            // Crawl single values
            const row = {};
            selectors.forEach(sel => {
                const elements = $(sel.selector);
                if (sel.multiple) {
                    const values = [];
                    elements.each((i, el) => {
                        values.push(extractValue($, $(el), sel.attribute));
                    });
                    row[sel.name] = values.join(', ');
                } else {
                    row[sel.name] = extractValue($, elements.first(), sel.attribute);
                }
            });
            results.push(row);
        }
        
        await page.close();
        
        res.json({ 
            success: true, 
            data: results,
            count: results.length 
        });
    } catch (error) {
        console.error('Error crawling:', error);
        res.status(500).json({ error: error.message });
    }
});

function extractValue($, element, attribute) {
    if (!element || element.length === 0) return '';
    
    switch (attribute) {
        case 'text':
            return element.text().trim();
        case 'html':
            return element.html();
        case 'href':
            return element.attr('href') || '';
        case 'src':
            return element.attr('src') || '';
        case 'value':
            return element.val() || '';
        default:
            return element.attr(attribute) || element.text().trim();
    }
}

// API xuất Excel
app.post('/api/export-excel', async (req, res) => {
    try {
        const { data, filename } = req.body;
        
        if (!data || data.length === 0) {
            return res.status(400).json({ error: 'No data to export' });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Crawled Data');
        
        // Add headers
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);
        
        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' }
        };
        headerRow.alignment = { horizontal: 'center' };
        
        // Add data rows
        data.forEach(row => {
            const values = headers.map(h => row[h]);
            worksheet.addRow(values);
        });
        
        // Auto-fit columns
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const cellValue = cell.value ? cell.value.toString() : '';
                maxLength = Math.max(maxLength, cellValue.length);
            });
            column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        });
        
        // Add borders
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'crawled_data'}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// API lấy CSS selector từ element path
app.post('/api/get-selector', async (req, res) => {
    try {
        const { url, elementPath } = req.body;
        res.json({ selector: elementPath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy để tránh CORS khi load images và resources
app.get('/proxy', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            return res.status(400).send('URL required');
        }
        
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        res.setHeader('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (error) {
        res.status(500).send('Proxy error');
    }
});

// Cleanup on exit
process.on('SIGINT', async () => {
    if (browser) {
        await browser.close();
    }
    process.exit();
});

app.listen(PORT, () => {
    console.log(`🚀 Web Crawler Tool running at http://localhost:${PORT}`);
    console.log(`📋 Mở trình duyệt và truy cập http://localhost:${PORT}`);
});
