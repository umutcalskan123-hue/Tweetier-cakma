// Global App State
let SERVER_URL = 'http://localhost:3000';
let currentUser = JSON.parse(localStorage.getItem('tweetier_current_user') || 'null');
let currentTab = 'home';
let currentTheme = localStorage.getItem('tweetier_theme') || 'dark';

// Active Chat Target: { type: 'direct', friend: { id, displayName, avatar } } or { type: 'group', group: { id, name, avatar } }
let activeChatTarget = null;
let chatSidebarTab = 'direct'; // 'direct' or 'groups'

// Image attachments state
let selectedPostImageBase64 = null;
let selectedChatImageBase64 = null;
let selectedAvatarBase64 = null;

// Real-time tracking
let knownMessageIds = new Set();
let isFirstPoll = true;
let pollInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  applyTheme(currentTheme);
  checkAuthState();

  // Start polling
  pollInterval = setInterval(pollRealtimeUpdates, 2000);
});

function loadConfig() {
  try {
    if (typeof require !== 'undefined') {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '..', 'config.json');
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (configData.serverUrl) {
          SERVER_URL = configData.serverUrl.endsWith('/') ? configData.serverUrl.slice(0, -1) : configData.serverUrl;
        }
      }
    }
  } catch (e) {
    console.warn('Config load error, using default SERVER_URL:', e);
  }
}

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('tweetier_theme', theme);
  document.body.className = theme === 'light' ? 'light-theme' : 'dark-theme';
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.innerHTML = theme === 'light' ? '☀️ Açık Tema' : '🌙 Koyu Tema';
  }
}

function toggleTheme() {
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
}

// Notification sound generator (Web Audio API)
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    
    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Tone 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08); // A5
    gain2.gain.setValueAtTime(0.2, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

// Real-time Polling
async function pollRealtimeUpdates() {
  if (!currentUser) return;

  try {
    // Check direct messages from all friends
    const friendsRes = await fetch(`${SERVER_URL}/api/friends/${currentUser.id}`);
    if (friendsRes.ok) {
      const friends = await friendsRes.json();
      for (const f of friends) {
        const msgRes = await fetch(`${SERVER_URL}/api/messages/${currentUser.id}/${f.id}`);
        if (msgRes.ok) {
          const msgs = await msgRes.json();
          for (const m of msgs) {
            if (!knownMessageIds.has(m.id)) {
              knownMessageIds.add(m.id);
              if (!isFirstPoll && m.senderId !== currentUser.id) {
                playNotificationSound();
              }
            }
          }
        }
      }
    }

    // Check group messages
    const groupsRes = await fetch(`${SERVER_URL}/api/groups/user/${currentUser.id}`);
    if (groupsRes.ok) {
      const groups = await groupsRes.json();
      for (const g of groups) {
        const gMsgRes = await fetch(`${SERVER_URL}/api/groups/${g.id}/messages`);
        if (gMsgRes.ok) {
          const gMsgs = await gMsgRes.json();
          for (const m of gMsgs) {
            if (!knownMessageIds.has(m.id)) {
              knownMessageIds.add(m.id);
              if (!isFirstPoll && m.senderId !== currentUser.id) {
                playNotificationSound();
              }
            }
          }
        }
      }
    }

    isFirstPoll = false;

    // Refresh active UI tab silently
    if (currentTab === 'messages' && activeChatTarget) {
      if (activeChatTarget.type === 'direct') {
        fetchDirectMessagesSilently();
      } else if (activeChatTarget.type === 'group') {
        fetchGroupMessagesSilently();
      }
    } else if (currentTab === 'home') {
      fetchTimelineSilently();
    }
  } catch (e) {
    // Silently catch network errors
  }
}

function checkAuthState() {
  const modal = document.getElementById('auth-modal');
  if (!currentUser) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
    updateSidebarUser();
    loadCurrentTabContent();
  }
}

let isLoginMode = true;
function switchAuthTab(mode) {
  isLoginMode = mode === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLoginMode);
  document.getElementById('tab-register').classList.toggle('active', !isLoginMode);
  document.getElementById('register-fields').classList.toggle('hidden', isLoginMode);
  document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Giriş Yap' : 'Kayıt Ol';
}

async function handleAuth(event) {
  event.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const displayName = document.getElementById('reg-display-name').value.trim();

  const endpoint = isLoginMode ? '/api/login' : '/api/register';
  const payload = isLoginMode ? { username, password } : { username, password, displayName };

  try {
    const res = await fetch(`${SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');

    currentUser = data.user;
    localStorage.setItem('tweetier_current_user', JSON.stringify(currentUser));
    checkAuthState();
  } catch (err) {
    alert('Hata: ' + err.message + '\nSunucu bağlantısını kontrol edin (' + SERVER_URL + ').');
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('tweetier_current_user');
  checkAuthState();
}

function updateSidebarUser() {
  if (!currentUser) return;
  document.getElementById('sidebar-avatar').src = currentUser.avatar;
  document.getElementById('sidebar-name').innerText = currentUser.displayName;
  document.getElementById('sidebar-handle').innerText = '@' + currentUser.username;
}

function switchTab(tab) {
  currentTab = tab;
  ['home', 'messages', 'friends', 'profile'].forEach(t => {
    const el = document.getElementById(`nav-${t}`);
    if (el) el.classList.toggle('active', t === tab);
  });
  loadCurrentTabContent();
}

function loadCurrentTabContent() {
  if (!currentUser) return;
  const mainArea = document.getElementById('main-content-area');
  
  if (currentTab === 'home') renderHome(mainArea);
  else if (currentTab === 'messages') renderMessages(mainArea);
  else if (currentTab === 'friends') renderFriends(mainArea);
  else if (currentTab === 'profile') renderProfile(mainArea);
}

/* --- HOME / TIMELINE --- */
async function renderHome(container) {
  selectedPostImageBase64 = null;
  container.innerHTML = `
    <div class="header-title">Ana Sayfa</div>
    <div class="tweet-box">
      <img class="avatar" src="${currentUser.avatar}" alt="Avatar">
      <div style="flex: 1;">
        <textarea id="tweet-input" placeholder="Neler oluyor?" rows="3"></textarea>
        
        <div id="tweet-image-preview" class="hidden image-preview-container">
          <img id="tweet-image-preview-img" src="" alt="Post image">
          <button class="remove-img-btn" onclick="removePostImage()">✕</button>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
          <div>
            <input type="file" id="tweet-image-file" accept="image/*" style="display: none;" onchange="handlePostImageSelect(event)">
            <button class="icon-btn" type="button" title="Resim ekle" onclick="document.getElementById('tweet-image-file').click()">📷</button>
          </div>
          <button onclick="postTweet()">Tweetle</button>
        </div>
      </div>
    </div>
    <div id="timeline-feed">
      <div style="padding: 20px; text-align: center; color: var(--text-secondary);">Yükleniyor...</div>
    </div>
  `;
  fetchTimeline();
}

function handlePostImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    selectedPostImageBase64 = evt.target.result;
    const previewContainer = document.getElementById('tweet-image-preview');
    const previewImg = document.getElementById('tweet-image-preview-img');
    if (previewContainer && previewImg) {
      previewImg.src = selectedPostImageBase64;
      previewContainer.classList.remove('hidden');
    }
  };
  reader.readAsDataURL(file);
}

function removePostImage() {
  selectedPostImageBase64 = null;
  const previewContainer = document.getElementById('tweet-image-preview');
  if (previewContainer) previewContainer.classList.add('hidden');
  const fileInput = document.getElementById('tweet-image-file');
  if (fileInput) fileInput.value = '';
}

async function fetchTimeline() {
  fetchTimelineSilently();
}

async function fetchTimelineSilently() {
  try {
    const res = await fetch(`${SERVER_URL}/api/posts?userId=${currentUser.id}`);
    const posts = await res.json();
    const feed = document.getElementById('timeline-feed');
    if (!feed) return;

    if (posts.length === 0) {
      feed.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-secondary);">Henüz hiç tweet yok. İlk tweeti sen at!</div>`;
      return;
    }

    feed.innerHTML = posts.map(post => {
      const isLiked = post.likes.includes(currentUser.id);
      const timeStr = new Date(post.createdAt).toLocaleString('tr-TR');
      return `
        <div class="tweet-card">
          <img class="avatar" src="${post.author.avatar}" alt="Avatar">
          <div class="tweet-content">
            <div class="tweet-header">
              <span class="tweet-name">${escapeHtml(post.author.displayName || post.author.username)}</span>
              <span class="tweet-handle">@${escapeHtml(post.author.username)}</span>
              <span class="tweet-time">· ${timeStr}</span>
            </div>
            ${post.content ? `<div class="tweet-text">${escapeHtml(post.content)}</div>` : ''}
            ${post.image ? `<img class="tweet-image-attached" src="${post.image}" alt="Attached image">` : ''}
            <div class="tweet-actions">
              <div class="action-btn" onclick="likePost('${post.id}')" style="${isLiked ? 'color: #e0245e;' : ''}">
                ${isLiked ? '❤️' : '🤍'} ${post.likes.length}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    const feed = document.getElementById('timeline-feed');
    if (feed && !feed.innerHTML.includes('tweet-card')) {
      feed.innerHTML = `<div style="padding: 20px; text-align: center; color: #ff6b6b;">Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.</div>`;
    }
  }
}

async function postTweet() {
  const content = document.getElementById('tweet-input').value.trim();
  if (!content && !selectedPostImageBase64) return;

  try {
    const res = await fetch(`${SERVER_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, content, image: selectedPostImageBase64 })
    });
    if (!res.ok) throw new Error('Tweet atılamadı.');
    document.getElementById('tweet-input').value = '';
    removePostImage();
    fetchTimeline();
  } catch (err) {
    alert(err.message);
  }
}

async function likePost(postId) {
  try {
    await fetch(`${SERVER_URL}/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
    fetchTimeline();
  } catch (err) {
    console.error(err);
  }
}

/* --- MESSAGES & GROUPS --- */
async function renderMessages(container) {
  container.innerHTML = `
    <div class="header-title">Mesajlar & Gruplar</div>
    <div class="chat-container">
      <div class="chat-sidebar">
        <div class="chat-tab-headers">
          <div class="chat-tab-btn ${chatSidebarTab === 'direct' ? 'active' : ''}" onclick="switchChatSidebarTab('direct')">Direkt Mesajlar</div>
          <div class="chat-tab-btn ${chatSidebarTab === 'groups' ? 'active' : ''}" onclick="switchChatSidebarTab('groups')">Gruplar</div>
        </div>
        <div class="chat-friends-list-container" id="chat-sidebar-list">
          <div style="padding: 15px; color: var(--text-secondary);">Yükleniyor...</div>
        </div>
      </div>
      <div class="chat-main" id="chat-main-area">
        <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: var(--text-secondary);">
          Sohbet etmek için soldan bir arkadaş veya grup seçin.
        </div>
      </div>
    </div>
  `;

  loadChatSidebarContent();
}

function switchChatSidebarTab(tab) {
  chatSidebarTab = tab;
  loadChatSidebarContent();
  renderMessages(document.getElementById('main-content-area'));
}

async function loadChatSidebarContent() {
  const listEl = document.getElementById('chat-sidebar-list');
  if (!listEl) return;

  if (chatSidebarTab === 'direct') {
    try {
      const res = await fetch(`${SERVER_URL}/api/friends/${currentUser.id}`);
      const friends = await res.json();

      if (friends.length === 0) {
        listEl.innerHTML = `<div style="padding: 15px; color: var(--text-secondary); font-size: 14px;">Henüz arkadaşınız yok. "Arkadaşlar" sekmesinden eklenebilir.</div>`;
        return;
      }

      listEl.innerHTML = friends.map(f => {
        const isActive = activeChatTarget?.type === 'direct' && activeChatTarget.friend.id === f.id;
        return `
          <div class="chat-item-row ${isActive ? 'active' : ''}" onclick="selectDirectChat('${f.id}', '${escapeHtml(f.displayName)}', '${f.avatar}')">
            <div style="display: flex; align-items: center; gap: 10px;">
              <img class="avatar" src="${f.avatar}" style="width: 38px; height: 38px;" alt="Avatar">
              <div>
                <div style="font-weight: 700; font-size: 14px;">${escapeHtml(f.displayName)}</div>
                <div style="color: var(--text-secondary); font-size: 12px;">@${escapeHtml(f.username)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  } else if (chatSidebarTab === 'groups') {
    try {
      const res = await fetch(`${SERVER_URL}/api/groups/user/${currentUser.id}`);
      const groups = await res.json();

      let html = `
        <div style="padding: 12px; border-bottom: 1px solid var(--border-color);">
          <button style="width: 100%; font-size: 13px;" onclick="openCreateGroupModal()">➕ Yeni Grup Oluştur</button>
        </div>
      `;

      if (groups.length === 0) {
        html += `<div style="padding: 15px; color: var(--text-secondary); font-size: 14px;">Henüz bir gruba üye değilsiniz.</div>`;
      } else {
        html += groups.map(g => {
          const isActive = activeChatTarget?.type === 'group' && activeChatTarget.group.id === g.id;
          return `
            <div class="chat-item-row ${isActive ? 'active' : ''}" onclick="selectGroupChat('${g.id}', '${escapeHtml(g.name)}', '${g.avatar}')">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img class="avatar" src="${g.avatar}" style="width: 38px; height: 38px; border-radius: 10px;" alt="Group Avatar">
                <div>
                  <div style="font-weight: 700; font-size: 14px;">👥 ${escapeHtml(g.name)}</div>
                  <div style="color: var(--text-secondary); font-size: 12px;">${g.members.length} Üye</div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      listEl.innerHTML = html;
    } catch (err) {
      console.error(err);
    }
  }
}

// Select Direct Chat
function selectDirectChat(friendId, friendName, friendAvatar) {
  activeChatTarget = { type: 'direct', friend: { id: friendId, name: friendName, avatar: friendAvatar } };
  selectedChatImageBase64 = null;
  renderActiveChatWindow();
}

// Select Group Chat
function selectGroupChat(groupId, groupName, groupAvatar) {
  activeChatTarget = { type: 'group', group: { id: groupId, name: groupName, avatar: groupAvatar } };
  selectedChatImageBase64 = null;
  renderActiveChatWindow();
}

function renderActiveChatWindow() {
  if (!activeChatTarget) return;

  const mainArea = document.getElementById('chat-main-area');
  if (!mainArea) return;

  const isGroup = activeChatTarget.type === 'group';
  const name = isGroup ? activeChatTarget.group.name : activeChatTarget.friend.name;
  const avatar = isGroup ? activeChatTarget.group.avatar : activeChatTarget.friend.avatar;

  mainArea.innerHTML = `
    <div style="padding: 15px 20px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 12px; background: var(--bg-secondary);">
      <img class="avatar" src="${avatar}" style="width: 40px; height: 40px; ${isGroup ? 'border-radius: 10px;' : ''}" alt="Avatar">
      <div>
        <div style="font-weight: 700; font-size: 16px;">${isGroup ? '👥 ' : ''}${name}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${isGroup ? 'Grup Sohbeti' : 'Direkt Mesaj'}</div>
      </div>
    </div>

    <div class="chat-messages" id="chat-messages-box">
      <div style="text-align: center; color: var(--text-secondary);">Mesajlar yükleniyor...</div>
    </div>

    <div id="chat-image-preview" class="hidden image-preview-container" style="padding: 10px 20px 0 20px; background: var(--bg-secondary);">
      <img id="chat-image-preview-img" src="" style="max-height: 120px; border-radius: 10px;" alt="Chat image preview">
      <button class="remove-img-btn" onclick="removeChatImage()">✕</button>
    </div>

    <div class="chat-input-area">
      <input type="file" id="chat-image-file" accept="image/*" style="display: none;" onchange="handleChatImageSelect(event)">
      <button class="icon-btn" type="button" title="Resim ekle" onclick="document.getElementById('chat-image-file').click()">📷</button>
      <input type="text" id="chat-msg-input" placeholder="Bir mesaj yazın..." onkeydown="if(event.key==='Enter') sendChatMessage()">
      <button onclick="sendChatMessage()">Gönder</button>
    </div>
  `;

  if (isGroup) {
    fetchGroupMessages();
  } else {
    fetchDirectMessages();
  }
}

function handleChatImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    selectedChatImageBase64 = evt.target.result;
    const previewContainer = document.getElementById('chat-image-preview');
    const previewImg = document.getElementById('chat-image-preview-img');
    if (previewContainer && previewImg) {
      previewImg.src = selectedChatImageBase64;
      previewContainer.classList.remove('hidden');
    }
  };
  reader.readAsDataURL(file);
}

function removeChatImage() {
  selectedChatImageBase64 = null;
  const previewContainer = document.getElementById('chat-image-preview');
  if (previewContainer) previewContainer.classList.add('hidden');
  const fileInput = document.getElementById('chat-image-file');
  if (fileInput) fileInput.value = '';
}

// Fetch Direct Messages
async function fetchDirectMessages() {
  fetchDirectMessagesSilently();
}

async function fetchDirectMessagesSilently() {
  if (!activeChatTarget || activeChatTarget.type !== 'direct') return;

  try {
    const res = await fetch(`${SERVER_URL}/api/messages/${currentUser.id}/${activeChatTarget.friend.id}`);
    const messages = await res.json();
    const box = document.getElementById('chat-messages-box');
    if (!box) return;

    if (messages.length === 0) {
      box.innerHTML = `<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Henüz mesaj yok. İlk mesajı siz gönderin!</div>`;
      return;
    }

    const wasAtBottom = box.scrollHeight - box.clientHeight <= box.scrollTop + 50;

    box.innerHTML = messages.map(m => {
      const isSent = m.senderId === currentUser.id;
      return `
        <div class="message-bubble ${isSent ? 'sent' : 'received'}">
          ${m.text ? `<div>${escapeHtml(m.text)}</div>` : ''}
          ${m.image ? `<img class="msg-img-attached" src="${m.image}" alt="Message image">` : ''}
        </div>
      `;
    }).join('');

    if (wasAtBottom || box.children.length === messages.length) {
      box.scrollTop = box.scrollHeight;
    }
  } catch (err) {
    console.error(err);
  }
}

// Fetch Group Messages
async function fetchGroupMessages() {
  fetchGroupMessagesSilently();
}

async function fetchGroupMessagesSilently() {
  if (!activeChatTarget || activeChatTarget.type !== 'group') return;

  try {
    const res = await fetch(`${SERVER_URL}/api/groups/${activeChatTarget.group.id}/messages`);
    const messages = await res.json();
    const box = document.getElementById('chat-messages-box');
    if (!box) return;

    if (messages.length === 0) {
      box.innerHTML = `<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Gruba henüz mesaj atılmadı.</div>`;
      return;
    }

    const wasAtBottom = box.scrollHeight - box.clientHeight <= box.scrollTop + 50;

    box.innerHTML = messages.map(m => {
      const isSent = m.senderId === currentUser.id;
      const senderName = m.sender ? (m.sender.displayName || m.sender.username) : 'Bilinmeyen';

      return `
        <div class="message-bubble ${isSent ? 'sent' : 'received'}">
          ${!isSent ? `<div class="message-sender-name">${escapeHtml(senderName)}</div>` : ''}
          ${m.text ? `<div>${escapeHtml(m.text)}</div>` : ''}
          ${m.image ? `<img class="msg-img-attached" src="${m.image}" alt="Message image">` : ''}
        </div>
      `;
    }).join('');

    if (wasAtBottom || box.children.length === messages.length) {
      box.scrollTop = box.scrollHeight;
    }
  } catch (err) {
    console.error(err);
  }
}

// Send Chat Message (Direct or Group)
async function sendChatMessage() {
  const input = document.getElementById('chat-msg-input');
  const text = input ? input.value.trim() : '';

  if ((!text && !selectedChatImageBase64) || !activeChatTarget) return;

  if (activeChatTarget.type === 'direct') {
    try {
      await fetch(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: activeChatTarget.friend.id,
          text,
          image: selectedChatImageBase64
        })
      });
      input.value = '';
      removeChatImage();
      fetchDirectMessages();
    } catch (err) {
      alert('Mesaj gönderilemedi.');
    }
  } else if (activeChatTarget.type === 'group') {
    try {
      await fetch(`${SERVER_URL}/api/groups/${activeChatTarget.group.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          text,
          image: selectedChatImageBase64
        })
      });
      input.value = '';
      removeChatImage();
      fetchGroupMessages();
    } catch (err) {
      alert('Grup mesajı gönderilemedi.');
    }
  }
}

// Group Creation Modal
async function openCreateGroupModal() {
  const modal = document.getElementById('create-group-modal');
  const list = document.getElementById('group-friends-select-list');
  const nameInput = document.getElementById('group-name-input');
  
  if (nameInput) nameInput.value = '';
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`${SERVER_URL}/api/friends/${currentUser.id}`);
    const friends = await res.json();

    if (friends.length === 0) {
      list.innerHTML = `<div style="color: var(--text-secondary); font-size: 13px;">Gruba eklemek için arkadaşınız bulunmuyor.</div>`;
      return;
    }

    list.innerHTML = friends.map(f => `
      <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px; background: var(--bg-primary); border-radius: 8px;">
        <input type="checkbox" class="group-member-checkbox" value="${f.id}" style="width: auto;">
        <img class="avatar" src="${f.avatar}" style="width: 28px; height: 28px;" alt="Avatar">
        <span style="font-size: 14px; font-weight: bold;">${escapeHtml(f.displayName)}</span>
      </label>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

function closeCreateGroupModal() {
  document.getElementById('create-group-modal').classList.add('hidden');
}

async function submitCreateGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  if (!name) {
    alert('Lütfen bir grup adı girin.');
    return;
  }

  const checkboxes = document.querySelectorAll('.group-member-checkbox:checked');
  const members = Array.from(checkboxes).map(cb => cb.value);

  try {
    const res = await fetch(`${SERVER_URL}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        members,
        createdBy: currentUser.id
      })
    });
    if (!res.ok) throw new Error('Grup oluşturulamadı.');

    closeCreateGroupModal();
    chatSidebarTab = 'groups';
    loadChatSidebarContent();
  } catch (err) {
    alert(err.message);
  }
}

/* --- FRIENDS --- */
async function renderFriends(container) {
  container.innerHTML = `
    <div class="header-title">Arkadaşlar & İstekler</div>
    <div style="padding: 20px; display: flex; flex-direction: column; gap: 25px;">
      <div>
        <h3 style="margin-bottom: 12px; color: var(--accent-color); font-size: 16px;">Bekleyen Arkadaşlık İstekleri</h3>
        <div id="friend-requests-list">Yükleniyor...</div>
      </div>
      <div>
        <h3 style="margin-bottom: 12px; color: var(--accent-color); font-size: 16px;">Arkadaşlarım</h3>
        <div id="friends-list">Yükleniyor...</div>
      </div>
    </div>
  `;
  loadFriendRequests();
  loadFriendsList();
}

async function loadFriendRequests() {
  try {
    const res = await fetch(`${SERVER_URL}/api/friends/requests/${currentUser.id}`);
    const requests = await res.json();
    const list = document.getElementById('friend-requests-list');
    if (!list) return;

    if (requests.length === 0) {
      list.innerHTML = `<div style="color: var(--text-secondary); font-size: 14px;">Bekleyen istek yok.</div>`;
      return;
    }

    list.innerHTML = requests.map(req => `
      <div class="user-card" style="margin-bottom: 10px;">
        <div class="user-card-left">
          <img class="avatar" src="${req.sender.avatar}" alt="Avatar">
          <div>
            <div style="font-weight: 700;">${escapeHtml(req.sender.displayName)}</div>
            <div style="color: var(--text-secondary); font-size: 13px;">@${escapeHtml(req.sender.username)}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button onclick="respondRequest('${req.id}', 'accept')">Kabul Et</button>
          <button class="secondary" onclick="respondRequest('${req.id}', 'reject')">Reddet</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadFriendsList() {
  try {
    const res = await fetch(`${SERVER_URL}/api/friends/${currentUser.id}`);
    const friends = await res.json();
    const list = document.getElementById('friends-list');
    if (!list) return;

    if (friends.length === 0) {
      list.innerHTML = `<div style="color: var(--text-secondary); font-size: 14px;">Henüz arkadaşınız yok. Kullanıcı arayarak arkadaş ekleyebilirsiniz.</div>`;
      return;
    }

    list.innerHTML = friends.map(f => `
      <div class="user-card" style="margin-bottom: 10px;">
        <div class="user-card-left">
          <img class="avatar" src="${f.avatar}" alt="Avatar">
          <div>
            <div style="font-weight: 700;">${escapeHtml(f.displayName)}</div>
            <div style="color: var(--text-secondary); font-size: 13px;">@${escapeHtml(f.username)}</div>
          </div>
        </div>
        <button onclick="openDirectChatFromFriend('${f.id}', '${escapeHtml(f.displayName)}', '${f.avatar}')">Mesaj Gönder</button>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function openDirectChatFromFriend(friendId, friendName, friendAvatar) {
  switchTab('messages');
  chatSidebarTab = 'direct';
  selectDirectChat(friendId, friendName, friendAvatar);
}

async function respondRequest(requestId, action) {
  try {
    await fetch(`${SERVER_URL}/api/friends/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action })
    });
    renderFriends(document.getElementById('main-content-area'));
  } catch (err) {
    alert('İşlem başarısız.');
  }
}

async function searchUsers(query) {
  const resultsBox = document.getElementById('search-results');
  if (!query.trim()) {
    resultsBox.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/users?q=${encodeURIComponent(query)}&currentUserId=${currentUser.id}`);
    const users = await res.json();

    if (users.length === 0) {
      resultsBox.innerHTML = `<div style="color: var(--text-secondary); font-size: 13px; padding: 5px;">Kullanıcı bulunamadı.</div>`;
      return;
    }

    resultsBox.innerHTML = users.map(u => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--bg-primary); border-radius: 10px; margin-bottom: 6px; border: 1px solid var(--border-color);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img class="avatar" src="${u.avatar}" style="width: 32px; height: 32px;" alt="Avatar">
          <div style="font-size: 13px;">
            <div style="font-weight: 700;">${escapeHtml(u.displayName)}</div>
            <div style="color: var(--text-secondary); font-size: 11px;">@${escapeHtml(u.username)}</div>
          </div>
        </div>
        <button style="padding: 4px 10px; font-size: 12px;" onclick="sendFriendRequest('${u.id}')">Ekle</button>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function sendFriendRequest(receiverId) {
  try {
    const res = await fetch(`${SERVER_URL}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: currentUser.id, receiverId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert('Arkadaşlık isteği gönderildi!');
  } catch (err) {
    alert(err.message);
  }
}

/* --- PROFILE --- */
async function renderProfile(container) {
  container.innerHTML = `
    <div class="header-title">Profil</div>
    <div style="padding: 24px; display: flex; flex-direction: column; gap: 20px;">
      <div style="display: flex; align-items: center; gap: 20px; background: var(--bg-secondary); padding: 24px; border-radius: 20px; border: 1px solid var(--border-color);">
        <img class="avatar" src="${currentUser.avatar}" style="width: 84px; height: 84px;" alt="Avatar">
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="font-size: 22px; font-weight: 800;">${escapeHtml(currentUser.displayName)}</h2>
              <div style="color: var(--accent-color); font-size: 15px; margin-bottom: 8px;">@${escapeHtml(currentUser.username)}</div>
            </div>
            <button class="secondary" onclick="openEditProfileModal()">⚙️ Profil Düzenle</button>
          </div>
          <div style="color: var(--text-primary); font-size: 14px; line-height: 1.5; background: var(--bg-primary); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color);">
            ${escapeHtml(currentUser.bio || 'Henüz biyografi eklenmedi.')}
          </div>
        </div>
      </div>

      <button class="secondary" onclick="logout()" style="align-self: flex-start; color: #ff6b6b; border-color: #ff6b6b;">Çıkış Yap</button>
    </div>
  `;
}

// Edit Profile Modal
function openEditProfileModal() {
  selectedAvatarBase64 = null;
  const modal = document.getElementById('edit-profile-modal');
  document.getElementById('edit-display-name').value = currentUser.displayName || '';
  document.getElementById('edit-bio').value = currentUser.bio || '';
  document.getElementById('edit-avatar-url').value = currentUser.avatar || '';

  const previewImg = document.getElementById('edit-avatar-img-preview');
  previewImg.src = currentUser.avatar;
  previewImg.style.display = 'inline-block';

  modal.classList.remove('hidden');
}

function closeEditProfileModal() {
  document.getElementById('edit-profile-modal').classList.add('hidden');
}

function handleAvatarFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    selectedAvatarBase64 = evt.target.result;
    document.getElementById('edit-avatar-url').value = '';
    const previewImg = document.getElementById('edit-avatar-img-preview');
    previewImg.src = selectedAvatarBase64;
    previewImg.style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
}

async function saveProfileChanges() {
  const displayName = document.getElementById('edit-display-name').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const avatarUrlInput = document.getElementById('edit-avatar-url').value.trim();

  const finalAvatar = selectedAvatarBase64 || avatarUrlInput || currentUser.avatar;

  try {
    const res = await fetch(`${SERVER_URL}/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        bio,
        avatar: finalAvatar
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Güncelleme başarısız.');

    currentUser = data.user;
    localStorage.setItem('tweetier_current_user', JSON.stringify(currentUser));

    updateSidebarUser();
    closeEditProfileModal();
    if (currentTab === 'profile') renderProfile(document.getElementById('main-content-area'));
  } catch (err) {
    alert(err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
