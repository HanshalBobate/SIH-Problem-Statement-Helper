/**
 * SIH PS Helper — Popup Script
 * Checks backend/Ollama health and displays stats from the backend.
 */

const BACKEND_URL = 'http://127.0.0.1:7842';
const OLLAMA_URL  = 'http://127.0.0.1:11434';

const $ = id => document.getElementById(id);

function setDot(dotId, state, detail) {
    const dot = $(dotId);
    if (dot) {
        dot.className = 'service-dot ' + state; // online | offline | checking
    }
    const detailEl = document.getElementById(dotId.replace('dot-', 'detail-'));
    if (detailEl) detailEl.textContent = detail || '';
}

async function checkBackend() {
    setDot('dot-backend', 'checking', 'checking…');
    try {
        const r = await fetch(`${BACKEND_URL}/health`, {
            signal: AbortSignal.timeout(2500),
        });
        if (r.ok) {
            const data = await r.json();
            setDot('dot-backend', 'online', `v${data.version || '?'} · :7842`);
            $('backend-error').classList.remove('visible');
            await loadStats();
        } else {
            setDot('dot-backend', 'offline', `HTTP ${r.status}`);
            $('backend-error').classList.add('visible');
            loadStatsFromLocal();
        }
    } catch {
        setDot('dot-backend', 'offline', 'not running');
        $('backend-error').classList.add('visible');
        loadStatsFromLocal();
    }
}

async function checkOllama() {
    setDot('dot-ollama', 'checking', 'checking…');
    try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`, {
            signal: AbortSignal.timeout(2500),
        });
        if (r.ok) {
            const data = await r.json();
            const models = data.models || [];
            setDot('dot-ollama', 'online', `${models.length} model(s) loaded`);
        } else {
            setDot('dot-ollama', 'offline', `HTTP ${r.status}`);
        }
    } catch {
        setDot('dot-ollama', 'offline', 'not running');
    }
}

async function loadStats() {
    try {
        const r = await fetch(`${BACKEND_URL}/all`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) throw new Error();
        const data = await r.json();
        $('stat-total').textContent    = data.total            || '0';
        $('stat-reviewed').textContent = data.reviewed_count   || '0';
        $('stat-notes').textContent    = data.with_notes_count || '0';
    } catch {
        loadStatsFromLocal();
    }
}

function loadStatsFromLocal() {
    // Count keys in chrome.storage.local
    chrome.storage.local.get(null, items => {
        const notes  = Object.keys(items).filter(k => k.startsWith('sih_ps_notes_') && items[k]);
        const status = Object.keys(items).filter(k => k.startsWith('sih_ps_status_') && items[k] === true);
        const all    = new Set([
            ...notes.map(k => k.replace('sih_ps_notes_', '')),
            ...status.map(k => k.replace('sih_ps_status_', '')),
        ]);
        $('stat-total').textContent    = all.size;
        $('stat-reviewed').textContent = status.length;
        $('stat-notes').textContent    = notes.length;
    });
}

// Refresh button
$('btn-refresh').addEventListener('click', () => {
    $('btn-refresh').textContent = '🔄 Refreshing…';
    Promise.all([checkBackend(), checkOllama()]).then(() => {
        $('btn-refresh').textContent = '🔄 Refresh Status';
    });
});

// Initial check on popup open
checkBackend();
checkOllama();
