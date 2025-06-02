# Just Sticky Notes 🗒️

실시간 스티키 노트 커뮤니티 사이트 - Cloudflare Worker 기반

## 🌟 특징

- 🔐 **구글 OAuth 로그인**: 간단한 원클릭 로그인
- 🗒️ **실시간 스티키 노트**: WebSocket을 통한 실시간 동기화
- 🗺️ **무한 맵**: 자유롭게 탐색할 수 있는 나무 배경 캔버스
- ✍️ **손글씨 폰트**: 자연스러운 스티키 노트 느낌
- 🎨 **컬러 커스터마이징**: 다양한 색상의 스티키 노트
- 📱 **반응형 디자인**: 모바일과 데스크톱 지원
- ⚡ **빠른 성능**: Cloudflare Edge Network 활용

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install -g wrangler
npm install
```

### 2. Cloudflare D1 데이터베이스 생성

```bash
# D1 데이터베이스 생성
npm run db:create

# 출력된 database_id를 wrangler.toml에 복사하세요
```

### 3. 환경 변수 설정

`wrangler.toml` 파일에서 다음 설정을 업데이트하세요:

```toml
[vars]
GOOGLE_CLIENT_ID = "your-google-client-id"

[[d1_databases]]
binding = "DB"
database_name = "sticky-notes-db"
database_id = "your-database-id"  # 위에서 생성한 ID
```

### 4. Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. APIs & Services > Credentials로 이동
4. OAuth 2.0 Client ID 생성:
   - Application type: Web application
   - Authorized redirect URIs: `https://your-domain.workers.dev/auth/google`
5. Client ID와 Client Secret을 `wrangler.toml`에 추가

### 5. 데이터베이스 초기화

```bash
npm run db:init
```

### 6. 개발 서버 실행

```bash
npm run dev
```

### 7. 배포

```bash
npm run deploy
```

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript, CSS3, HTML5
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Real-time**: WebSocket + Durable Objects
- **Authentication**: Google OAuth 2.0
- **Hosting**: Cloudflare Edge Network

## 📂 프로젝트 구조

```
just-sticky-notes/
├── worker.js          # 메인 Cloudflare Worker 코드
├── wrangler.toml       # Cloudflare Worker 설정
├── package.json        # 프로젝트 설정
├── schema.sql          # 데이터베이스 스키마
└── README.md          # 프로젝트 문서
```

## 🎮 사용법

### 로그인
1. 사이트 접속 시 나무 배경에 구글 로그인 스티키 노트가 표시됩니다
2. 스티키 노트를 클릭하면 떨어지는 애니메이션과 함께 구글 로그인이 시작됩니다

### 도구 사용
- **✋ 이동 도구**: 캔버스 이동, 줌인/줌아웃, 스티키 노트 드래그
- **📝 노트 도구**: 캔버스 클릭으로 새 스티키 노트 생성

### 스티키 노트 조작
- **생성**: 노트 도구 선택 후 캔버스 클릭
- **편집**: 스티키 노트 더블클릭
- **이동**: 이동 도구로 드래그
- **삭제**: 스티키 노트 선택 후 Delete 키

## 🔧 주요 설정

### Cloudflare D1 설정
데이터베이스 이름: `sticky-notes-db`
- 스티키 노트 데이터 저장
- 실시간 동기화 지원

### Durable Objects 설정
클래스명: `StickyNotesRoom`
- WebSocket 연결 관리
- 실시간 메시지 브로드캐스팅

### Google OAuth 설정
필요한 스코프:
- `openid`
- `profile`
- `email`

## 🎨 커스터마이징

### 스티키 노트 색상
`worker.js`의 `getStyleCSS()` 함수에서 기본 색상을 변경할 수 있습니다.

### 나무 배경 패턴
CSS의 `.wood-texture` 클래스에서 배경 패턴을 수정할 수 있습니다.

### 손글씨 폰트
현재 'Kalam' 폰트를 사용중입니다. Google Fonts에서 다른 손글씨 폰트로 변경 가능합니다.

## 🐛 문제 해결

### WebSocket 연결 실패
- Cloudflare Worker가 올바르게 배포되었는지 확인
- Durable Objects가 활성화되어 있는지 확인

### 구글 로그인 실패
- Google Cloud Console에서 OAuth 설정 확인
- Redirect URI가 정확한지 확인
- Client ID가 올바르게 설정되었는지 확인

### 데이터베이스 오류
- D1 데이터베이스가 생성되었는지 확인
- `wrangler.toml`의 database_id가 정확한지 확인
- 스키마가 올바르게 적용되었는지 확인

## 📞 지원

문제가 있거나 기능 요청이 있으시면 GitHub Issues를 통해 알려주세요.

---

Made with ❤️ for real-time sticky note collaboration 