// 탭별 새로고침 관리
let tabTimers = new Map(); // tabId -> 타이머 ID
let tabSettings = new Map(); // tabId -> 설정 정보
let badgeUpdateTimer = null; // 배지 업데이트 타이머

// --- Event Listeners for Activity Changes ---

// 1. 사용자가 창 포커스를 변경할 때 (가장 중요한 로직)
chrome.windows.onFocusChanged.addListener(async (focusedWindowId) => {
    // 모든 실행중인 탭을 순회하며 상태를 재평가
    for (const tabId of tabSettings.keys()) {
        const setting = tabSettings.get(tabId);
        if (!setting || !setting.isRunning) continue;

        try {
            const tab = await chrome.tabs.get(tabId);
            // 일시정지 조건: 탭이 활성상태이고, 그 탭의 창이 방금 포커스된 창일 때
            const shouldBePaused = tab.active && tab.windowId === focusedWindowId;
            
            if (shouldBePaused && !setting.isPaused) {
                await pauseTabRefresh(tabId);
            } else if (!shouldBePaused && setting.isPaused) {
                await resumeTabRefresh(tabId);
            }
        } catch (e) {
            // 탭이 닫혔을 수 있음
        }
    }

    // 포커스된 창의 활성 탭 기준으로 배지 업데이트
    if (focusedWindowId !== chrome.windows.WINDOW_ID_NONE) {
        const [activeTab] = await chrome.tabs.query({ active: true, windowId: focusedWindowId });
        if (activeTab) await updateActionBadge(activeTab.id);
    } else {
        await chrome.action.setBadgeText({ text: '' });
    }
});

// 2. 사용자가 창 내에서 탭을 전환할 때
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const { tabId, windowId } = activeInfo;

    // 새로 활성화된 탭은 일시정지 될 수 있음
    const newActiveTabSetting = tabSettings.get(tabId);
    if (newActiveTabSetting && newActiveTabSetting.isRunning) {
        await pauseTabRefresh(tabId);
    }

    // 같은 창의 다른 탭들은 이제 비활성이므로 재개될 수 있음
    for (const otherTabId of tabSettings.keys()) {
        if (otherTabId === tabId) continue;
        const setting = tabSettings.get(otherTabId);
        if (setting && setting.isRunning && setting.isPaused) {
            try {
                const tab = await chrome.tabs.get(otherTabId);
                if (tab.windowId === windowId) {
                    await resumeTabRefresh(otherTabId);
                }
            } catch (e) {}
        }
    }
    await updateActionBadge(tabId);
});


// --- Core Refresh Functions ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    // 시작 직후, 이 탭이 활성/포커스 상태인지 바로 확인하여 일시정지 처리
    try {
        const tab = await chrome.tabs.get(tabId);
        const window = await chrome.windows.get(tab.windowId);
        if (tab.active && window.focused) {
            await pauseTabRefresh(tabId);
        }
    } catch(e) {}
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
    // 초기화 시, 현재 활성/포커스된 탭 상태를 확인
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab) {
        const window = await chrome.windows.get(activeTab.windowId);
        if (window.focused) {
            await pauseTabRefresh(activeTab.id);
        }
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
        await chrome.storage.local.set({ defaultInterval: 30, enableSound: true, tabSettings: {} });
    }
    initialize();
});
''