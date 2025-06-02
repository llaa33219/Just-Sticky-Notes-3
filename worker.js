// Cloudflare Worker for Just Sticky Notes
// 실시간 스티키 노트 커뮤니티 사이트

export class StickyNotesRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }

  async fetch(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(webSocket) {
    webSocket.accept();
    this.sessions.push(webSocket);

    // 새 사용자에게 현재 스티키 노트들 전송
    const existingNotes = await this.getAllNotes();
    webSocket.send(JSON.stringify({
      type: 'init',
      notes: existingNotes
    }));

    webSocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleMessage(data, webSocket);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    webSocket.addEventListener('close', () => {
      this.sessions = this.sessions.filter(session => session !== webSocket);
    });
  }

  async handleMessage(data, sender) {
    const { type, ...payload } = data;

    switch (type) {
      case 'create_note':
        await this.createNote(payload);
        this.broadcast({ type: 'note_created', ...payload }, sender);
        break;
      case 'update_note':
        await this.updateNote(payload);
        this.broadcast({ type: 'note_updated', ...payload }, sender);
        break;
      case 'delete_note':
        await this.deleteNote(payload.id);
        this.broadcast({ type: 'note_deleted', id: payload.id }, sender);
        break;
      case 'move_note':
        await this.moveNote(payload);
        this.broadcast({ type: 'note_moved', ...payload }, sender);
        break;
    }
  }

  broadcast(message, excludeSender = null) {
    this.sessions.forEach(session => {
      if (session !== excludeSender && session.readyState === WebSocket.READY_STATE_OPEN) {
        session.send(JSON.stringify(message));
      }
    });
  }

  async createNote(note) {
    const stmt = this.env.DB.prepare(`
      INSERT INTO sticky_notes (id, content, x, y, color, author, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      note.id,
      note.content,
      note.x,
      note.y,
      note.color,
      note.author,
      new Date().toISOString(),
      new Date().toISOString()
    ).run();
  }

  async updateNote(note) {
    const stmt = this.env.DB.prepare(`
      UPDATE sticky_notes 
      SET content = ?, updated_at = ?
      WHERE id = ?
    `);
    
    await stmt.bind(note.content, new Date().toISOString(), note.id).run();
  }

  async moveNote(note) {
    const stmt = this.env.DB.prepare(`
      UPDATE sticky_notes 
      SET x = ?, y = ?, updated_at = ?
      WHERE id = ?
    `);
    
    await stmt.bind(note.x, note.y, new Date().toISOString(), note.id).run();
  }

  async deleteNote(id) {
    const stmt = this.env.DB.prepare(`DELETE FROM sticky_notes WHERE id = ?`);
    await stmt.bind(id).run();
  }

  async getAllNotes() {
    const stmt = this.env.DB.prepare(`SELECT * FROM sticky_notes ORDER BY created_at DESC`);
    const result = await stmt.all();
    return result.results || [];
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // WebSocket 연결
    if (url.pathname === '/ws') {
      const id = env.ROOM.idFromName('main-room');
      const room = env.ROOM.get(id);
      return room.fetch(request);
    }

    // Google OAuth 인증
    if (url.pathname === '/auth/google') {
      return await handleGoogleAuth(request, env);
    }

    // 정적 파일 서빙
    return await serveStaticFiles(url.pathname);
  }
};

async function handleGoogleAuth(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  
  if (!code) {
    // 구글 로그인 리다이렉트
    const googleAuthUrl = `https://accounts.google.com/oauth2/auth?` +
      `client_id=${env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(url.origin + '/auth/google')}&` +
      `response_type=code&` +
      `scope=openid profile email`;
    
    return Response.redirect(googleAuthUrl);
  }

  // 액세스 토큰 교환
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: url.origin + '/auth/google'
    })
  });

  const tokenData = await tokenResponse.json();
  
  // 사용자 정보 가져오기
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  
  const userData = await userResponse.json();
  
  // 세션 쿠키 설정하고 메인 페이지로 리다이렉트
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': `user_session=${btoa(JSON.stringify(userData))}; HttpOnly; Path=/; SameSite=Strict`
    }
  });
}

async function serveStaticFiles(pathname) {
  const staticFiles = {
    '/': await getIndexHTML(),
    '/style.css': await getStyleCSS(),
    '/script.js': await getScriptJS()
  };

  const content = staticFiles[pathname];
  if (!content) {
    return new Response('Not Found', { status: 404 });
  }

  const contentType = pathname.endsWith('.css') ? 'text/css' : 
                     pathname.endsWith('.js') ? 'application/javascript' : 
                     'text/html';

  return new Response(content, {
    headers: { 'Content-Type': contentType }
  });
}

async function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Just Sticky Notes</title>
    <link rel="stylesheet" href="/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&display=swap" rel="stylesheet">
</head>
<body>
    <div id="app">
        <!-- 로그인 전 화면 -->
        <div id="login-screen" class="login-screen">
            <div class="wood-background"></div>
            <div class="login-note" id="login-note">
                <div class="google-icon">G</div>
                <p>구글 계정으로 로그인</p>
            </div>
        </div>

        <!-- 로그인 후 메인 화면 -->
        <div id="main-screen" class="main-screen hidden">
            <!-- 무한 캔버스 -->
            <div id="canvas-container" class="canvas-container">
                <div id="canvas" class="canvas">
                    <div class="wood-texture"></div>
                </div>
            </div>

            <!-- 도구 바 -->
            <div id="toolbar" class="toolbar">
                <button id="move-tool" class="tool-btn active" title="이동 도구">
                    <span>✋</span>
                </button>
                <button id="note-tool" class="tool-btn" title="스티키 노트 생성">
                    <span>📝</span>
                </button>
                <div class="zoom-controls">
                    <button id="zoom-in" class="zoom-btn" title="확대">+</button>
                    <button id="zoom-out" class="zoom-btn" title="축소">-</button>
                    <span id="zoom-level">100%</span>
                </div>
            </div>

            <!-- 스티키 노트 에디터 -->
            <div id="note-editor" class="note-editor hidden">
                <div class="editor-header">
                    <input type="color" id="note-color" value="#fff740">
                    <button id="close-editor">×</button>
                </div>
                <textarea id="note-content" placeholder="스티키 노트에 적을 내용을 입력하세요..."></textarea>
                <div class="editor-tools">
                    <button id="underline-btn" class="editor-tool">밑줄</button>
                    <button id="circle-btn" class="editor-tool">동그라미</button>
                    <button id="save-note" class="save-btn">저장</button>
                </div>
            </div>
        </div>
    </div>
    <script src="/script.js"></script>
</body>
</html>`;
}

async function getStyleCSS() {
  return `/* Just Sticky Notes CSS */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Kalam', cursive;
    overflow: hidden;
    user-select: none;
}

.hidden {
    display: none !important;
}

/* 로그인 화면 */
.login-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 1000;
}

.wood-background {
    width: 100%;
    height: 100%;
    background: 
        linear-gradient(90deg, rgba(139, 69, 19, 0.1) 1px, transparent 1px),
        linear-gradient(rgba(139, 69, 19, 0.1) 1px, transparent 1px),
        linear-gradient(45deg, #8B4513 25%, transparent 25%, transparent 75%, #8B4513 75%, #8B4513),
        linear-gradient(45deg, #A0522D 25%, transparent 25%, transparent 75%, #A0522D 75%, #A0522D);
    background-color: #D2691E;
    background-size: 20px 20px, 20px 20px, 40px 40px, 40px 40px;
    background-position: 0 0, 0 0, 0 0, 20px 20px;
    filter: brightness(1.1) contrast(1.1);
}

.login-note {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 200px;
    height: 200px;
    background: #fff740;
    box-shadow: 2px 2px 10px rgba(0,0,0,0.3);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    border-radius: 2px;
    border: 1px solid #f0e000;
}

.login-note:hover {
    transform: translate(-50%, -50%) scale(1.05) rotate(2deg);
    box-shadow: 4px 4px 15px rgba(0,0,0,0.4);
}

.google-icon {
    width: 60px;
    height: 60px;
    background: #4285f4;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 20px;
}

.login-note p {
    font-size: 16px;
    color: #333;
    text-align: center;
}

/* 메인 화면 */
.main-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
}

.canvas-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
}

.canvas {
    position: absolute;
    width: 200%;
    height: 200%;
    top: -50%;
    left: -50%;
    transform-origin: center;
    transition: transform 0.1s ease-out;
}

.wood-texture {
    width: 100%;
    height: 100%;
    background: 
        linear-gradient(90deg, rgba(139, 69, 19, 0.1) 1px, transparent 1px),
        linear-gradient(rgba(139, 69, 19, 0.1) 1px, transparent 1px),
        linear-gradient(45deg, #8B4513 25%, transparent 25%, transparent 75%, #8B4513 75%, #8B4513),
        linear-gradient(45deg, #A0522D 25%, transparent 25%, transparent 75%, #A0522D 75%, #A0522D);
    background-color: #D2691E;
    background-size: 20px 20px, 20px 20px, 40px 40px, 40px 40px;
    background-position: 0 0, 0 0, 0 0, 20px 20px;
    filter: brightness(1.1) contrast(1.1);
}

/* 스티키 노트 */
.sticky-note {
    position: absolute;
    width: 150px;
    min-height: 150px;
    background: #fff740;
    box-shadow: 2px 2px 8px rgba(0,0,0,0.2);
    padding: 15px;
    font-family: 'Kalam', cursive;
    font-size: 14px;
    line-height: 1.4;
    color: #333;
    cursor: pointer;
    border-radius: 2px;
    border: 1px solid #f0e000;
    word-wrap: break-word;
    transition: all 0.2s ease;
    z-index: 10;
}

.sticky-note:hover {
    transform: scale(1.02) rotate(1deg);
    box-shadow: 4px 4px 12px rgba(0,0,0,0.3);
    z-index: 20;
}

.sticky-note.selected {
    border: 2px solid #ff6b6b;
    z-index: 30;
}

.sticky-note .note-content {
    white-space: pre-wrap;
    outline: none;
    border: none;
    background: transparent;
    width: 100%;
    height: 100%;
    resize: none;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
}

/* 도구 바 */
.toolbar {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    padding: 10px 20px;
    border-radius: 25px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    gap: 15px;
    z-index: 100;
}

.tool-btn {
    width: 45px;
    height: 45px;
    border: none;
    border-radius: 50%;
    background: #f0f0f0;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
}

.tool-btn:hover {
    transform: scale(1.1);
    background: #e0e0e0;
}

.tool-btn.active {
    background: #4285f4;
    color: white;
}

.zoom-controls {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border-left: 1px solid #ddd;
}

.zoom-btn {
    width: 30px;
    height: 30px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
}

.zoom-btn:hover {
    background: #f0f0f0;
}

#zoom-level {
    margin: 0 5px;
    font-size: 12px;
    color: #666;
    min-width: 40px;
    text-align: center;
}

/* 노트 에디터 */
.note-editor {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    height: 250px;
    background: #fff740;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    z-index: 200;
    padding: 20px;
    border: 2px solid #f0e000;
}

.editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

#note-color {
    width: 40px;
    height: 30px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

#close-editor {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
}

#close-editor:hover {
    background: rgba(0,0,0,0.1);
}

#note-content {
    width: 100%;
    height: 120px;
    border: none;
    background: transparent;
    font-family: 'Kalam', cursive;
    font-size: 14px;
    resize: none;
    outline: none;
    margin-bottom: 15px;
}

.editor-tools {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.editor-tool {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-size: 12px;
}

.editor-tool:hover {
    background: #f0f0f0;
}

.save-btn {
    padding: 8px 20px;
    background: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}

.save-btn:hover {
    background: #3367d6;
}

/* 애니메이션 */
@keyframes noteCreate {
    0% {
        transform: scale(0) rotate(180deg);
        opacity: 0;
    }
    50% {
        transform: scale(1.2) rotate(90deg);
        opacity: 0.8;
    }
    100% {
        transform: scale(1) rotate(0deg);
        opacity: 1;
    }
}

@keyframes loginNoteFall {
    0% {
        transform: translate(-50%, -50%) rotate(0deg);
    }
    25% {
        transform: translate(-50%, -30%) rotate(10deg);
    }
    50% {
        transform: translate(-50%, 10%) rotate(-5deg);
    }
    75% {
        transform: translate(-50%, 50%) rotate(3deg);
    }
    100% {
        transform: translate(-50%, 100vh) rotate(0deg);
        opacity: 0;
    }
}

.sticky-note.creating {
    animation: noteCreate 0.5s ease-out;
}

.login-note.falling {
    animation: loginNoteFall 1s ease-in;
}

/* 반응형 */
@media (max-width: 768px) {
    .toolbar {
        bottom: 10px;
        padding: 8px 15px;
    }
    
    .tool-btn {
        width: 40px;
        height: 40px;
        font-size: 16px;
    }
    
    .note-editor {
        width: 90%;
        height: 200px;
    }
    
    .sticky-note {
        width: 120px;
        min-height: 120px;
        padding: 10px;
        font-size: 12px;
    }
}`;
}

async function getScriptJS() {
  return `// Just Sticky Notes JavaScript

class JustStickyNotes {
    constructor() {
        this.ws = null;
        this.currentTool = 'move';
        this.isLoggedIn = false;
        this.currentUser = null;
        this.notes = new Map();
        this.selectedNote = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.zoom = 1;
        this.panOffset = { x: 0, y: 0 };
        this.isCreatingNote = false;
        
        this.init();
    }

    init() {
        this.checkLoginStatus();
        this.setupEventListeners();
        this.connectWebSocket();
    }

    checkLoginStatus() {
        // 쿠키에서 사용자 세션 확인
        const cookies = document.cookie.split(';');
        const userSession = cookies.find(cookie => cookie.trim().startsWith('user_session='));
        
        if (userSession) {
            try {
                const userData = JSON.parse(atob(userSession.split('=')[1]));
                this.currentUser = userData;
                this.isLoggedIn = true;
                this.showMainScreen();
            } catch (error) {
                console.error('Invalid session:', error);
                this.showLoginScreen();
            }
        } else {
            this.showLoginScreen();
        }
    }

    showLoginScreen() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('main-screen').classList.add('hidden');
    }

    showMainScreen() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-screen').classList.remove('hidden');
    }

    setupEventListeners() {
        // 로그인 버튼
        const loginNote = document.getElementById('login-note');
        if (loginNote) {
            loginNote.addEventListener('click', this.handleLogin.bind(this));
        }

        // 도구 버튼들
        document.getElementById('move-tool').addEventListener('click', () => this.setTool('move'));
        document.getElementById('note-tool').addEventListener('click', () => this.setTool('note'));

        // 줌 컨트롤
        document.getElementById('zoom-in').addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoom-out').addEventListener('click', () => this.zoom(0.8));

        // 캔버스 이벤트
        const canvas = document.getElementById('canvas');
        canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleCanvasMouseUp.bind(this));
        canvas.addEventListener('wheel', this.handleCanvasWheel.bind(this));

        // 노트 에디터
        document.getElementById('close-editor').addEventListener('click', this.closeNoteEditor.bind(this));
        document.getElementById('save-note').addEventListener('click', this.saveNote.bind(this));

        // 키보드 이벤트
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    handleLogin() {
        const loginNote = document.getElementById('login-note');
        loginNote.classList.add('falling');
        
        setTimeout(() => {
            window.location.href = '/auth/google';
        }, 1000);
    }

    setTool(tool) {
        this.currentTool = tool;
        
        // 도구 버튼 스타일 업데이트
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tool + '-tool').classList.add('active');
        
        // 커서 스타일 변경
        const canvas = document.getElementById('canvas');
        canvas.style.cursor = tool === 'move' ? 'grab' : 'crosshair';
    }

    connectWebSocket() {
        if (!this.isLoggedIn) return;

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(\`\${protocol}//\${location.host}/ws\`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            // 재연결 시도
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'init':
                this.loadNotes(data.notes);
                break;
            case 'note_created':
                this.addNote(data);
                break;
            case 'note_updated':
                this.updateNote(data);
                break;
            case 'note_deleted':
                this.removeNote(data.id);
                break;
            case 'note_moved':
                this.moveNote(data);
                break;
        }
    }

    loadNotes(notes) {
        notes.forEach(note => this.addNote(note, false));
    }

    addNote(noteData, animate = true) {
        const note = this.createNoteElement(noteData);
        if (animate) {
            note.classList.add('creating');
        }
        
        document.getElementById('canvas').appendChild(note);
        this.notes.set(noteData.id, { element: note, data: noteData });
    }

    createNoteElement(noteData) {
        const note = document.createElement('div');
        note.className = 'sticky-note';
        note.style.left = noteData.x + 'px';
        note.style.top = noteData.y + 'px';
        note.style.backgroundColor = noteData.color || '#fff740';
        note.dataset.id = noteData.id;

        const content = document.createElement('div');
        content.className = 'note-content';
        content.textContent = noteData.content;
        note.appendChild(content);

        // 노트 이벤트 리스너
        note.addEventListener('mousedown', (e) => this.handleNoteMouseDown(e, noteData.id));
        note.addEventListener('dblclick', (e) => this.editNote(noteData.id));

        return note;
    }

    handleCanvasMouseDown(e) {
        if (this.currentTool === 'note' && !this.isCreatingNote) {
            this.createNote(e);
        } else if (this.currentTool === 'move') {
            this.startPanning(e);
        }
    }

    handleCanvasMouseMove(e) {
        if (this.isDragging && this.selectedNote) {
            this.dragNote(e);
        } else if (this.isPanning) {
            this.panCanvas(e);
        }
    }

    handleCanvasMouseUp(e) {
        if (this.isDragging && this.selectedNote) {
            this.stopDragging();
        } else if (this.isPanning) {
            this.stopPanning();
        }
    }

    handleCanvasWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoomAt(delta, e.clientX, e.clientY);
    }

    createNote(e) {
        this.isCreatingNote = true;
        const rect = document.getElementById('canvas').getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panOffset.x) / this.zoom;
        const y = (e.clientY - rect.top - this.panOffset.y) / this.zoom;

        // 노트 에디터 표시
        this.currentNoteData = {
            id: this.generateId(),
            x: x,
            y: y,
            color: '#fff740',
            content: '',
            author: this.currentUser.email
        };

        this.showNoteEditor();
    }

    showNoteEditor() {
        document.getElementById('note-editor').classList.remove('hidden');
        document.getElementById('note-content').focus();
    }

    closeNoteEditor() {
        document.getElementById('note-editor').classList.add('hidden');
        this.isCreatingNote = false;
        this.currentNoteData = null;
    }

    saveNote() {
        const content = document.getElementById('note-content').value.trim();
        const color = document.getElementById('note-color').value;

        if (!content) {
            alert('내용을 입력해주세요!');
            return;
        }

        this.currentNoteData.content = content;
        this.currentNoteData.color = color;

        // WebSocket으로 전송
        this.ws.send(JSON.stringify({
            type: 'create_note',
            ...this.currentNoteData
        }));

        // 로컬에 추가
        this.addNote(this.currentNoteData);

        this.closeNoteEditor();
        
        // 폼 리셋
        document.getElementById('note-content').value = '';
        document.getElementById('note-color').value = '#fff740';
    }

    handleNoteMouseDown(e, noteId) {
        e.stopPropagation();
        
        if (this.currentTool === 'move') {
            this.startDragging(e, noteId);
        }
    }

    startDragging(e, noteId) {
        this.isDragging = true;
        this.selectedNote = noteId;
        
        const note = this.notes.get(noteId);
        const rect = note.element.getBoundingClientRect();
        
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        note.element.classList.add('selected');
        document.body.style.cursor = 'grabbing';
    }

    dragNote(e) {
        if (!this.selectedNote) return;

        const note = this.notes.get(this.selectedNote);
        const rect = document.getElementById('canvas').getBoundingClientRect();
        
        const x = (e.clientX - rect.left - this.dragOffset.x - this.panOffset.x) / this.zoom;
        const y = (e.clientY - rect.top - this.dragOffset.y - this.panOffset.y) / this.zoom;

        note.element.style.left = x + 'px';
        note.element.style.top = y + 'px';
        note.data.x = x;
        note.data.y = y;
    }

    stopDragging() {
        if (!this.selectedNote) return;

        const note = this.notes.get(this.selectedNote);
        note.element.classList.remove('selected');

        // 위치 업데이트를 서버에 전송
        this.ws.send(JSON.stringify({
            type: 'move_note',
            id: this.selectedNote,
            x: note.data.x,
            y: note.data.y
        }));

        this.isDragging = false;
        this.selectedNote = null;
        document.body.style.cursor = 'default';
    }

    startPanning(e) {
        this.isPanning = true;
        this.lastPanPoint = { x: e.clientX, y: e.clientY };
        document.getElementById('canvas').style.cursor = 'grabbing';
    }

    panCanvas(e) {
        if (!this.isPanning) return;

        const dx = e.clientX - this.lastPanPoint.x;
        const dy = e.clientY - this.lastPanPoint.y;

        this.panOffset.x += dx;
        this.panOffset.y += dy;

        this.updateCanvasTransform();
        this.lastPanPoint = { x: e.clientX, y: e.clientY };
    }

    stopPanning() {
        this.isPanning = false;
        document.getElementById('canvas').style.cursor = this.currentTool === 'move' ? 'grab' : 'crosshair';
    }

    zoomCanvas(factor) {
        this.zoom *= factor;
        this.zoom = Math.max(0.1, Math.min(5, this.zoom));
        this.updateCanvasTransform();
        this.updateZoomLevel();
    }

    zoomAt(factor, x, y) {
        const newZoom = this.zoom * factor;
        const clampedZoom = Math.max(0.1, Math.min(5, newZoom));
        
        if (clampedZoom !== this.zoom) {
            const rect = document.getElementById('canvas').getBoundingClientRect();
            const offsetX = x - rect.left - this.panOffset.x;
            const offsetY = y - rect.top - this.panOffset.y;
            
            this.panOffset.x += offsetX * (1 - factor);
            this.panOffset.y += offsetY * (1 - factor);
            
            this.zoom = clampedZoom;
            this.updateCanvasTransform();
            this.updateZoomLevel();
        }
    }

    updateCanvasTransform() {
        const canvas = document.getElementById('canvas');
        canvas.style.transform = \`translate(\${this.panOffset.x}px, \${this.panOffset.y}px) scale(\${this.zoom})\`;
    }

    updateZoomLevel() {
        document.getElementById('zoom-level').textContent = Math.round(this.zoom * 100) + '%';
    }

    editNote(noteId) {
        const note = this.notes.get(noteId);
        if (!note) return;

        // 기존 에디터 로직 (추후 구현)
        console.log('Edit note:', noteId);
    }

    updateNote(noteData) {
        const note = this.notes.get(noteData.id);
        if (note) {
            note.element.querySelector('.note-content').textContent = noteData.content;
            note.data = { ...note.data, ...noteData };
        }
    }

    moveNote(noteData) {
        const note = this.notes.get(noteData.id);
        if (note) {
            note.element.style.left = noteData.x + 'px';
            note.element.style.top = noteData.y + 'px';
            note.data.x = noteData.x;
            note.data.y = noteData.y;
        }
    }

    removeNote(noteId) {
        const note = this.notes.get(noteId);
        if (note) {
            note.element.remove();
            this.notes.delete(noteId);
        }
    }

    handleKeyDown(e) {
        switch (e.key) {
            case 'Escape':
                this.closeNoteEditor();
                break;
            case 'Delete':
                if (this.selectedNote) {
                    this.deleteNote(this.selectedNote);
                }
                break;
        }
    }

    deleteNote(noteId) {
        this.ws.send(JSON.stringify({
            type: 'delete_note',
            id: noteId
        }));
        this.removeNote(noteId);
    }

    generateId() {
        return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new JustStickyNotes();
});`;
}

async function createDatabaseSchema() {
  return `-- Cloudflare D1 Database Schema for Just Sticky Notes

CREATE TABLE IF NOT EXISTS sticky_notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    color TEXT DEFAULT '#fff740',
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_created_at ON sticky_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_author ON sticky_notes(author);`;
} 