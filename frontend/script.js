// Automatically detect if running locally or on deployed server
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = isLocalhost ? 'http://localhost:3000' : window.location.origin;
const API_URL = `${BASE_URL}/api`;
const WS_URL = BASE_URL;

console.log('🔗 Connecting to:', BASE_URL);
const socket = io(WS_URL);

// State management
let allTokens = [];
let filteredTokens = [];
let currentPage = 1;
const tokensPerPage = 25;
let updateCount = 0;

// Fetch tokens from API with filters
async function fetchTokens(params = {}) {
    try {
        const queryParams = new URLSearchParams({
            limit: '100',
            ...params
        });
        const response = await fetch(`${API_URL}/tokens?${queryParams}`);
        const data = await response.json();
        console.log('API Response:', data);
        // API returns { success: true, data: { data: [...], pagination: {...} } }
        allTokens = data.data?.data || data.data || [];
        console.log('Loaded tokens:', allTokens.length);
        
        // Debug: Check price change values
        const priceChanges = allTokens.map(t => ({
            name: t.token_name,
            change: t.price_24hr_change,
            volume: t.volume_sol
        }));
        console.log('Sample price changes:', priceChanges.slice(0, 5));
        
        applyClientFilters();
    } catch (error) {
        console.error('Failed to fetch tokens:', error);
        allTokens = [];
        applyClientFilters();
    }
}

// Apply filters
function applyFilters() {
    const sortBy = document.getElementById('sortBy').value;
    const order = document.getElementById('order').value;
    const period = document.getElementById('period').value;

    const params = { sortBy, order, period };

    fetchTokens(params);
    currentPage = 1;
}

function applyClientFilters() {
    filteredTokens = [...allTokens];
    renderTokens();
}

// Render token table
function renderTokens() {
    const start = (currentPage - 1) * tokensPerPage;
    const end = start + tokensPerPage;
    const pageTokens = filteredTokens.slice(start, end);
    
    const tokensList = document.getElementById('tokensList');
    
    if (pageTokens.length === 0) {
        tokensList.innerHTML = '<div class="empty-state">No tokens found. Waiting for data...</div>';
        return;
    }

    tokensList.innerHTML = pageTokens.map(token => {
        // Map API property names and handle both formats
        const change = parseFloat(token.price_24hr_change || token.price_change_24h || 0);
        const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
        const changeSymbol = change > 0 ? '↑' : change < 0 ? '↓' : '';
        
        return `
            <div class="token-row" data-address="${token.token_address}">
                <div>
                    <span class="token-name">${token.token_name || 'Unknown'}</span>
                    <span class="token-ticker">${token.token_ticker || 'N/A'}</span>
                </div>
                <div>${parseFloat(token.price_sol || 0).toFixed(8)}</div>
                <div class="${changeClass}">${changeSymbol} ${Math.abs(change).toFixed(2)}%</div>
                <div>${formatNumber(token.volume_sol || token.volume_24h || 0)}</div>
                <div>${formatNumber(token.liquidity_sol || token.liquidity || 0)}</div>
                <div style="font-size: 11px; color: #6b7280">${token.protocol || 'N/A'}</div>
            </div>
        `;
    }).join('');

    updatePagination();
    updateStats();
}

// Format large numbers
function formatNumber(num) {
    if (!num) return '0';
    const n = parseFloat(num);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
    return n.toFixed(2);
}

// Update statistics
function updateStats() {
    document.getElementById('totalTokens').textContent = allTokens.length;
    document.getElementById('liveUpdates').textContent = updateCount;
    
    const totalVol = allTokens.reduce((sum, t) => sum + parseFloat(t.volume_sol || t.volume_24h || 0), 0);
    document.getElementById('totalVolume').textContent = formatNumber(totalVol);
}

// Pagination
function updatePagination() {
    const totalPages = Math.ceil(filteredTokens.length / tokensPerPage);
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTokens();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredTokens.length / tokensPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderTokens();
    }
}

// WebSocket handlers
socket.on('connect', () => {
    console.log('✅ WebSocket connected - Real-time streaming active');
    document.getElementById('status').innerHTML = '✅ Connected';
    document.getElementById('status').className = 'status connected';
    fetchTokens();
});

socket.on('disconnect', () => {
    console.log('❌ WebSocket disconnected');
    document.getElementById('status').innerHTML = '❌ Disconnected';
    document.getElementById('status').className = 'status disconnected';
});

socket.on('initial_data', (event) => {
    console.log('📦 Initial data received:', event);
    if (event.data && Array.isArray(event.data)) {
        allTokens = event.data;
        applyClientFilters();
    }
});

socket.on('tokens_updated', (event) => {
    console.log('🔄 Real-time update received:', event);
    updateCount++;
    
    if (event.data && Array.isArray(event.data)) {
        event.data.forEach(updated => {
            const idx = allTokens.findIndex(t => t.token_address === updated.token_address);
            if (idx !== -1) {
                allTokens[idx] = { ...allTokens[idx], ...updated };
                highlightToken(updated.token_address);
            }
        });
        applyClientFilters();
    }
});

socket.on('price_update', (event) => {
    console.log('💰 Price update:', event);
    updateCount++;
    const updates = Array.isArray(event.data) ? event.data : [event.data];
    updates.forEach(update => {
        const token = allTokens.find(t => t.token_address === update.token_address);
        if (token) {
            token.price_sol = update.new_price;
            token.price_24hr_change = update.change_percent;
            highlightToken(update.token_address);
        }
    });
    applyClientFilters();
});

socket.on('volume_spike', (event) => {
    console.log('📊 Volume spike:', event);
    updateCount++;
    const spikes = Array.isArray(event.data) ? event.data : [event.data];
    spikes.forEach(spike => {
        const token = allTokens.find(t => t.token_address === spike.token_address);
        if (token) {
            token.volume_sol = spike.new_volume;
            highlightToken(spike.token_address);
        }
    });
    applyClientFilters();
});

socket.on('new_token', (event) => {
    console.log('🆕 New token:', event);
    updateCount++;
    if (event.data) {
        allTokens.unshift(event.data);
        if (allTokens.length > 100) allTokens.pop();
        applyClientFilters();
        highlightToken(event.data.token_address);
    }
});

// Highlight updated token
function highlightToken(address) {
    setTimeout(() => {
        const row = document.querySelector(`[data-address="${address}"]`);
        if (row) {
            row.classList.add('highlight');
            setTimeout(() => row.classList.remove('highlight'), 1000);
        }
    }, 100);
}

// Initialize
fetchTokens();
