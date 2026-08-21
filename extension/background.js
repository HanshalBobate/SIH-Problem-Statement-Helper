/**
 * SIH PS Helper — Background Service Worker (MV3)
 *
 * Minimal service worker. Handles:
 *  - Install / update lifecycle logging
 *  - Badge text updates (called from popup or content script via messaging)
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
        console.log('[SIH Helper] Extension installed.');
    } else if (reason === 'update') {
        console.log('[SIH Helper] Extension updated.');
    }
});

/**
 * Message handler from content script / popup.
 * Currently supports:
 *   { type: 'SET_BADGE', text: string, color: string }
 *   { type: 'PING' }  → responds { pong: true }
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    switch (message.type) {
        case 'PING':
            sendResponse({ pong: true });
            return false;

        case 'SET_BADGE':
            chrome.action.setBadgeText({ text: String(message.text || '') });
            chrome.action.setBadgeBackgroundColor({ color: message.color || '#3a488b' });
            sendResponse({ ok: true });
            return false;

        default:
            return false;
    }
});
