// 콘텐츠 스크립트 - 웹페이지에서 실행됨
console.log('Auto Refresh 콘텐츠 스크립트가 로드되었습니다.');

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
            
        case 'showNotification':
            // 페이지에 알림 표시 (선택사항)
            showPageNotification(message.text);
            break;
    }
});

// 페이지에 알림 표시하는 함수
function showPageNotification(text) {
    // 기존 알림이 있다면 제거
    const existingNotification = document.getElementById('auto-refresh-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // 새 알림 생성
    const notification = document.createElement('div');
    notification.id = 'auto-refresh-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        max-width: 300px;
        animation: slideIn 0.3s ease;
    `;
    
    notification.textContent = text;
    
    // 애니메이션 CSS 추가
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    // 알림을 페이지에 추가
    document.body.appendChild(notification);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 3000);
    
    // slideOut 애니메이션 추가
    const slideOutStyle = document.createElement('style');
    slideOutStyle.textContent = `
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(slideOutStyle);
}

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