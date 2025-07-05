// 탭별 새로고침 관리
let tabTimers = new Map(); // tabId -> 타이머 ID
let tabSettings = new Map(); // tabId -> 설정 정보
let badgeUpdateTimer = null; // 배지 업데이트 타이머

// --- Event Listeners for Activity Changes ---

// 1. Content Script에서 보내는 윈도우 포커스/블러 이벤트 처리
// (메시지 리스너는 아래 Core Refresh Functions 섹션에서 통합 처리됨)

// 윈도우 포커스 처리
async function handleWindowFocus(tabId) {
    const setting = tabSettings.get(tabId);
    if (setting && setting.isRunning) {
        await pauseTabRefresh(tabId);
    }
    await updateActionBadge(tabId);
}

// 윈도우 블러 처리
async function handleWindowBlur(tabId) {
    const setting = tabSettings.get(tabId);
    if (setting && setting.isRunning) {
        await resumeTabRefresh(tabId);
    }
    await updateActionBadge(tabId);
}

// --- Core Refresh Functions ---

// 통합된 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getTabStatus') {
        const setting = tabSettings.get(message.tabId);
        sendResponse && sendResponse({ isRunning: !!(setting && setting.isRunning) });
        return true;
    }
    if (message.action === 'windowFocused') {
        handleWindowFocus(sender.tab?.id);
        sendResponse && sendResponse({ result: 'ok' });
        return true;
    } else if (message.action === 'windowBlurred') {
        handleWindowBlur(sender.tab?.id);
        sendResponse && sendResponse({ result: 'ok' });
        return true;
    }
    const actions = {
        startTabRefresh: () => startTabRefresh(message.tabId, message.interval, message.repeatMode, message.repeatCount),
        stopTabRefresh: () => stopTabRefresh(message.tabId),
        removeTabSetting: () => removeTabSetting(message.tabId),
    };
    const action = actions[message.action];
    if (action) {
        Promise.resolve(action()).then(() => {
            sendResponse && sendResponse({ result: 'ok' });
        });
        return true;
    }
    return false;
});

async function startTabRefresh(tabId, interval, repeatMode = 'infinite', repeatCount = 0) {
    if (tabTimers.has(tabId)) clearInterval(tabTimers.get(tabId));
    
    tabSettings.set(tabId, {
        interval, isRunning: true, isPaused: false, repeatMode, repeatCount,
        currentCount: 0, lastRefresh: Date.now(), startTime: Date.now()
    });
    
    const timerId = setInterval(() => refreshTab(tabId), interval);
    tabTimers.set(tabId, timerId);
    console.log(`탭 새로고침 시작: ${tabId}`);
    
    await updateTabSettings();
    await updateActionBadge(tabId);
}

async function stopTabRefresh(tabId) {
    if (tabTimers.has(tabId)) {
        clearInterval(tabTimers.get(tabId));
        tabTimers.delete(tabId);
    }
    if (tabSettings.has(tabId)) tabSettings.get(tabId).isRunning = false;
    console.log(`탭 새로고침 중지: ${tabId}`);
    await updateTabSettings();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && tabId === activeTab.id) await updateActionBadge(activeTab.id);
}

async function removeTabSetting(tabId) {
    await stopTabRefresh(tabId);
    tabSettings.delete(tabId);
    console.log(`탭 설정 삭제: ${tabId}`);
    await updateTabSettings();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && tabId === activeTab.id) await updateActionBadge(activeTab.id);
}

async function refreshTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || tab.url.startsWith('chrome://')) throw new Error('유효하지 않은 탭');
        
        await chrome.tabs.reload(tabId);
        
        const setting = tabSettings.get(tabId);
        if (setting) {
            setting.lastRefresh = Date.now();
            setting.currentCount++;
            if (setting.repeatMode === 'count' && setting.currentCount >= setting.repeatCount) {
                await stopTabRefresh(tabId);
                return;
            }
        }
        try {
            chrome.runtime.sendMessage({ action: 'refreshComplete', tabId });
        } catch (e) {}
    } catch (error) {
        await removeTabSetting(tabId);
    }
}

async function pauseTabRefresh(tabId) {
    const setting = tabSettings.get(tabId);
    if (!setting || !setting.isRunning || setting.isPaused) return;
    setting.isPaused = true;
    if (tabTimers.has(tabId)) {
        clearInterval(tabTimers.get(tabId));
        tabTimers.delete(tabId);
    }
    console.log(`탭 일시정지: ${tabId}`);
    try {
        chrome.runtime.sendMessage({ action: 'tabPaused', tabId });
    } catch (e) {}
    await updateTabSettings();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && tabId === activeTab.id) await updateActionBadge(activeTab.id);
}

async function resumeTabRefresh(tabId) {
    const setting = tabSettings.get(tabId);
    if (!setting || !setting.isRunning || !setting.isPaused) return;
    setting.isPaused = false;
    setting.lastRefresh = Date.now();
    const timerId = setInterval(() => refreshTab(tabId), setting.interval);
    tabTimers.set(tabId, timerId);
    console.log(`탭 재시작: ${tabId}`);
    try {
        chrome.runtime.sendMessage({ action: 'tabResumed', tabId });
    } catch (e) {}
    await updateTabSettings();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && tabId === activeTab.id) await updateActionBadge(activeTab.id);
}

// --- Utility Functions ---

async function updateTabSettings() {
    const settings = {};
    for (const [tabId, setting] of tabSettings) settings[tabId] = setting;
    await chrome.storage.local.set({ tabSettings: settings });
}

async function updateActionBadge(tabId) {
    if (tabId === null || tabId === undefined) return;
    const setting = tabSettings.get(tabId);
    if (setting && setting.isRunning) {
        if (setting.isPaused) {
            await chrome.action.setBadgeText({ text: '❚❚', tabId });
            await chrome.action.setBadgeBackgroundColor({ color: '#edac2c', tabId });
        } else {
            const remaining = Math.max(0, Math.round((setting.lastRefresh + setting.interval - Date.now()) / 1000));
            await chrome.action.setBadgeText({ text: `${remaining}s`, tabId });
            await chrome.action.setBadgeBackgroundColor({ color: '#3ba55d', tabId });
        }
    } else {
        await chrome.action.setBadgeText({ text: '', tabId });
    }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (tabSettings.has(tabId)) await removeTabSetting(tabId);
});

// --- Initialization ---

async function loadSavedSettings() {
    const { tabSettings: savedSettings } = await chrome.storage.local.get(['tabSettings']);
    if (!savedSettings) return;
    for (const [tabIdStr, setting] of Object.entries(savedSettings)) {
        const tabId = parseInt(tabIdStr);
        try {
            await chrome.tabs.get(tabId);
            tabSettings.set(tabId, setting);
            if (setting.isRunning) {
                const timerId = setInterval(() => refreshTab(tabId), setting.interval);
                tabTimers.set(tabId, timerId);
            }
        } catch (e) {}
    }
}

async function initialize() {
    await loadSavedSettings();
    // 모든 자동 새로고침 탭에 배지 업데이트
    for (const [tabId, setting] of tabSettings) {
        if (setting.isRunning) {
            await updateActionBadge(Number(tabId));
        }
    }
    if (badgeUpdateTimer) clearInterval(badgeUpdateTimer);
    badgeUpdateTimer = setInterval(async () => {
        for (const [tabId, setting] of tabSettings) {
            if (setting.isRunning) {
                await updateActionBadge(Number(tabId));
            }
        }
    }, 1000);
}

chrome.runtime.onStartup.addListener(initialize);
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.local.set({ defaultInterval: 30, tabSettings: {} });
    }
    initialize();
});