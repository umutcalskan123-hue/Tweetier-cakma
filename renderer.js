let SERVER_URL = localStorage.getItem('tweetier_server_url') || 'https://ses-servera.onrender.com';
let currentUser = JSON.parse(localStorage.getItem('tweetier_current_user') || 'null');
let currentTab = 'home';
let activeChatFriend = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('server-url-input').value = SERVER_URL;
  checkAuthState();
});

function updateServerUrl() {
  const urlInput = document.getElementById('server-url-input').value.trim();
  if (urlInput) {
    SERVER_URL = urlInput.endsWith('/') ? urlInput.slice(0, -1) : urlInput;
    localStorage.setItem('tweetier_server_url', SERVER_URL);
    alert('Sunucu adresi güncellendi: ' + SERVER_URL);
    loadCurrentTabContent();
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
    alert('Hata: ' + err.message + '\nSunucu bağlantısını kontrol edin.');
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
  container.innerHTML = `
    <div class="header-title">Ana Sayfa</div>
    <div class="tweet-box">
      <img class="avatar" src="${currentUser.avatar}" alt="Avatar">
      <div style="flex: 1;">
        <textarea id="tweet-input" placeholder="Neler oluyor?" rows="3"></textarea>
        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
          <button onclick="postTweet()">Tweetle</button>
        </div>
      </div>
    </div>
    <div id="timeline-feed">
      <div style="padding: 20px; text-align: center; color: #8899a6;">Yükleniyor...</div>
    </div>
  `;
  fetchTimeline();
}

async function fetchTimeline() {
  try {
    const res = await fetch(`${SERVER_URL}/api/posts?userId=${currentUser.id}`);
    const posts = await res.json();
    const feed = document.getElementById('timeline-feed');
    if (!feed) return;

    if (posts.length === 0) {
      feed.innerHTML = `<div style="padding: 30px; text-align: center; color: #8899a6;">Henüz hiç tweet yok. İlk tweeti sen at!</div>`;
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
              <span class="tweet-name">${post.author.displayName}</span>
              <span class="tweet-handle">@${post.author.username}</span>
              <span class="tweet-time">· ${timeStr}</span>
            </div>
            <div class="tweet-text">${escapeHtml(post.content)}</div>
            <div class="tweet-actions">
              <div class="action-btn" onclick="likePost('${post.id}')">
                ❤️ ${post.likes.length}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    const feed = document.getElementById('timeline-feed');
    if (feed) feed.innerHTML = `<div style="padding: 20px; text-align: center; color: #ff6b6b;">Sunucuya bağlanılamadı. Lütfen sunucu adresini kontrol edin.</div>`;
  }
}

async function postTweet() {
  const content = document.getElementById('tweet-input').value.trim();
  if (!content) return;

  try {
    const res = await fetch(`${SERVER_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, content })
    });
    if (!res.ok) throw new Error('Tweet atılamadı.');
    document.getElementById('tweet-input').value = '';
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

/* --- MESSAGES --- */
async function renderMessages(container) {
  container.innerHTML = `
    <div class="header-title">Mesajlar</div>
    <div class="chat-container">
      <div class="chat-sidebar" id="chat-friends-list">
        <div style="padding: 15px; color: #8899a6;">Arkadaşlar yükleniyor...</div>
      </div>
      <div class="chat-main" id="chat-main-area">
        <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #8899a6;">
          Sohbet etmek için soldan bir arkadaş seçin.
        </div>
      </div>
    </div>
  `;
  loadChatFriends();
}

async function loadChatFriends() {
  try {
    const res = await fetch(`${SERVER_URL}/api/friends/${currentUser.id}`);
    const friends = await res.json();
    const listEl = document.getElementById('chat-friends-list');
    if (!listEl) return;

    if (friends.length === 0) {
      listEl.innerHTML = `<div style="padding: 15px; color: #8899a6; font-size: 14px;">Henüz arkadaşınız yok. "Arkadaşlar" sekmesinden arkadaş ekleyin.</div>`;
      return;
    }

    listEl.innerHTML = friends.map(f => `
      <div class="user-card" style="cursor:pointer;" onclick="selectChatFriend('${f.id}', '${f.displayName}', '${f.avatar}')">
        <div class="user-card-left">
          <img class="avatar" src="${f.avatar}" style="width: 36px; height: 36px;" alt="Avatar">
          <div>
            <div style="font-weight: bold; font-size: 14px;">${f.displayName}</div>
            <div style="color: #8899a6; font-size: 12px;">@${f.username}</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function selectChatFriend(friendId, friendName, friendAvatar) {
  activeChatFriend = { id: friendId, name: friendName, avatar: friendAvatar };
  const mainArea = document.getElementById('chat-main-area');
  mainArea.innerHTML = `
    <div style="padding: 15px; border-bottom: 1px solid #38444d; display: flex; align-items: center; gap: 10px; background: #192734;">
      <img class="avatar" src="${friendAvatar}" style="width: 36px; height: 36px;" alt="Avatar">
      <span style="font-weight: bold;">${friendName}</span>
    </div>
    <div class="chat-messages" id="chat-messages-box">
      <div style="text-align: center; color: #8899a6;">Mesajlar yükleniyor...</div>
    </div>
    <div class="chat-input-area">
      <input type="text" id="chat-msg-input" placeholder="Bir mesaj yazın..." onkeydown="if(event.key==='Enter') sendMessage()">
      <button onclick="sendMessage()">Gönder</button>
    </div>
  `;
  fetchMessages();
}

async function fetchMessages() {
  if (!activeChatFriend) return;
  try {
    const res = await fetch(`${SERVER_URL}/api/messages/${currentUser.id}/${activeChatFriend.id}`);
    const messages = await res.json();
    const box = document.getElementById('chat-messages-box');
    if (!box) return;

    if (messages.length === 0) {
      box.innerHTML = `<div style="text-align: center; color: #8899a6;">Henüz mesaj yok. İlk mesajı siz gönderin!</div>`;
      return;
    }

    box.innerHTML = messages.map(m => {
      const isSent = m.senderId === currentUser.id;
      return `<div class="message-bubble ${isSent ? 'sent' : 'received'}">${escapeHtml(m.text)}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    console.error(err);
  }
}

async function sendMessage() {
  const input = document.getElementById('chat-msg-input');
  const text = input ? input.value.trim() : '';
  if (!text || !activeChatFriend) return;

  try {
    await fetch(`${SERVER_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: currentUser.id, receiverId: activeChatFriend.id, text })
    });
    input.value = '';
    fetchMessages();
  } catch (err) {
    alert('Mesaj gönderilemedi.');
  }
}

/* --- FRIENDS --- */
async function renderFriends(container) {
  container.innerHTML = `
    <div class="header-title">Arkadaşlar & İstekler</div>
    <div style="padding: 20px; display: flex; flex-direction: column; gap: 30px;">
      <div>
        <h3 style="margin-bottom: 15px; color: #1da1f2;">Bekleyen Arkadaşlık İstekleri</h3>
        <div id="friend-requests-list">Yükleniyor...</div>
      </div>
      <div>
        <h3 style="margin-bottom: 15px; color: #1da1f2;">Arkadaşlarım</h3>
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
      list.innerHTML = `<div style="color: #8899a6;">Bekleyen istek yok.</div>`;
      return;
    }

    list.innerHTML = requests.map(req => `
      <div class="user-card" style="background: #192734; border-radius: 12px; margin-bottom: 10px;">
        <div class="user-card-left">
          <img class="avatar" src="${req.sender.avatar}" alt="Avatar">
          <div>
            <div style="font-weight: bold;">${req.sender.displayName}</div>
            <div style="color: #8899a6; font-size: 14px;">@${req.sender.username}</div>
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
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
      list.innerHTML = `<div style="color: #8899a6;">Henüz arkadaşınız yok. Sağ panelden kullanıcı arayarak arkadaş ekleyebilirsiniz.</div>`;
      return;
    }

    list.innerHTML = friends.map(f => `
      <div class="user-card" style="background: #192734; border-radius: 12px; margin-bottom: 10px;">
        <div class="user-card-left">
          <img class="avatar" src="${f.avatar}" alt="Avatar">
          <div>
            <div style="font-weight: bold;">${f.displayName}</div>
            <div style="color: #8899a6; font-size: 14px;">@${f.username}</div>
          </div>
        </div>
        <button onclick="switchTab('messages')">Mesaj Gönder</button>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
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
      resultsBox.innerHTML = `<div style="color: #8899a6; font-size: 13px; padding: 5px;">Kullanıcı bulunamadı.</div>`;
      return;
    }

    resultsBox.innerHTML = users.map(u => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #22303c; border-radius: 8px; margin-bottom: 5px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img class="avatar" src="${u.avatar}" style="width: 30px; height: 30px;" alt="Avatar">
          <div style="font-size: 13px;">
            <div style="font-weight: bold;">${u.displayName}</div>
            <div style="color: #8899a6; font-size: 11px;">@${u.username}</div>
          </div>
        </div>
        <button style="padding: 5px 10px; font-size: 12px;" onclick="sendFriendRequest('${u.id}')">Ekle</button>
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
    <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px;">
      <div style="display: flex; align-items: center; gap: 20px; background: #192734; padding: 20px; border-radius: 16px;">
        <img class="avatar" src="${currentUser.avatar}" style="width: 80px; height: 80px;" alt="Avatar">
        <div>
          <h2 style="font-size: 22px;">${currentUser.displayName}</h2>
          <div style="color: #1da1f2; font-size: 16px; margin-bottom: 5px;">@${currentUser.username}</div>
          <div style="color: #8899a6; font-size: 14px;">${currentUser.bio}</div>
        </div>
      </div>
      <button class="secondary" onclick="logout()" style="align-self: flex-start; color: #ff6b6b; border-color: #ff6b6b;">Çıkış Yap</button>
    </div>
  `;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/>/g, "&#039;");
}
