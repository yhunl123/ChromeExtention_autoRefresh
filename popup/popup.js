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

let currentTab = null;

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

// 현재 탭 상태 업데이트
async function updateCurrentTabStatus() {
    if (!currentTab) return;
    // background에 현재 탭 상태 요청
    chrome.runtime.sendMessage({
        action: 'getTabStatus',
        tabId: currentTab.id
    }, (response) => {
        if (response && response.isRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusText.textContent = '자동 새로고침 실행 중...';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            statusText.textContent = '대기 중...';
        }
        pauseStatus.style.display = 'none';
    });
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
    const repeatMode = document.querySelector('input[name="repeatMode"]:checked').value;
    const repeatCount = repeatMode === 'count' ? parseInt(repeatCountInput.value) : 0;
    if (repeatMode === 'count' && (repeatCount < 1 || repeatCount > 1000)) {
        alert('반복 횟수는 1~1000 사이여야 합니다.');
        return;
    }
    await new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'startTabRefresh',
            tabId: currentTab.id,
            interval: interval * 1000,
            repeatMode: repeatMode,
            repeatCount: repeatCount
        }, resolve);
    });
    updateCurrentTabStatus();
}

// 현재 탭 새로고침 중지
async function stopCurrentTabRefresh() {
    if (!currentTab) return;
    await new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'stopTabRefresh',
            tabId: currentTab.id
        }, resolve);
    });
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
            updateCurrentTabStatus();
            break;
        case 'tabPaused':
            updateCurrentTabStatus();
            break;
        case 'tabResumed':
            updateCurrentTabStatus();
            break;
    }
});