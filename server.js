const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 10000;

// Session configuration
app.use(session({
    secret: 'crawler-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
    }
}));

app.use(express.json({ limit: '1000mb' }));

// Serve static files but disable index serving
app.use(express.static('public', { index: false }));

// Database user (password hashed with bcrypt)
const users = {
    'admin': '$2b$10$Xk6AiwL5mGFQngrapQ5FvOO.WaJKIi.NH6QowlPGcbFZZ6NBX8OV2', 
    'user': '$2b$10$DPVtrQ5fshS2RDrUtt5lHeIRY4AurvgnIdp3B79/DntFhtvNYWfG2'   
};

// Middleware to check authentication
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ success: false, message: 'Vui lòng đăng nhập!' });
}

// Generate proper password hash (for reference)
async function generateHash(password) {
    return await bcrypt.hash(password, 10);
}

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng nhập tài khoản và mật khẩu!' 
            });
        }

        // Check if user exists
        const hashedPassword = users[username];
        if (!hashedPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản hoặc mật khẩu không đúng!' 
            });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, hashedPassword);
        if (!isValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản hoặc mật khẩu không đúng!' 
            });
        }

        // Set session
        req.session.userId = username;
        req.session.loginTime = new Date().toISOString();

        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!',
            user: username
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Lỗi server!' 
        });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Đăng xuất thành công!' });
});

// Check authentication endpoint
app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ 
            authenticated: true, 
            user: req.session.userId 
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Homepage route - require authentication (MUST BE BEFORE static middleware)
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

// Site configurations
const SITE_CONFIGS = {
    tratencongty: {
        name: 'Tra Tên Công Ty',
        baseUrl: 'https://www.tratencongty.com',
        listUrl: (page) => `https://www.tratencongty.com/?page=${page}`,
        listSelector: '.search-results',
        detailSelector: '.jumbotron',
        selectors: {
            name: (el) => el.find('a').first().text().trim(),
            detailUrl: (el) => el.find('a').first().attr('href'),
            // Detail page selectors will be different
        }
    },
    trangvang: {
        name: 'Trang Vàng Việt Nam',
        baseUrl: 'https://trangvangvietnam.com',
        listUrl: (page, baseUrl) => {
            if (page === 1) return baseUrl;
            return `${baseUrl}?page=${page}`;
        },
        listSelector: '.company-item',
        detailSelector: '.company-detail',
        selectors: {
            // Defined in parseTrangvangList
        }
    },
    hsct: {
        name: 'HSCT',
        baseUrl: 'https://hsctvn.com',
        listUrl: (page, baseUrl) => {
            if (page === 1) return baseUrl;
            // Nếu có baseUrl với query, thêm &p= cho page
            if (baseUrl && baseUrl.includes('?')) {
                return `${baseUrl}&p=${page - 1}`;
            }
            // Default fallback
            return `https://hsctvn.com/?page=${page}`;
        },
        listSelector: 'li',
        detailSelector: '.box_content',
        selectors: {
            name: (el) => el.find('h3 a').text().trim(),
            detailUrl: (el) => el.find('h3 a').attr('href'),
            taxCode: (el) => el.find('div').text().match(/Mã số thuế: (\d+)/)?.[1] || '',
            address: (el) => el.find('div em').parent().text().replace('Địa chỉ:', '').split('Mã số thuế')[0].trim()
        }
    }
};

// Tạo axios instance với headers giả lập browser
const client = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    },
    timeout: 30000
});

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Parser for tratencongty.com
function parseTratencongtyList($, siteConfig) {
    const companies = [];
    
    $(siteConfig.listSelector).each((index, element) => {
        const $result = $(element);
        const nameLink = $result.find('a').first();
        const paragraph = $result.find('p').first();

        if (nameLink.length) {
            const name = nameLink.text().trim();
            const detailUrl = nameLink.attr('href');
            const html = paragraph.length ? paragraph.html() : $result.html();
            
            // Lấy mã số thuế - text sau ảnh base64
            let taxCode = '';
            const taxMatch = html.match(/Mã số thuế:.*?<\/a>\s*-\s*Đại diện pháp luật:\s*([^<]+)/);
            if (taxMatch) {
                const beforeDaiDien = html.split('Đại diện pháp luật:')[0];
                const afterMaSo = beforeDaiDien.split('</a>').pop();
                taxCode = afterMaSo.replace(/<[^>]*>/g, '').replace('-', '').trim();
            }

            const legalRepMatch = html.match(/Đại diện pháp luật:\s*([^<]+)/i);
            const legalRep = legalRepMatch ? legalRepMatch[1].trim() : '';

            const addressMatch = html.match(/Địa chỉ:\s*([^<]+)/i);
            const address = addressMatch ? addressMatch[1].trim() : '';

            companies.push({
                name,
                detailUrl,
                tradingName: '',
                taxCode,
                legalRep,
                address,
                phone: '',
                email: '',
                website: '',
                status: '',
                foundedDate: '',
                activeDate: '',
                registrationNumber: ''
            });
        }
    });
    
    return companies;
}

// Parser for trangvangvietnam.com
function parseTrangvangList($, siteConfig) {
    const companies = [];
    
    // Find all company containers with exact class structure
    $('div.w-100.h-auto.shadow.rounded-3.bg-white.p-2.mb-3').each((index, element) => {
        const $container = $(element);
        
        // Company name and URL from h2.fs-5 a
        const $nameLink = $container.find('h2.fs-5 a').first();
        const name = $nameLink.text().trim();
        const detailUrl = $nameLink.attr('href');
        
        if (name && detailUrl) {
            // Extract address from location-dot icon's parent small tag
            let address = '';
            $container.find('i.fa-location-dot').parent('small').each((i, el) => {
                address = $(el).text().replace(/\s+/g, ' ').trim();
            });
            
            // Extract phone numbers from tel: links
            const phones = [];
            $container.find('a[href^="tel:"]').each((i, phoneLink) => {
                const phoneText = $(phoneLink).text().trim();
                if (phoneText) phones.push(phoneText);
            });
            
            // Extract industry from nganh_listing_txt
            let industry = '';
            const $industrySpan = $container.find('.nganh_listing_txt');
            if ($industrySpan.length > 0) {
                industry = $industrySpan.text().trim();
            }
            
            companies.push({
                name,
                detailUrl: detailUrl.startsWith('http') ? detailUrl : `https://trangvangvietnam.com${detailUrl}`,
                tradingName: '',
                taxCode: '',
                legalRep: '',
                address,
                phone: phones.join(', '),
                email: '',
                website: '',
                status: '',
                foundedDate: '',
                activeDate: '',
                registrationNumber: '',
                industry
            });
        }
    });
    
    return companies;
}

// Parser for hsctvn.com
function parseHsctList($, siteConfig) {
    const companies = [];
    
    // Find all <li> elements that contain <h3><a> structure
    $('li').each((index, element) => {
        const $el = $(element);
        const $h3Link = $el.find('h3 a');
        
        if ($h3Link.length > 0) {
            const name = $h3Link.text().trim();
            const detailUrl = $h3Link.attr('href');
            const title = $h3Link.attr('title') || '';
            
            if (name && detailUrl) {
                // Extract tax code from title (format: "4401127917 - CÔNG TY...")
                const taxCodeFromTitle = title.split(' - ')[0]?.trim() || '';
                
                // Extract address from div
                const divText = $el.find('div').text();
                const addressMatch = divText.match(/Địa chỉ:\s*([^M]+?)(?:Mã số thuế|$)/);
                const address = addressMatch ? addressMatch[1].trim().replace(/<br>/g, ' ') : '';
                
                // Extract tax code from div if not in title
                const taxCodeMatch = divText.match(/Mã số thuế:\s*(\d+)/);
                const taxCode = taxCodeFromTitle || (taxCodeMatch ? taxCodeMatch[1] : '');
                
                companies.push({
                    name,
                    detailUrl: detailUrl.startsWith('http') ? detailUrl : `https://hsctvn.com/${detailUrl}`,
                    tradingName: '',
                    taxCode,
                    legalRep: '',
                    address,
                    phone: '',
                    email: '',
                    website: '',
                    status: '',
                    foundedDate: '',
                    activeDate: '',
                    registrationNumber: ''
                });
            }
        }
    });
    
    return companies;
}

// Detail parsers
async function parseTratencongtyDetail($detail, company) {
    const $jumbotron = $detail('.jumbotron');
    if ($jumbotron.length) {
        const jumbotronHtml = $jumbotron.html();
        const jumbotronText = $jumbotron.text();
        
        // Tên chính thức từ h4
        const h4Text = $detail('.jumbotron h4').text().trim();
        if (h4Text) company.name = h4Text;
        
        // Tên giao dịch
        const tradingMatch = jumbotronText.match(/Tên giao dịch:\s*([^\n]+)/);
        if (tradingMatch && tradingMatch[1].trim()) {
            company.tradingName = tradingMatch[1].trim();
        }
        
        // Mã số thuế (có thể là ảnh)
        const taxImgMatch = jumbotronHtml.match(/Mã số thuế:.*?<img[^>]+src="([^"]+)"/);
        if (taxImgMatch && taxImgMatch[1]) {
            company.taxCodeImage = taxImgMatch[1];
            company.taxCode = '[Có ảnh MST]';
        } else {
            const taxMatch = jumbotronText.match(/Mã số thuế:\s*([^\n]*)/);
            if (taxMatch) {
                const taxValue = taxMatch[1].trim();
                if (taxValue && taxValue.length > 0 && !taxValue.includes('Địa chỉ')) {
                    company.taxCode = taxValue;
                }
            }
        }
        
        // Địa chỉ
        const addressMatch = jumbotronText.match(/Địa chỉ:\s*([^\n]+)/);
        if (addressMatch && addressMatch[1].trim()) {
            company.address = addressMatch[1].trim();
        }
        
        // Đại diện pháp luật
        const legalMatch = jumbotronText.match(/Đại diện pháp luật:\s*([^\n]+)/);
        if (legalMatch && legalMatch[1].trim()) {
            company.legalRep = legalMatch[1].trim();
        }
        
        // Ngày cấp
        const foundedMatch = jumbotronText.match(/Ngày cấp giấy phép:\s*([^\n]+)/);
        if (foundedMatch && foundedMatch[1].trim()) {
            company.foundedDate = foundedMatch[1].trim();
        }
        
        // Ngày hoạt động
        const activeMatch = jumbotronText.match(/Ngày hoạt động:\s*([^(\n]+)/);
        if (activeMatch && activeMatch[1].trim()) {
            company.activeDate = activeMatch[1].trim();
        }
        
        // Điện thoại (có thể là ảnh)
        const phoneImgMatch = jumbotronHtml.match(/Điện thoại trụ sở:.*?<img[^>]+src="([^"]+)"/);
        if (phoneImgMatch && phoneImgMatch[1]) {
            company.phoneImage = phoneImgMatch[1];
            company.phone = '[Có ảnh ĐT]';
        } else {
            const phoneMatch = jumbotronText.match(/Điện thoại trụ sở:\s*([^\n]+)/);
            if (phoneMatch) {
                const phoneValue = phoneMatch[1].trim();
                if (phoneValue && phoneValue.length > 0 && !phoneValue.includes('Trạng thái')) {
                    company.phone = phoneValue;
                }
            }
        }
        
        // Trạng thái
        const statusMatch = jumbotronText.match(/Trạng thái:\s*([^\n]+)/);
        if (statusMatch && statusMatch[1].trim()) {
            company.status = statusMatch[1].trim();
        }
    }
    
    // Lấy từ table
    const details = {};
    $detail('tr').each((i, row) => {
        const $row = $detail(row);
        const cells = $row.find('td');
        
        if (cells.length >= 2) {
            const label = $detail(cells[0]).text().trim().replace(':', '');
            const value = $detail(cells[1]).text().trim();
            if (label && value) details[label] = value;
        }
    });
    
    if (details['Email'] && !company.email) company.email = details['Email'];
    if (details['Website'] && !company.website) company.website = details['Website'];
    if (details['Giấy phép kinh doanh'] && !company.registrationNumber) {
        company.registrationNumber = details['Giấy phép kinh doanh'];
    }
    
    return company;
}

async function parseTrangvangDetail($detail, company) {
    // Collect all data sections
    let allData = [];
    
    // 1. Extract company name from h1
    const $h1 = $detail('h1.fs-3');
    if ($h1.length > 0) {
        const companyName = $h1.text().trim();
        allData.push(companyName);
        company.name = companyName;
    }
    
    // 2. Extract sponsor info
    const $sponsor = $detail('.star_mb');
    if ($sponsor.length > 0) {
        const sponsorText = $sponsor.text().trim();
        if (sponsorText) {
            allData.push(sponsorText);
        }
    }
    
    // 3. Extract address (first occurrence in logo_lisitng_address)
    const $addressDiv = $detail('.logo_lisitng_address > div').first();
    if ($addressDiv.length > 0) {
        const address = $addressDiv.text().trim();
        allData.push(address);
        company.address = address;
    }
    
    // 4. Extract phone number - prioritize hotline (mobile-screen-button icon), then regular phone (phone-volume icon)
    let finalPhone = '';
    let hasZalo = false;
    
    // First, try to find hotline with mobile-screen-button icon
    $detail('i.fa-mobile-screen-button').each((i, icon) => {
        const $parent = $detail(icon).parent();
        const $phoneLink = $parent.find('a[href^="tel:"]').first();
        
        if ($phoneLink.length > 0) {
            finalPhone = $phoneLink.text().trim();
            
            // Check if this div has Zalo (check for zalo.me link or zalo image)
            const parentHtml = $parent.html();
            if (parentHtml && (parentHtml.includes('zalo.me') || parentHtml.includes('zalo_txt.png'))) {
                hasZalo = true;
            }
            
            return false; // break - found hotline
        }
    });
    
    // If no hotline found, get regular phone with phone-volume icon
    if (!finalPhone) {
        $detail('i.fa-phone-volume').each((i, icon) => {
            const $parent = $detail(icon).parent();
            const $phoneLink = $parent.find('a[href^="tel:"]').first();
            
            if ($phoneLink.length > 0) {
                finalPhone = $phoneLink.text().trim();
                
                // Check if this div has Zalo
                const parentHtml = $parent.html();
                if (parentHtml && (parentHtml.includes('zalo.me') || parentHtml.includes('zalo_txt.png'))) {
                    hasZalo = true;
                }
                
                return false; // break - found phone
            }
        });
    }
    
    // Format phone with Zalo status
    if (finalPhone) {
        if (!hasZalo) {
            finalPhone += ' (không có Zalo)';
        }
        company.phone = finalPhone;
        allData.push('Điện thoại: ' + finalPhone);
    }
    
    // 6. Extract email from mailto: link
    const $emailLink = $detail('a[href^="mailto:"]').first();
    if ($emailLink.length > 0) {
        const email = $emailLink.text().trim();
        allData.push('Email: ' + email);
        company.email = email;
    }
    
    // 7. Extract website from rel="nofollow" target="_blank" link
    $detail('a[rel="nofollow"][target="_blank"]').each((i, link) => {
        const href = $detail(link).attr('href');
        if (href && !href.includes('zalo.me') && !href.includes('trangvangvietnam.com')) {
            const website = $detail(link).text().trim() || href;
            allData.push('Website: ' + website);
            company.website = website;
            return false; // break
        }
    });
    
    // 8. Extract BY YELLOW PAGES
    if ($detail('.by_trangvang').length > 0) {
        allData.push('BY YELLOW PAGES');
    }
    
    // 9. Extract NGÀNH NGHỀ KINH DOANH (all industries)
    const industries = [];
    $detail('.div_23_txt:contains("NGÀNH NGHỀ")').parent().find('.div_77 a').each((i, link) => {
        industries.push($detail(link).text().trim());
    });
    
    // Also check mobile version
    $detail('.nganh_loaihinh:contains("NGÀNH NGHỀ")').parent().find('a').each((i, link) => {
        const text = $detail(link).text().trim();
        if (text && !industries.includes(text)) {
            industries.push(text);
        }
    });
    
    if (industries.length > 0) {
        const industriesStr = 'NGÀNH NGHỀ KINH DOANH: ' + industries.join(' | ');
        allData.push(industriesStr);
    }
    
    // 10. Extract LOẠI HÌNH KINH DOANH
    let businessType = '';
    $detail('.div_23_txt:contains("LOẠI HÌNH")').parent().find('.div_77').each((i, el) => {
        businessType = $detail(el).text().trim();
    });
    if (!businessType) {
        $detail('.nganh_loaihinh:contains("LOẠI HÌNH")').parent().each((i, el) => {
            const text = $detail(el).text();
            const match = text.match(/LOẠI HÌNH[^:]*:\s*(.+)/);
            if (match) businessType = match[1].trim();
        });
    }
    if (businessType) {
        allData.push('LOẠI HÌNH KINH DOANH: ' + businessType);
    }
    
    // 11. Extract THỊ TRƯỜNG CHÍNH
    let market = '';
    $detail('.div_23_txt:contains("THỊ TRƯỜNG")').parent().find('.div_77').each((i, el) => {
        market = $detail(el).text().trim();
    });
    if (!market) {
        $detail('.nganh_loaihinh:contains("THỊ TRƯỜNG")').parent().each((i, el) => {
            const text = $detail(el).text();
            const match = text.match(/THỊ TRƯỜNG[^:]*:\s*(.+)/);
            if (match) market = match[1].trim();
        });
    }
    if (market) {
        allData.push('THỊ TRƯỜNG CHÍNH: ' + market);
    }
    
    // 12. Extract KHÁCH HÀNG CHÍNH
    let customer = '';
    $detail('.div_23_txt:contains("KHÁCH HÀNG")').parent().find('.div_77').each((i, el) => {
        customer = $detail(el).text().trim();
    });
    if (!customer) {
        $detail('.nganh_loaihinh:contains("KHÁCH HÀNG")').parent().each((i, el) => {
            const text = $detail(el).text();
            const match = text.match(/KHÁCH HÀNG[^:]*:\s*(.+)/);
            if (match) customer = match[1].trim();
        });
    }
    if (customer) {
        allData.push('KHÁCH HÀNG CHÍNH: ' + customer);
    }
    
    // 13. Extract MÃ SỐ THUẾ
    let taxCodeReal = '';
    $detail('.div_23_txt:contains("MÃ SỐ THUẾ")').parent().find('.div_77').each((i, el) => {
        taxCodeReal = $detail(el).text().trim();
    });
    if (!taxCodeReal) {
        $detail('.nganh_loaihinh:contains("MÃ SỐ THUẾ")').parent().each((i, el) => {
            const text = $detail(el).text();
            const match = text.match(/MÃ SỐ THUẾ[^:]*:\s*(\d+)/);
            if (match) taxCodeReal = match[1].trim();
        });
    }
    if (taxCodeReal) {
        allData.push('MÃ SỐ THUẾ: ' + taxCodeReal);
        company.taxCode = taxCodeReal;
    }
    
    // 14. Extract NĂM THÀNH LẬP
    let foundedYear = '';
    $detail('.div_23_txt:contains("NĂM THÀNH LẬP")').parent().find('.div_77').each((i, el) => {
        foundedYear = $detail(el).text().trim();
    });
    if (!foundedYear) {
        $detail('.nganh_loaihinh:contains("NĂM THÀNH LẬP")').parent().each((i, el) => {
            const text = $detail(el).text();
            const match = text.match(/NĂM THÀNH LẬP[^:]*:\s*(\d+)/);
            if (match) foundedYear = match[1].trim();
        });
    }
    if (foundedYear) {
        allData.push('NĂM THÀNH LẬP: ' + foundedYear);
        company.foundedDate = foundedYear;
        company.activeDate = foundedYear;
    }
    
    // 15. Extract SỐ LƯỢNG NHÂN VIÊN
    let employees = '';
    $detail('.div_23_txt:contains("SỐ LƯỢNG NHÂN VIÊN")').parent().find('.div_77').each((i, el) => {
        employees = $detail(el).text().trim();
    });
    if (!employees) {
        $detail('.nganh_loaihinh:contains("SỐ LƯỢNG NHÂN VIÊN")').parent().each((i, el) => {
            const text = $detail(el).text();
            const match = text.match(/SỐ LƯỢNG NHÂN VIÊN[^:]*:\s*(.+)/);
            if (match) employees = match[1].trim();
        });
    }
    if (employees) {
        allData.push('SỐ LƯỢNG NHÂN VIÊN: ' + employees);
    }
    
    // 16. Extract GIỚI THIỆU CÔNG TY (full description)
    const $gioiThieu = $detail('.gioithieucongty_img');
    if ($gioiThieu.length > 0) {
        const description = $gioiThieu.text().trim();
        if (description) {
            allData.push('GIỚI THIỆU CÔNG TY:');
            allData.push(description);
        }
    }
    
    // 17. Extract SẢN PHẨM DỊCH VỤ
    const products = [];
    $detail('h3.fs-6.dark_blue_color').each((i, heading) => {
        const $h3 = $detail(heading);
        const groupName = $h3.find('a').text().trim() || $h3.text().trim();
        if (groupName && !groupName.includes('NGÀNH NGHỀ')) {
            products.push(groupName);
        }
    });
    
    if (products.length > 0) {
        allData.push('SẢN PHẨM DỊCH VỤ:');
        allData.push(products.join(' | '));
    }
    
    // Store all data in tradingName (since it's large text field)
    company.tradingName = allData.join('\n');
    
    // Store structured data for Excel columns
    company.legalRep = [businessType, market, customer].filter(Boolean).join(' | ');
    company.registrationNumber = taxCodeReal;
    company.status = $gioiThieu.length > 0 ? $gioiThieu.text().trim() : '';
    
    return company;
}

async function parseHsctDetail($detail, company) {
    const $boxContent = $detail('.box_content');
    
    if ($boxContent.length > 0) {
        // Extract from first ul.hsct
        const $firstUl = $boxContent.find('ul.hsct').first();
        
        // Tên chính thức từ h1
        const h1Text = $firstUl.find('h1').text().trim();
        if (h1Text) company.name = h1Text;
        
        // Extract from all li elements
        $firstUl.find('li').each((index, element) => {
            const text = $detail(element).text().trim();
            
            // Tên quốc tế
            if (text.includes('Tên quốc tế:')) {
                const match = text.match(/Tên quốc tế:\s*(.+)/);
                if (match) company.tradingName = match[1].trim();
            }
            // Mã số thuế
            else if (text.includes('Mã số thuế:')) {
                const match = text.match(/Mã số thuế:\s*(\d+)/);
                if (match) company.taxCode = match[1].trim();
            }
            // Địa chỉ thuế
            else if (text.includes('Địa chỉ thuế:')) {
                const match = text.match(/Địa chỉ thuế:\s*(.+)/);
                if (match) company.address = match[1].trim();
            }
        });
        
        // Extract from second ul.hsct
        const $secondUl = $boxContent.find('ul.hsct').eq(1);
        $secondUl.find('li').each((index, element) => {
            const $li = $detail(element);
            const text = $li.text().trim();
            
            // Đại diện pháp luật
            if (text.includes('Đại diện pháp luật:')) {
                const legalRep = $li.find('a').text().trim();
                if (legalRep) company.legalRep = legalRep;
            }
            // Điện thoại
            else if (text.includes('Điện thoại:')) {
                const match = text.match(/Điện thoại:\s*(.+)/);
                if (match) company.phone = match[1].trim();
            }
            // Ngày cấp
            else if (text.includes('Ngày cấp:')) {
                const dateLink = $li.find('a').text().trim();
                if (dateLink) {
                    company.foundedDate = dateLink;
                    company.activeDate = dateLink;
                }
            }
            // Trạng thái
            else if (text.includes('Trạng thái:')) {
                const match = text.match(/Trạng thái:\s*(.+)/);
                if (match) company.status = match[1].trim();
            }
        });
    }
    
    return company;
}

// Crawl dữ liệu doanh nghiệp với Axios + Cheerio
async function crawlCompanyData(startPage = 1, endPage = 5, website = 'tratencongty', progressCallback, startUrl = null) {
    const allCompanies = [];
    const siteConfig = SITE_CONFIGS[website];

    if (!siteConfig) {
        throw new Error(`Không tìm thấy cấu hình cho website: ${website}`);
    }

    console.log(`Bắt đầu crawl ${siteConfig.name}...`);

    try {
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            console.log(`Đang crawl trang ${pageNum}/${endPage}...`);
            
            if (progressCallback) {
                progressCallback({
                    type: 'page',
                    currentPage: pageNum,
                    totalPages: endPage,
                    message: `Đang crawl trang ${pageNum}/${endPage}...`
                });
            }

            // For trangvang and hsct, pass the category URL
            const url = ((website === 'trangvang' || website === 'hsct') && startUrl) 
                ? siteConfig.listUrl(pageNum, startUrl) 
                : siteConfig.listUrl(pageNum);
            
            try {
                const response = await client.get(url);
                const $ = cheerio.load(response.data);
                
                const companies = [];
                
                // Route to appropriate parser based on website
                if (website === 'tratencongty') {
                    companies.push(...parseTratencongtyList($, siteConfig));
                } else if (website === 'trangvang') {
                    companies.push(...parseTrangvangList($, siteConfig));
                } else if (website === 'hsct') {
                    companies.push(...parseHsctList($, siteConfig));
                }

                console.log(`Tìm thấy ${companies.length} công ty ở trang ${pageNum}`);

                // Lấy thông tin chi tiết từng công ty
                for (let i = 0; i < companies.length; i++) {
                    const company = companies[i];
                    try {
                        console.log(`[${i+1}/${companies.length}] Đang lấy chi tiết: ${company.name}`);
                        
                        if (progressCallback) {
                            progressCallback({
                                type: 'company',
                                currentPage: pageNum,
                                totalPages: endPage,
                                currentCompany: i + 1,
                                totalCompanies: companies.length,
                                companyName: company.name,
                                message: `Trang ${pageNum}/${endPage} - Công ty ${i+1}/${companies.length}: ${company.name}`
                            });
                        }
                        
                        await delay(1000);
                        
                        const detailResponse = await client.get(company.detailUrl);
                        const $detail = cheerio.load(detailResponse.data);
                        
                        // Route to appropriate detail parser
                        if (website === 'tratencongty') {
                            await parseTratencongtyDetail($detail, company);
                        } else if (website === 'trangvang') {
                            await parseTrangvangDetail($detail, company);
                        } else if (website === 'hsct') {
                            await parseHsctDetail($detail, company);
                        }
                        
                    } catch (error) {
                        console.error(`Lỗi khi lấy chi tiết ${company.name}:`, error.message);
                    }
                }

                allCompanies.push(...companies);
                
                // Delay giữa các trang
                await delay(2000);
                
            } catch (error) {
                console.error(`Lỗi khi crawl trang ${pageNum}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Lỗi:', error);
    }

    return allCompanies;
}

// Xuất Excel
async function exportToExcel(data, filename) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Doanh nghiệp');

    // Định nghĩa các cột
    worksheet.columns = [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Tên công ty', key: 'name', width: 45 },
        { header: 'Tên giao dịch', key: 'tradingName', width: 35 },
        { header: 'Mã số thuế', key: 'taxCode', width: 25 },
        { header: 'Đại diện pháp luật', key: 'legalRep', width: 25 },
        { header: 'Địa chỉ', key: 'address', width: 50 },
        { header: 'Điện thoại', key: 'phone', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Website', key: 'website', width: 35 },
        { header: 'Tình trạng', key: 'status', width: 18 },
        { header: 'Ngày cấp', key: 'foundedDate', width: 18 },
        { header: 'Ngày hoạt động', key: 'activeDate', width: 18 },
        { header: 'Số đăng ký', key: 'registrationNumber', width: 25 },
        { header: 'Link chi tiết', key: 'detailUrl', width: 15 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11, name: 'Arial' };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4472C4' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.height = 35;
    headerRow.eachCell((cell) => {
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    // Thêm dữ liệu
    data.forEach((company, index) => {
        const row = worksheet.addRow({
            stt: index + 1,
            name: company.name || '',
            tradingName: company.tradingName || '',
            taxCode: company.taxCode || '',
            legalRep: company.legalRep || '',
            address: company.address || '',
            phone: company.phone || '',
            email: company.email || '',
            website: company.website || '',
            status: company.status || '',
            foundedDate: company.foundedDate || '',
            activeDate: company.activeDate || '',
            registrationNumber: company.registrationNumber || '',
            detailUrl: company.detailUrl || ''
        });

        // Style dữ liệu
        row.font = { size: 10, name: 'Arial' };
        row.alignment = { vertical: 'middle', wrapText: true };
        row.height = 40;
        
        // Border cho tất cả cells
        row.eachCell({ includeEmpty: true }, (cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'D3D3D3' } },
                left: { style: 'thin', color: { argb: 'D3D3D3' } },
                bottom: { style: 'thin', color: { argb: 'D3D3D3' } },
                right: { style: 'thin', color: { argb: 'D3D3D3' } }
            };
        });

        // Alignment đặc biệt
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }; // STT
        row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' }; // Trạng thái
        row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' }; // Ngày cấp
        row.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' }; // Ngày hoạt động

        // Link cho URL
        if (company.detailUrl) {
            const urlCell = row.getCell(14);
            urlCell.value = {
                text: 'Xem',
                hyperlink: company.detailUrl
            };
            urlCell.font = { color: { argb: '0000FF' }, underline: true, size: 10 };
            urlCell.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // Thêm ảnh mã số thuế nếu có
        if (company.taxCodeImage) {
            try {
                row.getCell(4).value = ''; // Xóa text khi có ảnh
                const base64Data = company.taxCodeImage.replace(/^data:image\/\w+;base64,/, '');
                const imageId = workbook.addImage({
                    base64: base64Data,
                    extension: 'png',
                });
                // Fit theo chiều ngang, giữ tỷ lệ
                const cellWidth = 25 * 7; // column width * 7 pixels per unit
                worksheet.addImage(imageId, {
                    tl: { col: 3 + 0.05, row: row.number - 1 + 0.2 },
                    ext: { width: cellWidth * 0.9, height: 35 }
                });
                row.height = 45;
            } catch (error) {
                console.error('Lỗi thêm ảnh MST:', error.message);
            }
        }

        // Thêm ảnh điện thoại nếu có
        if (company.phoneImage) {
            try {
                row.getCell(7).value = ''; // Xóa text khi có ảnh
                const base64Data = company.phoneImage.replace(/^data:image\/\w+;base64,/, '');
                const imageId = workbook.addImage({
                    base64: base64Data,
                    extension: 'png',
                });
                // Fit theo chiều ngang, giữ tỷ lệ
                const cellWidth = 25 * 7; // column width * 7 pixels per unit
                worksheet.addImage(imageId, {
                    tl: { col: 6 + 0.05, row: row.number - 1 + 0.2 },
                    ext: { width: cellWidth * 0.9, height: 35 }
                });
                if (row.height < 45) row.height = 45;
            } catch (error) {
                console.error('Lỗi thêm ảnh ĐT:', error.message);
            }
        }
    });

    // Freeze header row
    worksheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];

    // Lưu file
    await workbook.xlsx.writeFile(filename);
    console.log(`Đã xuất file: ${filename}`);
}

// API endpoint để bắt đầu crawl với Server-Sent Events
app.get('/api/start-crawl', requireAuth, async (req, res) => {
    const startPage = parseInt(req.query.startPage) || 1;
    const endPage = parseInt(req.query.endPage) || 5;
    const website = req.query.website || 'tratencongty';
    const startUrl = req.query.url || null; // Category URL for trangvang
    
    // Validate website
    if (!SITE_CONFIGS[website]) {
        return res.status(400).json({ error: `Website không hợp lệ: ${website}` });
    }
    
    // Thiết lập SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    console.log(`Bắt đầu crawl ${SITE_CONFIGS[website].name} từ trang ${startPage} đến trang ${endPage}...`);
    
    try {
        const companies = await crawlCompanyData(startPage, endPage, website, (progress) => {
            // Gửi progress về client
            res.write(`data: ${JSON.stringify(progress)}\n\n`);
        }, startUrl);
        
        // Gửi kết quả cuối cùng
        res.write(`data: ${JSON.stringify({
            type: 'complete',
            success: true,
            count: companies.length,
            data: companies
        })}\n\n`);
        
        res.end();
    } catch (error) {
        console.error('Lỗi:', error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            success: false,
            error: error.message
        })}\n\n`);
        res.end();
    }
});

// API endpoint to check total pages
app.post('/api/check-pages', requireAuth, async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL không được để trống' });
        }

        // Detect website from URL
        let website = null;
        let siteName = '';
        
        if (url.includes('tratencongty.com')) {
            website = 'tratencongty';
            siteName = 'Tra Tên Công Ty';
        } else if (url.includes('trangvangvietnam.com')) {
            website = 'trangvang';
            siteName = 'Trang Vàng Việt Nam';
        } else if (url.includes('hsctvn.com')) {
            website = 'hsct';
            siteName = 'HSCT';
        } else {
            return res.status(400).json({ error: 'URL không thuộc trang web hỗ trợ (tratencongty.com, trangvangvietnam.com, hsctvn.com)' });
        }

        const siteConfig = SITE_CONFIGS[website];
        console.log(`Đang kiểm tra số trang của ${siteName}...`);

        // Fetch the URL to detect pages
        const response = await client.get(url);
        const $ = cheerio.load(response.data);
        
        let totalPages = 1;
        
        // Different detection logic per site
        if (website === 'tratencongty') {
            // Find pagination links
            const paginationLinks = $('.pagination a, .page-link, a[href*="page="]');
            let maxPage = 1;
            
            paginationLinks.each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text().trim();
                
                // Try to extract page number from href
                if (href) {
                    const pageMatch = href.match(/page=(\d+)/);
                    if (pageMatch) {
                        const pageNum = parseInt(pageMatch[1]);
                        if (pageNum > maxPage) maxPage = pageNum;
                    }
                }
                
                // Try to extract page number from text
                const pageNum = parseInt(text);
                if (!isNaN(pageNum) && pageNum > maxPage) {
                    maxPage = pageNum;
                }
            });
            
            totalPages = maxPage > 1 ? maxPage : 1;
        } else if (website === 'hsct') {
            // HSCT pagination detection for both homepage and search page
            const $nextPage = $('.next-page');
            let maxPage = 1;
            
            if ($nextPage.length > 0) {
                // Get all <a> links in .next-page
                const links = $nextPage.find('a');
                
                links.each((index, element) => {
                    const $link = $(element);
                    const href = $link.attr('href');
                    const text = $link.text().trim();
                    
                    // Try to extract from href for homepage: /page-300123
                    if (href && href.includes('/page-')) {
                        const pageMatch = href.match(/\/page-(\d+)/);
                        if (pageMatch) {
                            const pageNum = parseInt(pageMatch[1]);
                            if (pageNum > maxPage) maxPage = pageNum;
                        }
                    }
                    // Try to extract from href for search page: ?key=...&p=123
                    else if (href && href.includes('&p=')) {
                        const pageMatch = href.match(/&p=(\d+)/);
                        if (pageMatch) {
                            const pageNum = parseInt(pageMatch[1]) + 1; // p starts from 0, so +1
                            if (pageNum > maxPage) maxPage = pageNum;
                        }
                    }
                    
                    // Try to extract from text content
                    const pageNum = parseInt(text);
                    if (!isNaN(pageNum) && pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                });
            }
            
            // Also check for other pagination patterns on search page
            if (maxPage === 1) {
                $('a[href*="&p="]').each((index, element) => {
                    const href = $(element).attr('href');
                    if (href) {
                        const pageMatch = href.match(/&p=(\d+)/);
                        if (pageMatch) {
                            const pageNum = parseInt(pageMatch[1]) + 1; // p starts from 0
                            if (pageNum > maxPage) maxPage = pageNum;
                        }
                    }
                });
            }
            
            totalPages = maxPage > 1 ? maxPage : 1;
        } else if (website === 'trangvang') {
            // Trangvang pagination detection (needs adjustment based on actual structure)
            const paginationLinks = $('a[href*="page="], .pagination a, .page-numbers a');
            let maxPage = 1;
            
            paginationLinks.each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text().trim();
                
                if (href) {
                    const pageMatch = href.match(/page=(\d+)/);
                    if (pageMatch) {
                        const pageNum = parseInt(pageMatch[1]);
                        if (pageNum > maxPage) maxPage = pageNum;
                    }
                }
                
                const pageNum = parseInt(text);
                if (!isNaN(pageNum) && pageNum > maxPage) {
                    maxPage = pageNum;
                }
            });
            
            totalPages = maxPage > 1 ? maxPage : 1;
        }

        console.log(`Tìm thấy ${totalPages} trang trên ${siteName}`);
        
        res.json({
            success: true,
            totalPages,
            website,
            siteName,
            url
        });
        
    } catch (error) {
        console.error('Lỗi khi kiểm tra số trang:', error.message);
        res.status(500).json({
            success: false,
            error: `Không thể kiểm tra: ${error.message}`
        });
    }
});

// API endpoint để tải Excel
app.post('/api/download-excel', requireAuth, async (req, res) => {
    try {
        const { data } = req.body;
        
        if (!data || data.length === 0) {
            return res.status(400).json({ error: 'Không có dữ liệu để xuất' });
        }

        const filename = `doanh_nghiep_${Date.now()}.xlsx`;
        const filepath = path.join(__dirname, filename);
        
        await exportToExcel(data, filepath);
        
        res.download(filepath, filename, (err) => {
            if (err) {
                console.error('Lỗi khi tải file:', err);
            }
            // Xóa file sau khi tải
            const fs = require('fs');
            fs.unlinkSync(filepath);
        });
    } catch (error) {
        console.error('Lỗi:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export for Vercel
module.exports = app;

// Listen only if running locally (not on Vercel)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server đang chạy tại http://localhost:${PORT}`);
        console.log('Mở trình duyệt và truy cập để bắt đầu crawl dữ liệu!');
    });
}
