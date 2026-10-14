let API_URL = 'http://localhost:3000/api';

async function loadConfig() {
  try {
    const response = await fetch('../config.json');
    const config = await response.json();
    if (config.serverUrl) {
      API_URL = `${config.serverUrl}/api`;
    }
  } catch (e) {
    console.log("Config yüklenemedi, yerel adres kullanılıyor.");
  }
}

loadConfig();

let currentUser = null;
let currentTab = 'home';
let currentChatUser = null;
let homeSubTab = 'suggested';
let friendsSubTab = 'following'; // 'following' (Arkadaşlarım) veya 'explore' (Keşfet)
let currentLanguage = 'tr';
let lastNotificationCount = 0;

const translations = {
  tr: {
    home: "Ana Sayfa",
    messages: "Mesajlar",
    friends: "Arkadaşlar",
    bookmarks: "Kaydedilenler",
    settings: "Ayarlar",
    profile: "Profil",
    suggested: "Önerilenler",
    following: "Takip Edilenler",
    whatsHappening: "Bugün Ne Tweetliceksin?",
    tweetBtn: "Tweetle",
    themeTitle: "Görünüm (Tema)",
    langTitle: "Dil Seçeneği",
    darkTheme: "Koyu Tema",
    lightTheme: "Açık Tema",
    editProfile: "Profili Düzenle",
    save: "Kaydet",
    chats: "Sohbetler",
    typeMsg: "Mesaj yaz...",
    send: "Gönder"
  },
  en: {
    home: "Home",
    messages: "Messages",
    friends: "Friends",
    bookmarks: "Bookmarks",
    settings: "Settings",
    profile: "Profile",
    suggested: "Suggested",
    following: "Following",
    whatsHappening: "What are you tweeting today?",
    tweetBtn: "Tweet",
    themeTitle: "Appearance (Theme)",
    langTitle: "Language Option",
    darkTheme: "Dark Theme",
    lightTheme: "Light Theme",
    editProfile: "Edit Profile",
    save: "Save",
    chats: "Chats",
    typeMsg: "Type a message...",
    send: "Send"
  }
};

function t(key) {
  return translations[currentLanguage][key] || key;
}

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 587.33;
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    console.error("Audio error:", e);
  }
}

function handleImageUpload(event, callback) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(uploadEvent) {
    callback(uploadEvent.target.result);
  };
  reader.readAsDataURL(file);
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById('tab-login');
  const regTab = document.getElementById('tab-register');
  const regFields = document.getElementById('register-fields');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (tab === 'login') {
    loginTab.classList.add('active');
    regTab.classList.remove('active');
    regFields.classList.add('hidden');
    submitBtn.innerText = currentLanguage === 'tr' ? 'Giriş Yap' : 'Login';
  } else {
    regTab.classList.add('active');
    loginTab.classList.remove('active');
    regFields.classList.remove('hidden');
    submitBtn.innerText = currentLanguage === 'tr' ? 'Kayıt Ol' : 'Register';
  }
}

async function handleAuth(event) {
  event.preventDefault();
  const username = document.getElementById('auth-username').value;
  const password = document.getElementById('auth-password').value;
  const isRegister = document.getElementById('tab-register').classList.contains('active');
  const displayName = document.getElementById('reg-display-name').value;

  const endpoint = isRegister ? `${API_URL}/register` : `${API_URL}/login`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser = data;
    document.getElementById('auth-modal').style.display = 'none';
    updateSidebarUser();
    switchTab('home');
    loadNotifications();
  } catch (err) {
    alert(err.message);
  }
}

function updateSidebarUser() {
  if (!currentUser) return;
  const nameEl = document.getElementById('sidebar-name');
  const handleEl = document.getElementById('sidebar-handle');
  const avatarEl = document.getElementById('sidebar-avatar');

  if (nameEl) nameEl.innerText = currentUser.displayName || currentUser.username || 'Kullanıcı';
  if (handleEl) handleEl.innerText = '@' + (currentUser.username || 'kullanici');
  if (avatarEl) avatarEl.src = currentUser.avatar || 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=150&q=80';
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNavItem = document.getElementById(`nav-${tab}`);
  if (activeNavItem) activeNavItem.classList.add('active');

  renderMainContent();
}

function renderMainContent() {
  const mainArea = document.getElementById('main-content-area');
  mainArea.innerHTML = '';

  const userAvatar = (currentUser && currentUser.avatar) ? currentUser.avatar : 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=150&q=80';

  if (currentTab === 'home') {
    mainArea.innerHTML = `
      <div class="header-title">${t('home')}</div>
      <div style="display: flex; border-bottom: 1px solid var(--border-color);">
        <div style="flex:1; text-align:center; padding:12px; cursor:pointer; font-weight:bold; border-bottom: 2px solid ${homeSubTab==='suggested'?'var(--accent-color)':'transparent'}" onclick="setHomeSubTab('suggested')">${t('suggested')}</div>
        <div style="flex:1; text-align:center; padding:12px; cursor:pointer; font-weight:bold; border-bottom: 2px solid ${homeSubTab==='following'?'var(--accent-color)':'transparent'}" onclick="setHomeSubTab('following')">${t('following')}</div>
      </div>
      <div class="tweet-box">
        <img src="${userAvatar}" class="avatar">
        <div style="flex:1;">
          <textarea id="tweet-input" placeholder="${t('whatsHappening')}" rows="3"></textarea>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
            <label style="background:var(--bg-card); border:1px solid var(--border-color); padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
              📁 Görsel Seç
              <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(event, (b64) => window.tempTweetImage = b64)">
            </label>
            <button onclick="postTweet()">${t('tweetBtn')}</button>
          </div>
        </div>
      </div>
      <div id="tweets-feed"></div>
    `;
    loadTweets();
  } else if (currentTab === 'messages') {
    renderMessagesUI(mainArea);
  } else if (currentTab === 'friends') {
    renderFriendsUI(mainArea);
  } else if (currentTab === 'bookmarks') {
    renderBookmarksUI(mainArea);
  } else if (currentTab === 'settings') {
    renderSettingsUI(mainArea);
  } else if (currentTab === 'profile') {
    renderProfileUI(mainArea);
  }
}

function setHomeSubTab(sub) {
  homeSubTab = sub;
  renderMainContent();
}

async function loadTweets() {
  const feed = document.getElementById('tweets-feed');
  if (!feed) return;
  try {
    const res = await fetch(`${API_URL}/tweets`);
    const tweets = await res.json();
    
    const blockRes = await fetch(`${API_URL}/blocks/${currentUser.id}`);
    const blockedUsers = await blockRes.json();

    let filtered = tweets.filter(t => !blockedUsers.includes(t.userId));
    if (homeSubTab === 'following') {
      const followingList = currentUser.following || [];
      filtered = filtered.filter(t => followingList.includes(t.userId) || t.userId === currentUser.id);
    }

    feed.innerHTML = '';
    if (filtered.length === 0) {
      feed.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">Henüz gönderi yok.</div>`;
      return;
    }

    filtered.forEach(tweet => {
      const isMyTweet = tweet.userId === currentUser.id;
      const commentsHtml = (tweet.comments || []).map(c => `
        <div style="display:flex; gap:8px; margin-top:8px; font-size:13px; background:var(--bg-card); padding:8px; border-radius:8px;">
          <img src="${c.authorAvatar}" style="width:24px; height:24px; border-radius:50%;">
          <div><b>${c.authorName}</b>: ${c.content}</div>
        </div>
      `).join('');

      const card = document.createElement('div');
      card.className = 'tweet-card';
      card.innerHTML = `
        <img src="${tweet.authorAvatar}" class="avatar">
        <div class="tweet-content">
          <div class="tweet-header">
            <span class="tweet-name">${tweet.authorName}</span>
            <span class="tweet-handle">@${tweet.authorUsername}</span>
            <span class="tweet-time">• ${new Date(tweet.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            ${isMyTweet ? `<button onclick="deleteTweet('${tweet.id}')" style="margin-left:auto; background:transparent; color:#ff5f56; border:none; cursor:pointer; font-size:12px;">Sil</button>` : ''}
          </div>
          <div class="tweet-text">${tweet.content}</div>
          ${tweet.image ? `<img src="${tweet.image}" class="tweet-image-attached">` : ''}
          <div class="tweet-actions">
            <span class="action-btn" onclick="toggleLike('${tweet.id}')">❤️ ${tweet.likes.length}</span>
            <span class="action-btn" onclick="toggleBookmark('${tweet.id}')">🔖 Kaydet</span>
          </div>
          <div style="margin-top:10px;">
            <input type="text" placeholder="Yorum yaz..." id="comment-input-${tweet.id}" onkeypress="if(event.key==='Enter') addComment('${tweet.id}')" style="font-size:13px; padding:6px 10px;">
            <div id="comments-list-${tweet.id}">${commentsHtml}</div>
          </div>
        </div>
      `;
      feed.appendChild(card);
    });
  } catch (e) {
    console.error(e);
  }
}

async function postTweet() {
  const content = document.getElementById('tweet-input').value;
  const image = window.tempTweetImage || null;
  if (!content.trim() && !image) return;

  await fetch(`${API_URL}/tweets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, content, image })
  });
  window.tempTweetImage = null;
  loadTweets();
}

async function deleteTweet(id) {
  await fetch(`${API_URL}/tweets/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id })
  });
  loadTweets();
}

async function toggleLike(id) {
  await fetch(`${API_URL}/tweets/${id}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id })
  });
  loadTweets();
}

async function toggleBookmark(id) {
  await fetch(`${API_URL}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, tweetId: id })
  });
  alert('Kaydedilenler güncellendi!');
}

async function addComment(tweetId) {
  const input = document.getElementById(`comment-input-${tweetId}`);
  const content = input.value;
  if (!content.trim()) return;

  await fetch(`${API_URL}/tweets/${tweetId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, content })
  });
  loadTweets();
}

async function renderBookmarksUI(mainArea) {
  mainArea.innerHTML = `<div class="header-title">${t('bookmarks')}</div><div id="bookmarks-feed"></div>`;
  const feed = document.getElementById('bookmarks-feed');
  const res = await fetch(`${API_URL}/bookmarks/${currentUser.id}`);
  const tweets = await res.json();

  if (tweets.length === 0) {
    feed.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">Henüz kaydedilmiş gönderi yok.</div>`;
    return;
  }
  tweets.forEach(tweet => {
    const card = document.createElement('div');
    card.className = 'tweet-card';
    card.innerHTML = `
      <img src="${tweet.authorAvatar}" class="avatar">
      <div class="tweet-content">
        <div class="tweet-header">
          <span class="tweet-name">${tweet.authorName}</span>
          <span class="tweet-handle">@${tweet.authorUsername}</span>
        </div>
        <div class="tweet-text">${tweet.content}</div>
      </div>
    `;
    feed.appendChild(card);
  });
}

function renderSettingsUI(mainArea) {
  mainArea.innerHTML = `
    <div class="header-title">${t('settings')}</div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:20px;">
      <div>
        <h3>${t('themeTitle')}</h3>
        <select id="theme-select" onchange="changeTheme(this.value)" style="margin-top:8px;">
          <option value="dark" ${document.body.classList.contains('dark-theme')?'selected':''}>${t('darkTheme')}</option>
          <option value="light" ${document.body.classList.contains('light-theme')?'selected':''}>${t('lightTheme')}</option>
        </select>
      </div>
      <div>
        <h3>${t('langTitle')}</h3>
        <select id="lang-select" onchange="changeLanguage(this.value)" style="margin-top:8px;">
          <option value="tr" ${currentLanguage==='tr'?'selected':''}>Türkçe</option>
          <option value="en" ${currentLanguage==='en'?'selected':''}>English</option>
        </select>
      </div>
    </div>
  `;
}

function changeTheme(theme) {
  if (theme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }
}

function changeLanguage(lang) {
  currentLanguage = lang;
  document.getElementById('nav-home').innerText = `🏠 ${t('home')}`;
  document.getElementById('nav-messages').innerText = `💬 ${t('messages')}`;
  document.getElementById('nav-friends').innerText = `👥 ${t('friends')}`;
  document.getElementById('nav-bookmarks').innerText = `🔖 ${t('bookmarks')}`;
  document.getElementById('nav-settings').innerText = `⚙️ ${t('settings')}`;
  document.getElementById('nav-profile').innerText = `👤 ${t('profile')}`;
  renderMainContent();
}

async function searchUsers(query) {
  const resultsDiv = document.getElementById('search-results');
  if (!query.trim()) { resultsDiv.innerHTML = ''; return; }
  
  const res = await fetch(`${API_URL}/users`);
  const users = await res.json();
  const filtered = users.filter(u => u.username.toLowerCase().includes(query.toLowerCase()) && u.id !== currentUser.id);

  resultsDiv.innerHTML = filtered.map(u => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; background:var(--bg-card); border-radius:8px; margin-top:5px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <img src="${u.avatar}" style="width:30px;height:30px;border-radius:50%;">
        <span>${u.displayName}</span>
      </div>
      <button onclick="followUser('${u.id}')" style="padding:4px 10px; font-size:12px;">Ekle</button>
    </div>
  `).join('');
}

async function followUser(id) {
  const res = await fetch(`${API_URL}/users/${id}/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentUserId: currentUser.id })
  });
  currentUser = await res.json();
  updateSidebarUser();
  if (currentTab === 'friends') renderFriendsUI(document.getElementById('main-content-area'));
}

async function blockUser(id) {
  await fetch(`${API_URL}/users/${id}/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentUserId: currentUser.id })
  });
  alert('Kullanıcı engellendi / engel kaldırıldı.');
  if (currentTab === 'friends') renderFriendsUI(document.getElementById('main-content-area'));
}

// Arkadaşlar Sekmesi (Solda "Arkadaşlarım", Sağda "Keşfet")
function renderFriendsUI(mainArea) {
  mainArea.innerHTML = `
    <div class="header-title">${t('friends')}</div>
    <div style="display: flex; border-bottom: 1px solid var(--border-color);">
      <div style="flex:1; text-align:center; padding:12px; cursor:pointer; font-weight:bold; border-bottom: 2px solid ${friendsSubTab==='following'?'var(--accent-color)':'transparent'}" onclick="setFriendsSubTab('following')">Arkadaşlarım</div>
      <div style="flex:1; text-align:center; padding:12px; cursor:pointer; font-weight:bold; border-bottom: 2px solid ${friendsSubTab==='explore'?'var(--accent-color)':'transparent'}" onclick="setFriendsSubTab('explore')">Keşfet</div>
    </div>
    ${friendsSubTab === 'explore' ? `
      <div style="padding: 16px 24px 0 24px;">
        <input type="text" id="friends-search-input" placeholder="Keşfet: Kullanıcı ara..." oninput="filterFriendsExplore(this.value)">
      </div>
    ` : ''}
    <div id="friends-list" style="padding:24px;"></div>
  `;
  loadFriendsContent("");
}

function setFriendsSubTab(sub) {
  friendsSubTab = sub;
  renderFriendsUI(document.getElementById('main-content-area'));
}

function filterFriendsExplore(query) {
  loadFriendsContent(query);
}

async function loadFriendsContent(query) {
  const list = document.getElementById('friends-list');
  if (!list) return;

  const res = await fetch(`${API_URL}/users`);
  const users = await res.json();

  const followingList = currentUser.following || [];

  let filtered = users.filter(u => u.id !== currentUser.id);

  if (friendsSubTab === 'following') {
    filtered = filtered.filter(u => followingList.includes(u.id));
  } else if (friendsSubTab === 'explore' && query.trim()) {
    filtered = filtered.filter(u => 
      u.username.toLowerCase().includes(query.toLowerCase()) || 
      (u.displayName && u.displayName.toLowerCase().includes(query.toLowerCase()))
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:20px;">
      ${friendsSubTab === 'following' ? 'Henüz eklediğin bir arkadaşın yok. Keşfet sekmesinden yeni kişiler ekleyebilirsin!' : 'Kullanıcı bulunamadı.'}
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(u => {
    const isFollowing = followingList.includes(u.id);
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--bg-secondary); border-radius:12px; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${u.avatar || 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=150&q=80'}" style="width:40px;height:40px;border-radius:50%; object-fit:cover;">
          <div>
            <div style="font-weight:bold;">${u.displayName || u.username}</div>
            <div style="font-size:12px; color:var(--text-secondary);">@${u.username}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button onclick="followUser('${u.id}')" class="${isFollowing ? 'secondary' : ''}">
            ${isFollowing ? 'Arkadaşsın' : 'Arkadaş Ekle'}
          </button>
          <button onclick="blockUser('${u.id}')" style="background:#ff5f56; padding:6px 12px; font-size:12px;">Engelle</button>
        </div>
      </div>
    `;
  }).join('');
}

// Profil Ekranı (Kesin Düzeltildi)
function renderProfileUI(mainArea) {
  if (!currentUser) return;

  const name = currentUser.displayName || currentUser.username || 'Kullanıcı';
  const handle = currentUser.username || 'kullanici';
  const bio = currentUser.bio || 'Tweetier kullanıcısı 🐦';
  const avatar = currentUser.avatar || 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=150&q=80';

  mainArea.innerHTML = `
    <div class="header-title">${t('profile')}</div>
    <div style="padding:30px; display:flex; flex-direction:column; gap:16px; align-items:center;">
      <img src="${avatar}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:3px solid var(--accent-color);">
      <h2>${name}</h2>
      <p style="color:var(--text-secondary);">@${handle}</p>
      <p style="text-align:center; max-width:400px;">${bio}</p>
      <button onclick="openEditProfileModal()">${t('editProfile')}</button>
    </div>
  `;
}

function openEditProfileModal() {
  let modal = document.getElementById('edit-profile-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-profile-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <span style="font-weight:bold; font-size:16px;">${t('editProfile')}</span>
        <button type="button" class="secondary" onclick="closeEditProfileModal()" style="padding:4px 10px;">✕</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <label style="font-size: 13px; font-weight: bold; color: var(--text-secondary);">Görünen İsim</label>
        <input type="text" id="edit-display-name" value="${currentUser.displayName || currentUser.username || ''}">
        
        <label style="font-size: 13px; font-weight: bold; color: var(--text-secondary);">Biyografi</label>
        <textarea id="edit-bio" rows="3">${currentUser.bio || ''}</textarea>

        <label style="font-size: 13px; font-weight: bold; color: var(--text-secondary);">Profil Fotoğrafı (Bilgisayardan Seç)</label>
        <input type="file" accept="image/*" onchange="handleImageUpload(event, (base64) => { document.getElementById('preview-avatar').src = base64; window.tempAvatar = base64; })">
        <div style="text-align:center; margin-top:5px;">
          <img id="preview-avatar" src="${currentUser.avatar || ''}" style="width:60px; height:60px; border-radius:50%; object-fit:cover;">
        </div>

        <button type="button" onclick="saveProfileChanges()" style="margin-top: 10px; width: 100%;">${t('save')}</button>
      </div>
    </div>
  `;
  window.tempAvatar = currentUser.avatar;
  modal.classList.remove('hidden');
}

function closeEditProfileModal() {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveProfileChanges() {
  const displayName = document.getElementById('edit-display-name').value;
  const bio = document.getElementById('edit-bio').value;
  const avatar = window.tempAvatar || currentUser.avatar;

  const res = await fetch(`${API_URL}/users/${currentUser.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, bio, avatar })
  });
  currentUser = await res.json();
  closeEditProfileModal();
  updateSidebarUser();
  renderMainContent();
}

// Mesajlar (Sadece Arkadaşlar Listesi)
function renderMessagesUI(mainArea) {
  mainArea.innerHTML = `
    <div class="chat-container">
      <div class="chat-sidebar">
        <div style="padding:16px; font-weight:bold; border-bottom:1px solid var(--border-color);">${t('chats')}</div>
        <div id="chat-users-list" style="overflow-y:auto; flex:1;"></div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column;">
        <div id="chat-header" style="padding:16px; border-bottom:1px solid var(--border-color); font-weight:bold;">Bir arkadaş seçin</div>
        <div id="chat-messages" class="chat-messages"></div>
        <div class="chat-input-area" id="chat-input-box" style="display:none; gap:8px; align-items:center;">
          <input type="file" accept="image/*" style="width:75px; font-size:10px;" onchange="handleImageUpload(event, (b64) => window.tempMsgImage = b64)" title="Resim Ekle">
          <input type="text" id="msg-input" placeholder="${t('typeMsg')}" onkeypress="if(event.key==='Enter') sendMessage()" style="flex:1;">
          <button onclick="sendMessage()">${t('send')}</button>
        </div>
      </div>
    </div>
  `;
  loadChatUsers();
}

async function loadChatUsers() {
  const res = await fetch(`${API_URL}/users`);
  const users = await res.json();
  const list = document.getElementById('chat-users-list');

  const followingList = currentUser.following || [];
  const friendUsers = users.filter(u => followingList.includes(u.id));

  if (friendUsers.length === 0) {
    list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:13px;">Mesajlaşmak için önce Arkadaşlar sekmesinden birini eklemelisin!</div>`;
    return;
  }

  list.innerHTML = friendUsers.map(u => `
    <div onclick="selectChatUser('${u.id}', '${u.displayName || u.username}', '${u.avatar}')" style="display:flex; align-items:center; gap:10px; padding:12px; cursor:pointer; border-bottom:1px solid var(--border-color);">
      <img src="${u.avatar || ''}" style="width:36px;height:36px;border-radius:50%; object-fit:cover;">
      <div><b>${u.displayName || u.username}</b></div>
    </div>
  `).join('');
}

async function selectChatUser(id, name, avatar) {
  currentChatUser = { id, name, avatar };
  document.getElementById('chat-header').innerText = `${name} ile Sohbet`;
  document.getElementById('chat-input-box').style.display = 'flex';

  await fetch(`${API_URL}/messages/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, partnerId: id })
  });

  loadMessages();
}

async function loadMessages() {
  if (!currentChatUser) return;
  const res = await fetch(`${API_URL}/messages`);
  const messages = await res.json();
  const container = document.getElementById('chat-messages');

  const filtered = messages.filter(m => 
    (m.senderId === currentUser.id && m.receiverId === currentChatUser.id) ||
    (m.senderId === currentChatUser.id && m.receiverId === currentUser.id)
  );

  container.innerHTML = filtered.map(m => {
    const isSent = m.senderId === currentUser.id;
    return `
      <div class="message-bubble ${isSent ? 'sent' : 'received'}" style="position:relative; padding-bottom:20px;">
        <div>${m.content}</div>
        <div style="font-size:10px; text-align:right; opacity:0.7; margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
          ${isSent ? `<button onclick="deleteMessage('${m.id}')" style="background:transparent; border:none; color:#ff5f56; font-size:10px; cursor:pointer;">Sil</button>` : '<span></span>'}
          <span>${isSent ? (m.seen ? 'Görüldü ✓✓' : 'İletildi ✓') : ''}</span>
        </div>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function deleteMessage(msgId) {
  await fetch(`${API_URL}/messages/${msgId}`, { method: 'DELETE' });
  loadMessages();
}

async function sendMessage() {
  const input = document.getElementById('msg-input');
  const content = input.value;
  const image = window.tempMsgImage || null;
  if ((!content.trim() && !image) || !currentChatUser) return;

  const finalContent = image ? `${content}<br><img src="${image}" style="max-width:200px; border-radius:8px; margin-top:5px;">` : content;

  await fetch(`${API_URL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId: currentUser.id, receiverId: currentChatUser.id, content: finalContent })
  });
  input.value = '';
  window.tempMsgImage = null;
  loadMessages();
}

// Canlı Bildirimler
async function loadNotifications() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_URL}/notifications/${currentUser.id}`);
    const notifs = await res.json();
    const list = document.getElementById('notifications-list');
    if (!list) return;

    if (notifs.length > lastNotificationCount) {
      playNotificationSound();
      lastNotificationCount = notifs.length;
    }

    if (notifs.length === 0) {
      list.innerHTML = `<div>Henüz bildirim yok.</div>`;
      return;
    }

    list.innerHTML = notifs.map(n => `<div style="padding:6px 0; border-bottom:1px solid var(--border-color);">${n.text}</div>`).join('');
  } catch (e) {
    console.error(e);
  }
}

setInterval(loadNotifications, 4000);