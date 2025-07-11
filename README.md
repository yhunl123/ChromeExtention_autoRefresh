# Auto Refresh Chrome Extension

웹페이지를 자동으로 새로고침하는 크롬 확장프로그램입니다.

## 기능

- 🕐 설정 가능한 새로고침 간격 (1초 ~ 1시간)
- 🎵 새로고침 완료 시 소리 알림 (선택사항)
- 💾 설정 자동 저장
- 🎨 모던하고 직관적인 UI
- 🔄 실시간 다음 새로고침 시간 표시
- 🛡️ 안전한 새로고침 (chrome:// 페이지 제외)
- 📄 **페이지별 개별 설정** - 각 웹페이지마다 독립적으로 새로고침 설정
- ⏸️ **스마트 일시정지** - 사용자가 페이지를 활성화하면 자동으로 일시정지
- ▶️ **자동 재시작** - 페이지가 비활성화되면 자동으로 새로고침 재시작
- 🔄 **반복 실행** - 설정한 간격으로 계속해서 새로고침 실행

## 설치 방법

### 개발자 모드로 설치

1. Chrome 브라우저에서 `chrome://extensions/` 접속
2. 우측 상단의 "개발자 모드" 토글 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 버튼 클릭
4. 이 프로젝트 폴더 선택

### 아이콘 생성 (선택사항)

아이콘을 생성하려면:
1. `icons/generate_icons.html` 파일을 브라우저에서 열기
2. "모든 아이콘 다운로드" 버튼 클릭
3. 다운로드된 PNG 파일들을 `icons/` 폴더에 저장

## 사용법

### 기본 사용법
1. 확장프로그램 아이콘 클릭
2. 새로고침 간격 설정 (초 단위)
3. "시작" 버튼 클릭
4. 필요시 "중지" 버튼으로 중단

### 페이지별 설정
- 각 웹페이지마다 독립적으로 새로고침을 설정할 수 있습니다
- 페이지 목록에서 개별적으로 시작/중지/삭제가 가능합니다
- 현재 활성 페이지는 녹색으로 표시됩니다

### 스마트 일시정지 기능
- 사용자가 페이지를 활성화하면 자동으로 새로고침이 일시정지됩니다
- 페이지가 비활성화되면 자동으로 새로고침이 재시작됩니다
- 일시정지 상태는 UI에 명확히 표시됩니다

## 프로젝트 구조

```
auto_refresh/
├── manifest.json          # 확장프로그램 메타데이터
├── popup/
│   ├── popup.html         # 팝업 UI
│   ├── popup.css          # 팝업 스타일
│   └── popup.js           # 팝업 로직
├── background/
│   └── background.js      # 백그라운드 스크립트
├── content/
│   └── content.js         # 콘텐츠 스크립트
├── icons/
│   ├── icon.svg           # SVG 아이콘
│   ├── generate_icons.html # 아이콘 생성기
│   ├── icon16.png         # 16x16 아이콘
│   ├── icon48.png         # 48x48 아이콘
│   └── icon128.png        # 128x128 아이콘
└── README.md              # 프로젝트 설명
```

## 기술 스택

- **Manifest V3**: 최신 크롬 확장프로그램 API
- **Vanilla JavaScript**: 순수 자바스크립트 사용
- **CSS3**: 모던 CSS 스타일링
- **Chrome Extension APIs**: tabs, storage, scripting

## 주요 파일 설명

### manifest.json
확장프로그램의 메타데이터와 권한을 정의합니다.

### popup/
사용자가 확장프로그램 아이콘을 클릭했을 때 나타나는 팝업 UI입니다.

### background/
백그라운드에서 실행되는 서비스 워커로, 자동 새로고침 로직을 처리합니다.

### content/
웹페이지에 주입되는 스크립트로, 페이지 이벤트를 감지합니다.

## 개발 가이드

### 로컬 개발

1. 프로젝트 폴더를 코드 에디터로 열기
2. 파일 수정 후 크롬 확장프로그램 페이지에서 새로고침
3. 변경사항 확인

### 디버깅

- **팝업 디버깅**: 팝업에서 우클릭 → "검사"
- **백그라운드 디버깅**: 확장프로그램 페이지에서 "서비스 워커 검사"
- **콘텐츠 스크립트 디버깅**: 웹페이지에서 개발자 도구 사용

## 권한 설명

- `activeTab`: 현재 활성 탭에 접근
- `storage`: 설정 저장 및 복원
- `scripting`: 탭 새로고침 실행

## 라이선스

MIT License

## 기여하기

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 문제 해결

### 확장프로그램이 작동하지 않는 경우

1. 개발자 도구에서 오류 메시지 확인
2. 권한이 올바르게 설정되었는지 확인
3. manifest.json 파일이 유효한지 확인

### 아이콘이 표시되지 않는 경우

1. `icons/` 폴더에 PNG 파일이 있는지 확인
2. 파일명이 `manifest.json`과 일치하는지 확인
3. 파일 크기가 올바른지 확인

## 업데이트 로그

### v1.0.0
- 초기 버전 릴리즈
- 기본 자동 새로고침 기능
- 설정 저장 기능
- 소리 알림 기능 