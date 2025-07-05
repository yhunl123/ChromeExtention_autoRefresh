// 콘텐츠 스크립트 - 웹페이지에서 실행됨
console.log('Auto Refresh 콘텐츠 스크립트가 로드되었습니다.');

// 윈도우 포커스/블러 이벤트 리스너 추가
window.addEventListener('focus', () => {
    console.log('윈도우 포커스됨');
    chrome.runtime.sendMessage({
        action: 'windowFocused',
        url: window.location.href,
        timestamp: Date.now()
    });
});

window.addEventListener('blur', () => {
    console.log('윈도우 블러됨');
    chrome.runtime.sendMessage({
        action: 'windowBlurred',
        url: window.location.href,
        timestamp: Date.now()
    });
});

// 페이지 로드 완료 시 백그라운드에 알림
document.addEventListener('DOMContentLoaded', () => {
    // 백그라운드 스크립트에 페이지 로드 완료 메시지 전송
    chrome.runtime.sendMessage({
        action: 'pageLoaded',
        url: window.location.href,
        timestamp: Date.now()
    });
});

// 페이지가 완전히 로드된 후 실행
window.addEventListener('load', () => {
    console.log('페이지 로드 완료:', window.location.href);
    
    // 페이지 로드 완료를 백그라운드에 알림
    chrome.runtime.sendMessage({
        action: 'pageFullyLoaded',
        url: window.location.href,
        timestamp: Date.now()
    });
});

// 새로고침 이벤트 감지
let isRefreshing = false;

// 페이지가 새로고침되기 전에 실행
window.addEventListener('beforeunload', () => {
    isRefreshing = true;
    
    chrome.runtime.sendMessage({
        action: 'pageRefreshing',
        url: window.location.href,
        timestamp: Date.now()
    });
});

// 메시지 리스너 (백그라운드에서 오는 메시지)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'getPageInfo':
            // 페이지 정보 반환
            sendResponse({
                url: window.location.href,
                title: document.title,
                timestamp: Date.now()
            });
            break;
            

    }
});



// 페이지 성능 정보 수집 (선택사항)
function collectPerformanceInfo() {
    if (window.performance && window.performance.timing) {
        const timing = window.performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        
        chrome.runtime.sendMessage({
            action: 'performanceInfo',
            loadTime: loadTime,
            url: window.location.href,
            timestamp: Date.now()
        });
    }
}

// 페이지 로드 완료 후 성능 정보 수집
window.addEventListener('load', () => {
    setTimeout(collectPerformanceInfo, 1000);
});