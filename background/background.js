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
    if (setting && setting.isRunning && !setting.isPaused) {
        await pauseTabRefresh(tabId);
    }
    await updateActionBadge(tabId);
}

// 윈도우 블러 처리
async function handleWindowBlur(tabId) {
    const setting = tabSettings.get(tabId);
    if (setting && setting.isRunning && setting.isPaused) {
        await resumeTabRefresh(tabId);
    }
    await updateActionBadge(tabId);
}

// --- Core Refresh Functions ---

// 통합된 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 윈도우 포커스/블러 이벤트 처리
    if (message.action === 'windowFocused') {
        handleWindowFocus(sender.tab.id);
        return false;
    } else if (message.action === 'windowBlurred') {
        handleWindowBlur(sender.tab.id);
        return false;
    }
    
    // 기존 새로고침 관련 액션 처리
    const actions = {
        startTabRefresh: () => startTabRefresh(message.tabId, message.interval, message.repeatMode, message.repeatCount),
        stopTabRefresh: () => stopTabRefresh(message.tabId),
        removeTabSetting: () => removeTabSetting(message.tabId),
    };
    const action = actions[message.action];
    if (action) action();
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
        chrome.runtime.sendMessage({ action: 'refreshComplete', tabId });
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
    chrome.runtime.sendMessage({ action: 'tabPaused', tabId });
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
    chrome.runtime.sendMessage({ action: 'tabResumed', tabId });
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

async function updateActionBadge(activeTabId) {
    if (activeTabId === null) {
        await chrome.action.setBadgeText({ text: '' });
        return;
    }
    const setting = tabSettings.get(activeTabId);
    if (setting && setting.isRunning) {
        if (setting.isPaused) {
            await chrome.action.setBadgeText({ text: '❚❚' });
            await chrome.action.setBadgeBackgroundColor({ color: '#edac2c' });
        } else {
            const remaining = Math.max(0, Math.round((setting.lastRefresh + setting.interval - Date.now()) / 1000));
            await chrome.action.setBadgeText({ text: `${remaining}s` });
            await chrome.action.setBadgeBackgroundColor({ color: '#3ba55d' });
        }
    } else {
        await chrome.action.setBadgeText({ text: '' });
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
    // 초기화 시, 현재 활성 탭의 배지 업데이트
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab) {
        await updateActionBadge(activeTab.id);
    }

    if (badgeUpdateTimer) clearInterval(badgeUpdateTimer);
    badgeUpdateTimer = setInterval(async () => {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab) await updateActionBadge(activeTab.id);
    }, 1000);
}

chrome.runtime.onStartup.addListener(initialize);
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.local.set({ defaultInterval: 30, tabSettings: {} });
    }
    initialize();
});
''