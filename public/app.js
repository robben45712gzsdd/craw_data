// State management
const state = {
    currentUrl: '',
    isSelectMode: false,
    selectedContainer: null,
    containerSelector: '',
    detectedFields: [],
    crawledData: [],
    pageHtml: '',
    baseUrl: ''
};

// DOM Elements
const elements = {
    urlInput: document.getElementById('urlInput'),
    loadBtn: document.getElementById('loadBtn'),
    selectModeBtn: document.getElementById('selectModeBtn'),
    selectedArea: document.getElementById('selectedArea'),
    detectedFields: document.getElementById('detectedFields'),
    crawlBtn: document.getElementById('crawlBtn'),
    exportBtn: document.getElementById('exportBtn'),
    clearBtn: document.getElementById('clearBtn'),
    previewFrame: document.getElementById('previewFrame'),
    previewUrl: document.getElementById('previewUrl'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    refreshBtn: document.getElementById('refreshBtn'),
    openNewTabBtn: document.getElementById('openNewTabBtn'),
    dataPanel: document.getElementById('dataPanel'),
    closeDataPanel: document.getElementById('closeDataPanel'),
    dataTable: document.getElementById('dataTable'),
    dataCount: document.getElementById('dataCount'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    closeHelp: document.getElementById('closeHelp')
};

// Temporary storage for current selection
let currentSelection = {
    element: null,
    selector: '',
    tagName: '',
    preview: ''
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    // Load page
    elements.loadBtn.addEventListener('click', loadPage);
    elements.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadPage();
    });

    // Select mode toggle
    elements.selectModeBtn.addEventListener('click', toggleSelectMode);

    // Actions
    elements.crawlBtn.addEventListener('click', crawlData);
    elements.exportBtn.addEventListener('click', exportExcel);
    elements.clearBtn.addEventListener('click', clearAll);
    elements.refreshBtn.addEventListener('click', loadPage);
    elements.openNewTabBtn.addEventListener('click', () => {
        if (state.currentUrl) window.open(state.currentUrl, '_blank');
    });

    // Data panel
    elements.closeDataPanel.addEventListener('click', () => {
        elements.dataPanel.classList.add('hidden');
    });

    // Help modal
    elements.helpBtn.addEventListener('click', () => {
        elements.helpModal.classList.remove('hidden');
    });
    elements.closeHelp.addEventListener('click', () => {
        elements.helpModal.classList.add('hidden');
    });

    // Close modals on outside click
    elements.helpModal.addEventListener('click', (e) => {
        if (e.target === elements.helpModal) {
        }
    });
}

// Auto-detect fields in selected container
function detectFields(container) {
    const fields = [];
    
    // Find common elements in the container
    const firstItem = container.children[0];
    if (!firstItem) return fields;
    
    // Detect links
    const links = firstItem.querySelectorAll('a[href]');
    links.forEach((link, index) => {
        const text = link.textContent.trim();
        if (text) {
            fields.push({
                name: `Link ${index + 1}`,
                selector: 'a',
                attribute: 'href',
                preview: link.href
            });
        }
    });
    
    // Detect images
    const images = firstItem.querySelectorAll('img[src]');
    images.forEach((img, index) => {
        fields.push({
            name: `Hình ${index + 1}`,
            selector: 'img',
            attribute: 'src',
            preview: img.src
        });
    });
    
    // Detect text elements
    const textElements = firstItem.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div');
    const processedTexts = new Set();
    
    textElements.forEach((el) => {
        const text = el.textContent.trim();
        if (text && text.length > 3 && text.length < 200 && !processedTexts.has(text)) {
            processedTexts.add(text);
            const tagName = el.tagName.toLowerCase();
            let name = 'Text';
            
            if (tagName.includes('h')) name = 'Tiêu đề';
            else if (text.includes('đ') || text.includes('$') || text.includes('₫')) name = 'Giá';
            else if (text.length < 50) name = 'Thông tin ngắn';
            else name = 'Mô tả';
            
            fields.push({
                name: name + ` (${tagName})`,
                selector: tagName,
                attribute: 'text',
                preview: text.substring(0, 50) + (text.length > 50 ? '...' : '')
            });
        }
    });
    
    return fields;
}

// Display detected fields
function displayDetectedFields(fields) {
    if (fields.length === 0) {
        elements.detectedFields.innerHTML = '<p>Không phát hiện được trường dữ liệu nào</p>';
        return;
    }
    
    elements.detectedFields.innerHTML = `
        <div style="margin-bottom: 10px; font-weight: 600;">Phát hiện ${fields.length} trường:</div>
        ${fields.map((field, index) => `
            <div class="detected-field">
                <span class="field-name">${field.name}</span>
                <span class="field-selector">${field.selector}</span>
            </div>
        `).join('')}
    `;
}

// Apply template
function applyTemplate(templateType) {
    const template = templates[templateType];
    if (!template) return;
    
    // Clear existing selectors
    state.selectors = [];
    
    // Add template fields
    template.forEach((field, index) => {
        state.selectors.push({
            id: Date.now() + index,
            name: field.name,
            selector: field.selector,
            attribute: field.attribute,
            preview: field.selector ? `Sẽ tìm: ${field.selector}` : 'Cần chọn thủ công'
        });
    });
    
    updateSelectorsDisplay();
    updateUI();
    
    // Show notification
    showNotification(`✅ Đã áp dụng template ${templateType.toUpperCase()}! Hãy chọn các phần tử trên trang web.`, 'success');
}
        
    

// Load page into preview
async function loadPage() {
    const url = elements.urlInput.value.trim();
    
    if (!url) {
        alert('Vui lòng nhập URL');
        return;
    }

    // Validate URL
    try {
        new URL(url);
    } catch {
        alert('URL không hợp lệ');
        return;
    }

    elements.loadingOverlay.classList.remove('hidden');
    
    try {
        const response = await fetch('/api/fetch-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch page');
        }

        const data = await response.json();
        state.currentUrl = url;
        state.pageHtml = data.html;
        state.baseUrl = data.baseUrl;

        // Inject HTML into iframe with modifications
        displayInIframe(data.html, data.baseUrl, url);
        
        elements.previewUrl.textContent = url;
        
    } catch (error) {
        console.error('Error loading page:', error);
        alert('Không thể tải trang: ' + error.message);
    } finally {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function displayInIframe(html, baseUrl, originalUrl) {
    const iframe = elements.previewFrame;
    
    // Parse HTML and modify it
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Add base tag for relative URLs
    const base = doc.createElement('base');
    base.href = baseUrl;
    base.target = '_blank';
    doc.head.insertBefore(base, doc.head.firstChild);
    
    // Add custom styles for highlighting
    const style = doc.createElement('style');
    style.textContent = `
        .crawler-highlight {
            outline: 3px solid #4a90d9 !important;
            outline-offset: 2px !important;
            background-color: rgba(74, 144, 217, 0.2) !important;
            cursor: crosshair !important;
        }
        .crawler-selected {
            outline: 3px solid #28a745 !important;
            outline-offset: 2px !important;
            background-color: rgba(40, 167, 69, 0.2) !important;
        }
        * {
            cursor: default;
        }
    `;
    doc.head.appendChild(style);
    
    // Get modified HTML
    const modifiedHtml = doc.documentElement.outerHTML;
    
    // Write to iframe
    iframe.srcdoc = modifiedHtml;
    
    // Setup iframe events after load
    iframe.onload = () => {
        setupIframeEvents();
    };
}

function setupIframeEvents() {
    const iframe = elements.previewFrame;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    
    if (!iframeDoc) return;

    // Prevent navigation
    iframeDoc.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            if (state.isSelectMode) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    });

    // Add event listeners for element selection
    iframeDoc.body.addEventListener('mouseover', handleMouseOver);
    iframeDoc.body.addEventListener('mouseout', handleMouseOut);
    iframeDoc.body.addEventListener('click', handleElementClick);
}

function handleMouseOver(e) {
    if (!state.isSelectMode) return;
    
    const target = e.target;
    if (target.tagName === 'BODY' || target.tagName === 'HTML') return;
    
    target.classList.add('crawler-highlight');
}

function handleMouseOut(e) {
    if (!state.isSelectMode) return;
    
    const target = e.target;
    target.classList.remove('crawler-highlight');
}

function handleElementClick(e) {
    if (!state.isSelectMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target;
    if (target.tagName === 'BODY' || target.tagName === 'HTML') return;
    
    // Find the container that likely contains repeating items
    let container = target;
    
    // Look for parent with multiple similar children (likely a list container)
    while (container && container.parentElement) {
        if (container.parentElement.children.length > 2) {
            // Check if siblings are similar (same tag or similar structure)
            const siblings = Array.from(container.parentElement.children);
            if (siblings.length > 1 && siblings[0].tagName === siblings[1].tagName) {
                container = container.parentElement;
                break;
            }
        }
        container = container.parentElement;
    }
    
    // If no good container found, use current element's parent
    if (!container || container === document.body) {
        container = target.parentElement || target;
    }
    
    // Generate selector for the container
    const containerSelector = generateSelector(container);
    const itemSelector = generateSelector(target);
    
    // Store selection
    state.selectedContainer = container;
    state.containerSelector = containerSelector;
    
    // Clear all highlights
    const iframe = elements.previewFrame;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.querySelectorAll('.crawler-highlight, .crawler-selected').forEach(el => {
        el.classList.remove('crawler-highlight', 'crawler-selected');
    });
    
    // Highlight selected container
    container.classList.add('crawler-selected');
    
    // Auto-detect fields
    state.detectedFields = detectFields(container);
    
    // Show selection info
    elements.selectedArea.classList.remove('hidden');
    displayDetectedFields(state.detectedFields);
    
    // Turn off select mode
    state.isSelectMode = false;
    elements.selectModeBtn.innerHTML = '<i class="fas fa-mouse-pointer"></i> Chọn Vùng Khác';
    elements.selectModeBtn.classList.remove('active');
    
    // Enable crawl button
    updateButtonStates();
    
    showNotification('✅ Đã chọn vùng dữ liệu! Bây giờ có thể crawl.', 'success');
}

function generateSelector(element) {
    // Try to generate a unique and useful selector
    const selectors = [];
    let current = element;
    
    while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
        let selector = current.tagName.toLowerCase();
        
        // Prefer ID
        if (current.id) {
            selector = '#' + current.id;
            selectors.unshift(selector);
            break;
        }
        
        // Use classes
        if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/)
                .filter(c => c && !c.startsWith('crawler-'))
                .slice(0, 2);
            if (classes.length > 0) {
                selector += '.' + classes.join('.');
            }
        }
        
        // Add nth-child if needed
        const parent = current.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-child(${index})`;
            }
        }
        
        selectors.unshift(selector);
        current = current.parentElement;
        
        // Limit depth
        if (selectors.length >= 4) break;
    }
    
    return selectors.join(' > ');
}

function getElementPreview(element) {
    const text = element.textContent?.trim().substring(0, 200) || '';
    const href = element.getAttribute('href') || '';
    const src = element.getAttribute('src') || '';
    
    if (text) return text;
    if (href) return href;
    if (src) return src;
    return element.outerHTML.substring(0, 200);
}

function openSelectorModal(selector, preview) {
    elements.cssSelector.value = selector;
    elements.fieldName.value = suggestFieldName(currentSelection.tagName);
    elements.attributeSelect.value = suggestAttribute(currentSelection.tagName);
    elements.valuePreview.textContent = preview || '-';
    elements.customAttrGroup.classList.add('hidden');
    elements.selectorModal.classList.remove('hidden');
    elements.fieldName.focus();
}

function suggestFieldName(tagName) {
    const suggestions = {
        'a': 'Link',
        'img': 'Hình ảnh',
        'h1': 'Tiêu đề chính',
        'h2': 'Tiêu đề',
        'h3': 'Tiêu đề phụ',
        'p': 'Nội dung',
        'span': 'Text',
        'div': 'Nội dung',
        'price': 'Giá',
        'button': 'Nút'
    };
    return suggestions[tagName] || 'Trường ' + (state.selectors.length + 1);
}

function suggestAttribute(tagName) {
    if (tagName === 'a') return 'href';
    if (tagName === 'img') return 'src';
    return 'text';
}

function handleAttributeChange() {
    const value = elements.attributeSelect.value;
    if (value === 'custom') {
        elements.customAttrGroup.classList.remove('hidden');
    } else {
        elements.customAttrGroup.classList.add('hidden');
    }
    
    // Update preview
    updateValuePreview();
}

function updateValuePreview() {
    if (!currentSelection.element) return;
    
    const attr = elements.attributeSelect.value;
    let value = '';
    
    switch (attr) {
        case 'text':
            value = currentSelection.element.textContent?.trim() || '';
            break;
        case 'href':
            value = currentSelection.element.getAttribute('href') || '';
            break;
        case 'src':
            value = currentSelection.element.getAttribute('src') || '';
            break;
        case 'html':
            value = currentSelection.element.innerHTML?.substring(0, 200) || '';
            break;
        case 'value':
            value = currentSelection.element.value || '';
            break;
        case 'custom':
            const customAttr = elements.customAttribute.value;
            value = currentSelection.element.getAttribute(customAttr) || '';
            break;
    }
    
    elements.valuePreview.textContent = value || '-';
}

function closeModal() {
    elements.selectorModal.classList.add('hidden');
    currentSelection = { element: null, selector: '', tagName: '', preview: '' };
}

function confirmSelection() {
    const name = elements.fieldName.value.trim();
    if (!name) {
        alert('Vui lòng nhập tên trường');
        return;
    }
    
    let attribute = elements.attributeSelect.value;
    if (attribute === 'custom') {
        attribute = elements.customAttribute.value.trim();
        if (!attribute) {
            alert('Vui lòng nhập tên thuộc tính');
            return;
        }
    }
    
    const preview = elements.valuePreview.textContent;
    
    // Check if editing existing selector
    if (currentSelection.editingId) {
        const index = state.selectors.findIndex(s => s.id === currentSelection.editingId);
        if (index !== -1) {
            state.selectors[index] = {
                ...state.selectors[index],
                name,
                selector: elements.cssSelector.value,
                attribute,
                preview
            };
        }
        currentSelection.editingId = null;
        showNotification('✅ Đã cập nhật trường dữ liệu!', 'success');
    } else {
        // Adding new selector
        const newSelector = {
            id: Date.now(),
            name: name,
            selector: elements.cssSelector.value,
            attribute: attribute,
            preview: preview
        };
        
        state.selectors.push(newSelector);
        
        // Mark element as selected
        if (currentSelection.element) {
            currentSelection.element.classList.add('crawler-selected');
            currentSelection.element.classList.remove('crawler-highlight');
        }
        showNotification('✅ Đã thêm trường dữ liệu mới!', 'success');
    }
    
    updateSelectorsList();
    closeModal();
    updateButtonStates();
}

function updateSelectorsList() {
    const count = state.selectors.length;
    if (elements.fieldCount) {
        elements.fieldCount.textContent = count;
    }
    
    if (count === 0) {
        elements.selectorsList.innerHTML = '<p class="empty-message">Chưa có trường nào được chọn. Dùng template hoặc chọn thủ công.</p>';
        return;
    }
    
    elements.selectorsList.innerHTML = state.selectors.map(sel => `
        <div class="selector-item" data-id="${sel.id}">
            <div class="selector-info">
                <div class="selector-name">${sel.name}</div>
                <div class="selector-details">
                    <div class="selector-path" title="${sel.selector}">
                        <i class="fas fa-code"></i> ${sel.selector || 'Chưa chọn'}
                    </div>
                    <div class="selector-attr">
                        <i class="fas fa-tag"></i> ${sel.attribute}
                    </div>
                    ${sel.preview ? `<div class="selector-preview">${sel.preview}</div>` : ''}
                </div>
            </div>
            <div class="selector-actions">
                <button class="btn btn-mini btn-secondary" onclick="editSelector(${sel.id})" title="Sửa">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-mini btn-danger" onclick="removeSelector(${sel.id})" title="Xóa">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Thêm alias cho updateSelectorsDisplay
function updateSelectorsDisplay() {
    updateSelectorsList();
}

function removeSelector(id) {
    state.selectors = state.selectors.filter(s => s.id !== id);
    updateSelectorsList();
    updateButtonStates();
}

// Edit existing selector
function editSelector(id) {
    const selector = state.selectors.find(s => s.id === id);
    if (!selector) return;
    
    // Pre-fill modal with existing values
    elements.fieldName.value = selector.name;
    elements.cssSelector.value = selector.selector;
    elements.attributeSelect.value = selector.attribute;
    
    // Store current editing selector
    currentSelection.editingId = id;
    
    // Show modal
    elements.selectorModal.classList.remove('hidden');
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 6px;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    if (type === 'success') {
        notification.style.background = '#d4edda';
        notification.style.color = '#155724';
        notification.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
        notification.style.background = '#f8d7da';
        notification.style.color = '#721c24';
        notification.style.border = '1px solid #f5c6cb';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Update UI state
function updateUI() {
    updateButtonStates();
}

// Expose functions to global scope for onclick handlers
window.removeSelector = removeSelector;
window.editSelector = editSelector;

function toggleSelectMode() {
    state.isSelectMode = !state.isSelectMode;
    
    if (state.isSelectMode) {
        elements.selectModeBtn.innerHTML = '<i class="fas fa-crosshairs"></i> Đang chọn... (Click vào vùng dữ liệu)';
        elements.selectModeBtn.classList.add('active');
        showNotification('🎯 Click vào vùng chứa danh sách dữ liệu trên trang web', 'info');
    } else {
        elements.selectModeBtn.innerHTML = '<i class="fas fa-mouse-pointer"></i> Chọn Vùng Chứa Dữ Liệu';
        elements.selectModeBtn.classList.remove('active');
    }
}

function updateButtonStates() {
    const hasSelection = state.selectedContainer && state.detectedFields.length > 0;
    const hasData = state.crawledData.length > 0;
    
    elements.crawlBtn.disabled = !hasSelection || !state.currentUrl;
    elements.exportBtn.disabled = !hasData;
}

async function crawlData() {
    if (!state.selectedContainer || state.detectedFields.length === 0 || !state.currentUrl) {
        alert('Vui lòng chọn vùng dữ liệu trước khi crawl');
        return;
    }
    
    elements.loadingOverlay.classList.remove('hidden');
    
    try {
        // Prepare selectors for API
        const selectors = state.detectedFields.map(field => ({
            name: field.name,
            selector: field.selector,
            attribute: field.attribute
        }));
        
        const response = await fetch('/api/crawl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: state.currentUrl,
                selectors: selectors,
                crawlMultiple: true, // Always crawl multiple since we're selecting a container
                containerSelector: state.containerSelector
            })
        });
        
        if (!response.ok) {
            throw new Error('Crawl failed');
        }
        
        const result = await response.json();
        state.crawledData = result.data;
        
        displayCrawledData(result.data);
        updateButtonStates();
        
        showNotification(`✅ Crawl thành công ${result.count} dòng dữ liệu!`, 'success');
        
    } catch (error) {
        console.error('Crawl error:', error);
        alert('Lỗi khi crawl dữ liệu: ' + error.message);
        showNotification('❌ Crawl thất bại!', 'error');
    } finally {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function displayCrawledData(data) {
    if (!data || data.length === 0) {
        alert('Không tìm thấy dữ liệu');
        return;
    }
    
    const headers = Object.keys(data[0]);
    
    // Build table header
    elements.dataTable.querySelector('thead').innerHTML = `
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    `;
    
    // Build table body
    elements.dataTable.querySelector('tbody').innerHTML = data.map(row => `
        <tr>${headers.map(h => `<td title="${row[h] || ''}">${row[h] || ''}</td>`).join('')}</tr>
    `).join('');
    
    elements.dataCount.textContent = `${data.length} dòng dữ liệu`;
    elements.dataPanel.classList.remove('hidden');
}

async function exportExcel() {
    if (state.crawledData.length === 0) {
        alert('Không có dữ liệu để xuất');
        return;
    }
    
    try {
        const response = await fetch('/api/export-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: state.crawledData,
                filename: 'crawled_data_' + new Date().toISOString().slice(0, 10)
            })
        });
        
        if (!response.ok) {
            throw new Error('Export failed');
        }
        
        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crawled_data_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Lỗi khi xuất Excel: ' + error.message);
    }
}

function clearAll() {
    if (!confirm('Bạn có chắc muốn reset tất cả?')) return;
    
    // Reset state
    state.selectedContainer = null;
    state.containerSelector = '';
    state.detectedFields = [];
    state.crawledData = [];
    state.isSelectMode = false;
    
    // Clear UI
    elements.selectedArea.classList.add('hidden');
    elements.detectedFields.innerHTML = '';
    elements.selectModeBtn.innerHTML = '<i class="fas fa-mouse-pointer"></i> Chọn Vùng Chứa Dữ Liệu';
    elements.selectModeBtn.classList.remove('active');
    
    // Clear selected highlights in iframe
    const iframe = elements.previewFrame;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (iframeDoc) {
        iframeDoc.querySelectorAll('.crawler-selected, .crawler-highlight').forEach(el => {
            el.classList.remove('crawler-selected', 'crawler-highlight');
        });
    }
    
    updateButtonStates();
    elements.dataPanel.classList.add('hidden');
    
    showNotification('🔄 Đã reset toàn bộ!', 'success');
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 6px;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;
    
    if (type === 'success') {
        notification.style.background = '#d4edda';
        notification.style.color = '#155724';
        notification.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
        notification.style.background = '#f8d7da';
        notification.style.color = '#721c24';
        notification.style.border = '1px solid #f5c6cb';
    } else {
        notification.style.background = '#d1ecf1';
        notification.style.color = '#0c5460';
        notification.style.border = '1px solid #bee5eb';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}
