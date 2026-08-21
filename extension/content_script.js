/**
 * SIH PS Helper — Content Script
 * Injected into: https://sih.gov.in/sih2026PS (and 2025/2024)
 *
 * Features:
 *   1. Personal Notes  — stored in Python backend (SQLite), fallback: chrome.storage.local
 *   2. Reviewed status — stored in Python backend (SQLite), fallback: chrome.storage.local
 *   3. AI Chat         — streams from local Ollama (localhost:11434)
 *
 * Storage keys:
 *   Backend: /notes/{ps_id}   /status/{ps_id}
 *   Fallback: sih_ps_notes_{ps_id}   sih_ps_status_{ps_id}
 *
 * Ollama CORS:
 *   Start Ollama with: OLLAMA_ORIGINS="*" ollama serve
 */

(function () {
    'use strict';

    // ─── Configuration ────────────────────────────────────────────────
    const BACKEND_URL  = 'http://127.0.0.1:7842';
    const OLLAMA_URL   = 'http://127.0.0.1:11434';
    const OLLAMA_MODEL = 'qwen3:8b';   // ← change model here

    const QUICK_ACTIONS = [
        'Explain this PS',
        'Suggest a solution',
        'Find the hardest parts',
        'How can we make this unique?',
        'Suggest AI/ML usage',
        'Give me an architecture',
        'What would judges question?',
        'Estimate difficulty',
    ];

    // Backend health cache (avoids repeated failed requests)
    let backendOnline = null;  // null = unknown, true/false = known

    // ─── Utility ──────────────────────────────────────────────────────
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function log(...args) {
        console.log('[SIH Helper]', ...args);
    }

    // ─── PS Extraction ────────────────────────────────────────────────
    /**
     * Extract structured PS data from an open modal element.
     * Reads the <th>/<td> table inside the modal body.
     */
    function getProblemStatement(modalEl) {
        const ps = {
            id: '', title: '', description: '', organization: '',
            department: '', category: '', theme: '', dataset: '', contact: '',
        };
        if (!modalEl) return ps;

        const rows = modalEl.querySelectorAll('table tr');
        rows.forEach(function (row) {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            if (!th || !td) return;
            const label = (th.textContent || '').trim().toLowerCase();
            // innerText gives rendered text (no HTML tags), textContent includes hidden text
            const value = (td.innerText || td.textContent || '').trim();
            if      (label.includes('problem statement id'))  ps.id           = value;
            else if (label.includes('title'))                 ps.title        = value;
            else if (label.includes('description'))           ps.description  = value;
            else if (label.includes('organization'))          ps.organization = value;
            else if (label.includes('department'))            ps.department   = value;
            else if (label.includes('category'))              ps.category     = value;
            else if (label.includes('theme'))                 ps.theme        = value;
            else if (label.includes('dataset'))               ps.dataset      = value;
            else if (label.includes('contact'))               ps.contact      = value;
        });
        return ps;
    }

    /**
     * Extract a stable numeric PS ID (e.g. "26001") from the modal.
     * Falls back to parsing the modal's DOM id attribute.
     */
    function getPsId(ps, modalEl) {
        if (ps.id && ps.id.trim()) return ps.id.trim().replace(/\s+/g, '');
        if (modalEl && modalEl.id) {
            const m = modalEl.id.match(/\d+/);
            if (m) return m[0];
        }
        return 'unknown';
    }

    // ─── Backend API calls ────────────────────────────────────────────
    async function checkBackendHealth() {
        try {
            const r = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
            backendOnline = r.ok;
        } catch {
            backendOnline = false;
        }
        return backendOnline;
    }

    async function backendGet(path) {
        const r = await fetch(`${BACKEND_URL}${path}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) throw new Error(`Backend ${r.status}`);
        return r.json();
    }

    async function backendPut(path, body) {
        const r = await fetch(`${BACKEND_URL}${path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) throw new Error(`Backend ${r.status}`);
        return r.json();
    }

    // ─── Storage with backend + chrome.storage.local fallback ─────────
    const LS_NOTES  = 'sih_ps_notes_';
    const LS_STATUS = 'sih_ps_status_';

    async function loadNotes(psId) {
        if (backendOnline !== false) {
            try {
                const data = await backendGet(`/notes/${psId}`);
                backendOnline = true;
                return data.note || '';
            } catch { backendOnline = false; }
        }
        // Fallback: chrome.storage.local
        return new Promise(resolve => {
            chrome.storage.local.get([LS_NOTES + psId], result => {
                resolve(result[LS_NOTES + psId] || '');
            });
        });
    }

    async function saveNotes(psId, text) {
        // Always save to fallback storage first (instant, reliable)
        chrome.storage.local.set({ [LS_NOTES + psId]: text });
        // Then try backend
        if (backendOnline !== false) {
            try {
                await backendPut(`/notes/${psId}`, { note: text });
                backendOnline = true;
            } catch { backendOnline = false; }
        }
    }

    async function loadStatus(psId) {
        if (backendOnline !== false) {
            try {
                const data = await backendGet(`/status/${psId}`);
                backendOnline = true;
                return !!data.reviewed;
            } catch { backendOnline = false; }
        }
        return new Promise(resolve => {
            chrome.storage.local.get([LS_STATUS + psId], result => {
                resolve(result[LS_STATUS + psId] === true);
            });
        });
    }

    async function saveStatus(psId, bool) {
        chrome.storage.local.set({ [LS_STATUS + psId]: bool });
        if (backendOnline !== false) {
            try {
                await backendPut(`/status/${psId}`, { reviewed: bool });
                backendOnline = true;
            } catch { backendOnline = false; }
        }
    }

    // ─── Ollama client ────────────────────────────────────────────────
    const SYSTEM_PROMPT = `You are a senior technical mentor reviewing a Smart India Hackathon (SIH) Problem Statement.

Your role is to help a college student/team deeply understand and strategically approach the problem.

When answering, always:
1. CLEARLY DISTINGUISH between:
   * FACTS - explicitly stated in the PS
   * ASSUMPTIONS - reasonable technical inferences
   * SUGGESTIONS - your opinions/recommendations
2. Do NOT invent requirements absent from the PS.
3. If the PS is ambiguous or under-specified, say so clearly.
4. Be practical and specific to the SIH context (college teams, prototype demos, judges).

You can help with:
- Understanding the core problem and hidden challenges
- Suggesting solution architectures
- Identifying where AI/ML/DL/NLP/RAG/CV/Cybersecurity genuinely helps
- Estimating feasibility for a college team
- Anticipating judge questions
- Highlighting strong vs weak implementations
- Identifying required datasets, APIs, and infrastructure
- Defining a realistic prototype scope

Respond concisely but thoroughly. Use bullet points where appropriate.`;

    function buildPsContext(ps) {
        return [
            'Problem Statement ID : ' + ps.id,
            'Title                : ' + ps.title,
            'Organization         : ' + ps.organization,
            ps.department ? 'Department           : ' + ps.department : '',
            'Category             : ' + ps.category,
            'Theme                : ' + ps.theme,
            '',
            '--- Description / Background ---',
            ps.description,
            ps.dataset ? '\nDataset Link : ' + ps.dataset : '',
        ].filter(Boolean).join('\n').trim();
    }

    async function askOllama(messages, onChunk, onDone, onError) {
        let resp;
        try {
            resp = await fetch(`${OLLAMA_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true }),
            });
        } catch (err) {
            onError(new Error(
                `Ollama is not running or unreachable at ${OLLAMA_URL}.\n` +
                `Start Ollama with CORS enabled:\n  OLLAMA_ORIGINS="*" ollama serve\n\n` +
                `Error: ${err.message}`
            ));
            return;
        }
        if (!resp.ok) {
            let body = '';
            try { body = await resp.text(); } catch (_) {}
            onError(new Error(`Ollama HTTP ${resp.status}: ${body}`));
            return;
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = dec.decode(value, { stream: true });
                for (const line of text.split('\n')) {
                    const t = line.trim();
                    if (!t) continue;
                    try {
                        const obj = JSON.parse(t);
                        const chunk = obj?.message?.content;
                        if (chunk) onChunk(chunk);
                        if (obj?.done) { onDone(); return; }
                    } catch (_) { /* skip */ }
                }
            }
            onDone();
        } catch (err) {
            onError(new Error('Stream error: ' + err.message));
        }
    }

    // ─── Chat UI helpers ──────────────────────────────────────────────
    function renderMessage(chatLog, role, text) {
        const wrap = document.createElement('div');
        wrap.className = 'sih-chat-msg sih-chat-msg--' + role;

        const lbl = document.createElement('span');
        lbl.className   = 'sih-chat-label';
        lbl.textContent = role === 'user' ? 'You' : role === 'ai' ? 'AI Mentor' : 'Error';

        const bubble  = document.createElement('div');
        bubble.className = 'sih-chat-bubble';

        const content = document.createElement('span');
        content.className = 'sih-chat-content';
        applyMarkdown(content, text);

        bubble.appendChild(content);
        wrap.appendChild(lbl);
        wrap.appendChild(bubble);
        chatLog.appendChild(wrap);
        chatLog.scrollTop = chatLog.scrollHeight;
        return content;
    }

    /**
     * Render simple Markdown: **bold**, `code`, newlines.
     * Streams safely by building from accumulated text.
     */
    function applyMarkdown(span, raw) {
        let html = escHtml(raw);
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        html = html.replace(/\n/g, '<br>');
        span.innerHTML = html;
    }

    // ─── Main injection ───────────────────────────────────────────────
    /**
     * Builds and injects the helper panel into an open PS modal.
     * Safe to call multiple times — guards against double-injection.
     */
    async function injectHelperPanel(modalEl) {
        if (modalEl.querySelector('.sih-helper-root')) return;

        const ps   = getProblemStatement(modalEl);
        const psId = getPsId(ps, modalEl);
        log(`Injecting helper for PS ${psId}: "${ps.title.substring(0, 50)}"`);

        // ── Root ───────────────────────────────────────────────────
        const root = document.createElement('div');
        root.className = 'sih-helper-root';
        root.setAttribute('data-ps-id', psId);

        // ── Status bar ─────────────────────────────────────────────
        const statusBar = document.createElement('div');
        statusBar.className = 'sih-status-bar';

        const chk = document.createElement('input');
        chk.type      = 'checkbox';
        chk.id        = 'sih-reviewed-' + psId;

        const chkLabel = document.createElement('label');
        chkLabel.htmlFor   = chk.id;
        chkLabel.className = 'sih-reviewed-label';
        chkLabel.innerHTML = '&#10003;&nbsp;Mark as Reviewed';

        // Backend status dot
        const backendDot = document.createElement('span');
        backendDot.className = 'sih-backend-indicator';
        backendDot.innerHTML = '<span class="sih-backend-dot"></span><span class="sih-backend-label">backend</span>';

        const psChip = document.createElement('span');
        psChip.className   = 'sih-ps-chip';
        psChip.textContent = ps.title
            ? '📋 ' + ps.title.substring(0, 55) + (ps.title.length > 55 ? '…' : '')
            : '📋 Problem Statement';

        statusBar.appendChild(chk);
        statusBar.appendChild(chkLabel);
        statusBar.appendChild(backendDot);
        statusBar.appendChild(psChip);
        root.appendChild(statusBar);

        // Load status asynchronously
        loadStatus(psId).then(reviewed => {
            chk.checked = reviewed;
            if (reviewed) statusBar.classList.add('sih-status-bar--reviewed');
            updateBackendDot(backendDot);
        });

        chk.addEventListener('change', async function () {
            await saveStatus(psId, chk.checked);
            statusBar.classList.toggle('sih-status-bar--reviewed', chk.checked);
            updateBackendDot(backendDot);
            applyReviewedToRow(psId, chk.checked);
        });

        // ── Notes section ──────────────────────────────────────────
        const notesSection = document.createElement('div');
        notesSection.className = 'sih-section';

        const notesHeader = document.createElement('div');
        notesHeader.className = 'sih-section-header';
        notesHeader.innerHTML =
            '<span class="sih-section-icon">📝</span>' +
            '<span class="sih-section-title">Personal Notes</span>' +
            '<span class="sih-notes-saved-indicator" id="sih-saved-' + psId + '"></span>';

        const notesArea = document.createElement('textarea');
        notesArea.className   = 'sih-notes-textarea';
        notesArea.placeholder = 'Write your notes here…\nSaved automatically to the local Python backend (SQLite).';
        notesArea.rows        = 5;

        // Load notes asynchronously
        loadNotes(psId).then(note => {
            notesArea.value = note;
        });

        let notesDebounce;
        notesArea.addEventListener('input', function () {
            clearTimeout(notesDebounce);
            notesDebounce = setTimeout(async function () {
                await saveNotes(psId, notesArea.value);
                updateBackendDot(backendDot);
                const ind = document.getElementById('sih-saved-' + psId);
                if (ind) {
                    ind.textContent = backendOnline ? 'Saved to DB ✓' : 'Saved locally ✓';
                    ind.classList.add('visible');
                    setTimeout(() => ind.classList.remove('visible'), 2500);
                }
            }, 600);
        });

        notesSection.appendChild(notesHeader);
        notesSection.appendChild(notesArea);
        root.appendChild(notesSection);

        // ── AI Chat section ────────────────────────────────────────
        const aiSection = document.createElement('div');
        aiSection.className = 'sih-ai-section';

        const aiToggleBtn = document.createElement('button');
        aiToggleBtn.className = 'sih-ai-toggle-btn';
        aiToggleBtn.innerHTML =
            '🤖&nbsp;Ask AI about this PS' +
            '&nbsp;&nbsp;<small style="opacity:.7;font-size:11px;">Model: ' + OLLAMA_MODEL + '</small>' +
            '&nbsp;&nbsp;<span class="sih-caret">▼</span>';

        const aiBody = document.createElement('div');
        aiBody.className = 'sih-ai-body';

        let aiOpen = false;
        aiToggleBtn.addEventListener('click', function () {
            aiOpen = !aiOpen;
            aiBody.classList.toggle('sih-ai-body--open', aiOpen);
            aiToggleBtn.querySelector('.sih-caret').textContent = aiOpen ? '▲' : '▼';
        });

        const chatLog = document.createElement('div');
        chatLog.className = 'sih-chat-log';

        const quickRow = document.createElement('div');
        quickRow.className = 'sih-quick-row';

        const inputRow = document.createElement('div');
        inputRow.className = 'sih-input-row';

        const inputArea = document.createElement('textarea');
        inputArea.className   = 'sih-chat-input';
        inputArea.placeholder = 'Ask anything about this PS… (Enter = send, Shift+Enter = newline)';
        inputArea.rows        = 2;

        const sendBtn = document.createElement('button');
        sendBtn.className = 'sih-send-btn';
        sendBtn.innerHTML = '&#9658;&nbsp;Send';

        inputRow.appendChild(inputArea);
        inputRow.appendChild(sendBtn);

        const aiStatus = document.createElement('div');
        aiStatus.className = 'sih-ai-status';

        // Build conversation history (system + PS context included from first message)
        const history = [{
            role: 'system',
            content: SYSTEM_PROMPT + '\n\n--- CURRENT PROBLEM STATEMENT ---\n' + buildPsContext(ps),
        }];
        let streaming = false;

        function setLoading(on) {
            streaming       = on;
            sendBtn.disabled  = on;
            inputArea.disabled = on;
            aiStatus.textContent   = on ? '⏳ AI is thinking…' : '';
            aiStatus.style.display = on ? 'block' : 'none';
            quickRow.querySelectorAll('.sih-quick-btn').forEach(b => { b.disabled = on; });
        }

        function send(text) {
            text = (text || inputArea.value).trim();
            if (!text || streaming) return;
            inputArea.value = '';
            renderMessage(chatLog, 'user', text);
            history.push({ role: 'user', content: text });
            setLoading(true);

            const aiSpan = renderMessage(chatLog, 'ai', '');
            let accumulated = '';

            askOllama(
                history,
                chunk => {
                    accumulated += chunk;
                    applyMarkdown(aiSpan, accumulated);
                    chatLog.scrollTop = chatLog.scrollHeight;
                },
                () => {
                    history.push({ role: 'assistant', content: accumulated });
                    setLoading(false);
                    chatLog.scrollTop = chatLog.scrollHeight;
                },
                err => {
                    const failedMsg = aiSpan.closest('.sih-chat-msg');
                    if (failedMsg) failedMsg.remove();
                    renderMessage(chatLog, 'error', err.message);
                    setLoading(false);
                }
            );
        }

        QUICK_ACTIONS.forEach(qa => {
            const btn = document.createElement('button');
            btn.className   = 'sih-quick-btn';
            btn.textContent = qa;
            btn.addEventListener('click', () => send(qa));
            quickRow.appendChild(btn);
        });

        inputArea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
        sendBtn.addEventListener('click', () => send());

        aiBody.appendChild(chatLog);
        aiBody.appendChild(quickRow);
        aiBody.appendChild(inputRow);
        aiBody.appendChild(aiStatus);

        aiSection.appendChild(aiToggleBtn);
        aiSection.appendChild(aiBody);
        root.appendChild(aiSection);

        // ── Inject into modal ──────────────────────────────────────
        const modalBody = modalEl.querySelector('.modal-body');
        const target    = modalBody || modalEl.querySelector('.modal-content');
        if (target) target.appendChild(root);
    }

    // ─── Table row highlight ──────────────────────────────────────────
    function applyReviewedToRow(psId, reviewed) {
        // The SIH26XXX number cell: numeric ID "26001" → "SIH26001"
        const sihNum = 'SIH26' + String(psId).replace('26', '').padStart(3, '0');
        // More robust: find the td whose text matches the psId exactly
        document.querySelectorAll('#dataTablePS tbody tr').forEach(row => {
            const tds = row.querySelectorAll('td');
            // PS Number is the 5th column (index 4)
            const psNumTd = tds[4];
            if (!psNumTd) return;
            const cell = psNumTd.textContent.trim();
            if (cell === 'SIH26' + psId.replace(/^26/, '') || cell.replace(/\D/g, '') === psId) {
                row.classList.toggle('sih-row-reviewed', reviewed);
            }
        });
    }

    async function applyAllReviewedHighlights() {
        const rows = document.querySelectorAll('#dataTablePS tbody tr');
        for (const row of rows) {
            const tds = row.querySelectorAll('td');
            const psNumTd = tds[4];
            if (!psNumTd) continue;
            const m = psNumTd.textContent.trim().match(/\d+/);
            if (!m) continue;
            const psId = m[0];
            // Try chrome.storage.local for fast lookup (backend may be slow)
            const key = LS_STATUS + psId;
            chrome.storage.local.get([key], result => {
                if (result[key] === true) row.classList.add('sih-row-reviewed');
            });
        }
    }

    // ─── Backend dot updater ──────────────────────────────────────────
    function updateBackendDot(dotContainer) {
        if (!dotContainer) return;
        const dot   = dotContainer.querySelector('.sih-backend-dot');
        const label = dotContainer.querySelector('.sih-backend-label');
        if (!dot || !label) return;
        if (backendOnline === true) {
            dot.className   = 'sih-backend-dot online';
            label.textContent = 'DB online';
        } else if (backendOnline === false) {
            dot.className   = 'sih-backend-dot offline';
            label.textContent = 'DB offline (local fallback)';
        } else {
            dot.className   = 'sih-backend-dot';
            label.textContent = 'backend';
        }
    }

    // ─── Modal Scan & Injection ───────────────────────────────────────
    function isPsModal(modalEl) {
        if (!modalEl || !modalEl.id) return false;
        const idLower = modalEl.id.toLowerCase();
        if (idLower.includes('problemstatement') || idLower.includes('problem_statement') || idLower.includes('ps')) return true;
        // Check if modal contains PS table
        const text = modalEl.textContent || '';
        return text.includes('Problem Statement') || text.includes('Organization') || text.includes('Category');
    }

    function scanAndInjectAllModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modalEl => {
            if (isPsModal(modalEl)) {
                injectHelperPanel(modalEl);
            }
        });
    }

    // ─── Event & Mutation Listeners ───────────────────────────────────
    function setupListeners() {
        // 1. Click listener (Capturing phase)
        document.addEventListener('click', function (e) {
            const trigger = e.target.closest('[data-toggle="modal"], [data-target], [href^="#ViewProblemStatement"], a[href^="#"]');
            if (trigger) {
                const targetAttr = trigger.getAttribute('data-target') || trigger.getAttribute('href') || '';
                const targetId = targetAttr.replace(/^#/, '');
                if (targetId) {
                    const modalEl = document.getElementById(targetId);
                    if (modalEl) {
                        injectHelperPanel(modalEl);
                    }
                    setTimeout(() => {
                        const m = document.getElementById(targetId);
                        if (m) injectHelperPanel(m);
                    }, 60);
                    setTimeout(() => {
                        const m = document.getElementById(targetId);
                        if (m) injectHelperPanel(m);
                    }, 250);
                }
            }
            // General scan after any click
            setTimeout(scanAndInjectAllModals, 100);
        }, true);

        // 2. MutationObserver: watches for new DOM nodes and modal attribute changes
        const domObserver = new MutationObserver(function () {
            scanAndInjectAllModals();
            applyAllReviewedHighlights();
        });

        domObserver.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'aria-hidden'],
        });

        // 3. Fallback intervals during initial page load
        let scans = 0;
        const interval = setInterval(function () {
            scanAndInjectAllModals();
            applyAllReviewedHighlights();
            scans++;
            if (scans > 20) clearInterval(interval);
        }, 400);
    }

    // ─── DataTable observer for row highlights ────────────────────────
    function watchDataTable() {
        const tableEl = document.getElementById('dataTablePS') || document.querySelector('table.dataTable') || document.querySelector('table');
        if (!tableEl) return;

        const tbody = tableEl.querySelector('tbody');
        if (tbody) {
            const obs = new MutationObserver(applyAllReviewedHighlights);
            obs.observe(tbody, { childList: true, subtree: false });
        }

        applyAllReviewedHighlights();
    }

    // ─── Init ─────────────────────────────────────────────────────────
    async function init() {
        log('Initialising SIH PS Helper on', window.location.href);

        // Check backend health without blocking UI
        checkBackendHealth().then(online => {
            log('Backend status:', online ? 'online (http://127.0.0.1:7842)' : 'offline (using chrome.storage.local)');
        });

        // Immediate pre-scan & injection
        scanAndInjectAllModals();
        watchDataTable();
        setupListeners();
        applyAllReviewedHighlights();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
