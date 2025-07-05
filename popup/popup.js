// DOM 요소들
const intervalInput = document.getElementById('interval');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const nextRefresh = document.getElementById('nextRefresh');
const pauseStatus = document.getElementById('pauseStatus');

const currentPage = document.getElementById('currentPage');
const pageList = document.getElementById('pageList');
const repeatModeInputs = document.querySelectorAll('input[name="repeatMode"]');
const repeatCountContainer = document.querySelector('.repeat-count-container');
const repeatCountInput = document.getElementById('repeatCount');

let refreshInterval = null;
let nextRefreshTime = null;
let currentTab = null;
let tabSettings = {};

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await initializePopup();
});

// 팝업 초기화
async function initializePopup() {
    // 현재 탭 정보 가져오기
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    
    // 현재 페이지 정보 표시
    updateCurrentPageInfo();
    
    // 저장된 설정 불러오기
    await loadSettings();
    
    // 탭별 설정 불러오기
    await loadTabSettings();
    
    // 탭 목록 업데이트
    updateTabList();
    
    // 현재 탭 상태 업데이트
    updateCurrentTabStatus();
    
    // 이벤트 리스너 설정
    setupEventListeners();
}

// 현재 페이지 정보 업데이트
function updateCurrentPageInfo() {
    if (currentTab) {
        const domain = new URL(currentTab.url).hostname;
        currentPage.textContent = `현재 페이지: ${domain}`;
    }
}

// 설정 불러오기
async function loadSettings() {
    const result = await chrome.storage.local.get(['defaultInterval', 'defaultRepeatMode', 'defaultRepeatCount']);
    
    if (result.defaultInterval) {
        intervalInput.value = result.defaultInterval;
    }
    
    if (result.defaultRepeatMode) {
        document.querySelector(`input[name="repeatMode"][value="${result.defaultRepeatMode}"]`).checked = true;
        handleRepeatModeChange();
    }
    
    if (result.defaultRepeatCount) {
        repeatCountInput.value = result.defaultRepeatCount;
    }
}

// 탭별 설정 불러오기
async function loadTabSettings() {
    const result = await chrome.storage.local.get(['tabSettings']);
    tabSettings = result.tabSettings || {};
}

// 탭 목록 업데이트
function updateTabList() {
    pageList.innerHTML = '';
    
    Object.keys(tabSettings).forEach(tabId => {
        const setting = tabSettings[tabId];
        const tabItem = createTabItem(tabId, setting);
        pageList.appendChild(tabItem);
    });
    
    if (Object.keys(tabSettings).length === 0) {
        pageList.innerHTML = '<p style="text-align: center; color: #718096; font-size: 12px;">설정된 탭이 없습니다.</p>';
    }
}

// 탭 아이템 생성
function createTabItem(tabId, setting) {
    const tabItem = document.createElement('div');
    tabItem.className = 'page-item';
    if (currentTab && currentTab.id === parseInt(tabId)) {
        tabItem.classList.add('active');
    }
    
    const domain = setting.url ? new URL(setting.url).hostname : '알 수 없음';
    const title = setting.title || domain;
    const repeatText = setting.repeatMode === 'count' ? 
        `(${setting.currentCount || 0}/${setting.repeatCount})` : 
        '(무한 반복)';
    
    tabItem.innerHTML = `
        <div class="page-info-text">
            <div class="page-title">${title}</div>
            <div class="page-url">${domain}</div>
            <div class="page-status">${setting.isRunning ? '실행 중' : '중지됨'} (${setting.interval/1000}초) ${repeatText}</div>
        </div>
        <div class="page-controls">
            <button class="btn-start" ${setting.isRunning ? 'disabled' : ''}>시작</button>
            <button class="btn-stop" ${!setting.isRunning ? 'disabled' : ''}>중지</button>
            <button class="btn-remove">삭제</button>
        </div>
    `;
    
    // 이벤트 리스너 추가
    const startBtn = tabItem.querySelector('.btn-start');
    const stopBtn = tabItem.querySelector('.btn-stop');
    const removeBtn = tabItem.querySelector('.btn-remove');
    
    startBtn.addEventListener('click', () => startTabRefresh(tabId));
    stopBtn.addEventListener('click', () => stopTabRefresh(tabId));
    removeBtn.addEventListener('click', () => removeTabSetting(tabId));
    
    return tabItem;
}

// 현재 탭 상태 업데이트
function updateCurrentTabStatus() {
    if (!currentTab) return;
    
    const setting = tabSettings[currentTab.id];
    if (setting && setting.isRunning) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusText.textContent = '자동 새로고침 실행 중...';
        
        // 일시정지 상태 확인
        if (setting.isPaused) {
            pauseStatus.style.display = 'block';
            statusText.textContent = '탭 활성화로 일시정지됨';
        } else {
            pauseStatus.style.display = 'none';
        }
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusText.textContent = '대기 중...';
        pauseStatus.style.display = 'none';
    }
}

// 이벤트 리스너 설정
function setupEventListeners() {
    startBtn.addEventListener('click', startCurrentTabRefresh);
    stopBtn.addEventListener('click', stopCurrentTabRefresh);
    intervalInput.addEventListener('change', saveDefaultSettings);

    
    // 반복 옵션 이벤트 리스너
    repeatModeInputs.forEach(input => {
        input.addEventListener('change', handleRepeatModeChange);
    });
    
    repeatCountInput.addEventListener('change', saveDefaultSettings);
}

// 현재 탭 새로고침 시작
async function startCurrentTabRefresh() {
    if (!currentTab) return;
    
    const interval = parseInt(intervalInput.value);
    if (interval < 1) {
        alert('간격은 1초 이상이어야 합니다.');
        return;
    }
    
    // 반복 옵션 가져오기
    const repeatMode = document.querySelector('input[name="repeatMode"]:checked').value;
    const repeatCount = repeatMode === 'count' ? parseInt(repeatCountInput.value) : 0;
    
    if (repeatMode === 'count' && (repeatCount < 1 || repeatCount > 1000)) {
        alert('반복 횟수는 1~1000 사이여야 합니다.');
        return;
    }
    
    await startTabRefresh(currentTab.id, interval, repeatMode, repeatCount);
}

// 탭 새로고침 시작
async function startTabRefresh(tabId, interval = null, repeatMode = 'infinite', repeatCount = 0) {
    if (!interval) {
        interval = parseInt(intervalInput.value);
    }
    
    // 탭 설정 저장
    tabSettings[tabId] = {
        interval: interval * 1000,
        isRunning: true,
        isPaused: false,
        repeatMode: repeatMode,
        repeatCount: repeatCount,
        currentCount: 0,
        title: currentTab?.title || '알 수 없음',
        url: currentTab?.url || '',
        lastStarted: Date.now()
    };
    
    await chrome.storage.local.set({ tabSettings });
    
    // 백그라운드에 메시지 전송
    chrome.runtime.sendMessage({
        action: 'startTabRefresh',
        tabId: tabId,
        interval: interval * 1000,
        repeatMode: repeatMode,
        repeatCount: repeatCount
    });
    
    // UI 업데이트
    updateTabList();
    updateCurrentTabStatus();
}

// 현재 탭 새로고침 중지
async function stopCurrentTabRefresh() {
    if (!currentTab) return;
    await stopTabRefresh(currentTab.id);
}

// 탭 새로고침 중지
async function stopTabRefresh(tabId) {
    if (tabSettings[tabId]) {
        tabSettings[tabId].isRunning = false;
        tabSettings[tabId].isPaused = false;
        await chrome.storage.local.set({ tabSettings });
    }
    
    // 백그라운드에 메시지 전송
    chrome.runtime.sendMessage({
        action: 'stopTabRefresh',
        tabId: tabId
    });
    
    // UI 업데이트
    updateTabList();
    updateCurrentTabStatus();
}

// 탭 설정 삭제
async function removeTabSetting(tabId) {
    delete tabSettings[tabId];
    await chrome.storage.local.set({ tabSettings });
    
    // 백그라운드에 메시지 전송
    chrome.runtime.sendMessage({
        action: 'removeTabSetting',
        tabId: tabId
    });
    
    // UI 업데이트
    updateTabList();
    updateCurrentTabStatus();
}

// 반복 옵션 변경 처리
function handleRepeatModeChange() {
    const selectedMode = document.querySelector('input[name="repeatMode"]:checked').value;
    
    if (selectedMode === 'count') {
        repeatCountContainer.style.display = 'block';
    } else {
        repeatCountContainer.style.display = 'none';
    }
}

// 기본 설정 저장
async function saveDefaultSettings() {
    await chrome.storage.local.set({
        defaultInterval: parseInt(intervalInput.value),
        defaultRepeatMode: document.querySelector('input[name="repeatMode"]:checked').value,
        defaultRepeatCount: parseInt(repeatCountInput.value)
    });
}

// 메시지 리스너 (백그라운드에서 오는 메시지)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'refreshComplete':
            // 탭 목록 업데이트 (반복 횟수 변경 반영)
            updateTabList();
            break;
        case 'tabPaused':
            updateCurrentTabStatus();
            updateTabList();
            break;
        case 'tabResumed':
            updateCurrentTabStatus();
            updateTabList();
            break;
    }
});

 