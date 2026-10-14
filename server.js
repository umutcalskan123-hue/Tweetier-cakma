const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

const usePostgres = !!process.env.DATABASE_URL;
const pool = usePostgres ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
const DATA_FILE = path.join(__dirname, 'database.json');

const pg = {
  async init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, displayName TEXT, bio TEXT, avatar TEXT, following TEXT DEFAULT '[]', socketId TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS tweets (id TEXT PRIMARY KEY, userId TEXT, authorName TEXT, authorUsername TEXT, authorAvatar TEXT, content TEXT, image TEXT, likes TEXT DEFAULT '[]', comments TEXT DEFAULT '[]', timestamp BIGINT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, senderId TEXT, receiverId TEXT, content TEXT, seen BOOLEAN DEFAULT FALSE, timestamp BIGINT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bookmarks (userId TEXT, tweetId TEXT, PRIMARY KEY (userId, tweetId))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS blocks (key TEXT PRIMARY KEY)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, userId TEXT, text TEXT, timestamp BIGINT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS friend_requests (id TEXT PRIMARY KEY, senderId TEXT, receiverId TEXT, status TEXT DEFAULT 'pending', timestamp BIGINT)`);
  },
  async query(text, params) { return pool.query(text, params); }
};

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = { users: [], tweets: [], messages: [], bookmarks: {}, blocks: [], notifications: {}, friendRequests: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return { users: [], tweets: [], messages: [], bookmarks: [], blocks: [], notifications: {}, friendRequests: [] }; }
}

function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

function addNotification(userId, text) {
  if (usePostgres) {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    pg.query('INSERT INTO notifications (id, userId, text, timestamp) VALUES ($1, $2, $3, $4)', [id, userId, text, Date.now()]);
  } else {
    const data = loadData();
    if (!data.notifications) data.notifications = {};
    if (!data.notifications[userId]) data.notifications[userId] = [];
    data.notifications[userId].unshift({ id: Date.now().toString(), text, timestamp: Date.now() });
    saveData(data);
  }
}

function emitToUser(userId, event, data) {
  if (usePostgres) {
    pg.query('SELECT socketId FROM users WHERE id = $1', [userId]).then(r => {
      if (r.rows[0] && r.rows[0].socketid) io.to(r.rows[0].socketid).emit(event, data);
    });
  } else {
    const data = loadData();
    const user = data.users.find(u => u.id === userId);
    const socketId = user ? user.socketId || null : null;
    if (socketId) io.to(socketId).emit(event, data);
  }
}

const birdAvatars = [
  "https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1522858547137-f1d65545800d?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=150&q=80"
];

// Auth
app.post('/api/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  if (usePostgres) {
    const existing = await pg.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    const randomAvatar = birdAvatars[Math.floor(Math.random() * birdAvatars.length)];
    const id = Date.now().toString();
    await pg.query('INSERT INTO users (id, username, password, displayName, bio, avatar, following) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, username, password, displayName || username, 'Tweetier kuşu 🐦', randomAvatar, '[]']);
    res.json({ id, username, displayName: displayName || username, bio: 'Tweetier kuşu 🐦', avatar: randomAvatar, following: [] });
  } else {
    const data = loadData();
    if (data.users.find(u => u.username === username)) return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    const randomAvatar = birdAvatars[Math.floor(Math.random() * birdAvatars.length)];
    const newUser = { id: Date.now().toString(), username, password, displayName: displayName || username, bio: 'Tweetier kuşu 🐦', avatar: randomAvatar, following: [], socketId: null };
    data.users.push(newUser);
    saveData(data);
    const { password: _, ...u } = newUser;
    res.json(u);
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    const { password: _, socketId, ...u } = result.rows[0];
    res.json(u);
  } else {
    const data = loadData();
    const user = data.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    const { password: _, ...u } = user;
    res.json(u);
  }
});

// Users
app.get('/api/users', async (req, res) => {
  if (usePostgres) {
    const result = await pg.query('SELECT id, username, displayName, bio, avatar, following FROM users');
    res.json(result.rows);
  } else {
    const data = loadData();
    res.json(data.users.map(({ password, socketId, ...u }) => u));
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { displayName, bio, avatar } = req.body;
  if (usePostgres) {
    if (displayName !== undefined) await pg.query('UPDATE users SET displayName = $1 WHERE id = $2', [displayName, id]);
    if (bio !== undefined) await pg.query('UPDATE users SET bio = $1 WHERE id = $2', [bio, id]);
    if (avatar !== undefined) await pg.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, id]);
    const result = await pg.query('SELECT id, username, displayName, bio, avatar, following FROM users WHERE id = $1', [id]);
    res.json(result.rows[0]);
  } else {
    const data = loadData();
    const user = data.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    if (displayName !== undefined) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    saveData(data);
    const { password: _, ...u } = user;
    res.json(u);
  }
});

app.post('/api/users/:id/follow', async (req, res) => {
  const { id } = req.params;
  const { currentUserId } = req.body;
  let currentUser, targetUser;
  if (usePostgres) {
    const u1 = await pg.query('SELECT * FROM users WHERE id = $1', [currentUserId]);
    if (u1.rows.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    currentUser = u1.rows[0];
    const u2 = await pg.query('SELECT * FROM users WHERE id = $1', [id]);
    targetUser = u2.rows[0];
  } else {
    const data = loadData();
    currentUser = data.users.find(u => u.id === currentUserId);
    targetUser = data.users.find(u => u.id === id);
    if (!currentUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }

  let following = JSON.parse(currentUser.following || '[]');
  const index = following.indexOf(id);
  if (index > -1) {
    following.splice(index, 1);
  } else {
    following.push(id);
    if (targetUser) {
      addNotification(id, `${currentUser.displayName} seni arkadaş olarak ekledi! 👥`);
      emitToUser(id, 'friend-added', { userId: currentUserId, displayName: currentUser.displayName });
    }
  }

  if (usePostgres) {
    await pg.query('UPDATE users SET following = $1 WHERE id = $2', [JSON.stringify(following), currentUserId]);
  } else {
    currentUser.following = following;
    saveData(loadData());
  }
  const { password: _, socketId, ...u } = { ...currentUser, following };
  res.json(u);
});

app.post('/api/users/:id/block', async (req, res) => {
  const { id } = req.params;
  const { currentUserId } = req.body;
  const blockKey = `${currentUserId}_${id}`;
  if (usePostgres) {
    const existing = await pg.query('SELECT key FROM blocks WHERE key = $1', [blockKey]);
    if (existing.rows.length > 0) { await pg.query('DELETE FROM blocks WHERE key = $1', [blockKey]); res.json({ success: true, blocked: false }); }
    else { await pg.query('INSERT INTO blocks (key) VALUES ($1)', [blockKey]); res.json({ success: true, blocked: true }); }
  } else {
    const data = loadData();
    if (!data.blocks) data.blocks = [];
    const index = data.blocks.indexOf(blockKey);
    if (index > -1) { data.blocks.splice(index, 1); } else { data.blocks.push(blockKey); }
    saveData(data);
    res.json({ success: true, blocked: index === -1 });
  }
});

app.get('/api/blocks/:userId', async (req, res) => {
  const { userId } = req.params;
  if (usePostgres) {
    const result = await pg.query('SELECT key FROM blocks');
    res.json(result.rows.map(r => r.key).filter(b => b.startsWith(`${userId}_`)).map(b => b.split('_')[1]));
  } else {
    const data = loadData();
    res.json((data.blocks || []).filter(b => b.startsWith(`${userId}_`)).map(b => b.split('_')[1]));
  }
});

// Friend Requests
app.post('/api/friend-requests', async (req, res) => {
  const { senderId, receiverId } = req.body;
  if (usePostgres) {
    const existing = await pg.query('SELECT id FROM friend_requests WHERE senderId = $1 AND receiverId = $2 AND status = $3', [senderId, receiverId, 'pending']);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'İstek zaten gönderilmiş.' });
    const sender = await pg.query('SELECT * FROM users WHERE id = $1', [senderId]);
    if (sender.rows.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    await pg.query('INSERT INTO friend_requests (id, senderId, receiverId, status, timestamp) VALUES ($1,$2,$3,$4,$5)', [id, senderId, receiverId, 'pending', Date.now()]);
    const s = sender.rows[0];
    addNotification(receiverId, `${s.displayName} sana arkadaşlık isteği gönderdi! 🤝`);
    emitToUser(receiverId, 'friend-request', { requestId: id, senderId, senderName: s.displayName, senderAvatar: s.avatar });
    res.json({ id, senderId, receiverId, status: 'pending', timestamp: Date.now() });
  } else {
    const data = loadData();
    if (!data.friendRequests) data.friendRequests = [];
    const existing = data.friendRequests.find(r => r.senderId === senderId && r.receiverId === receiverId && r.status === 'pending');
    if (existing) return res.status(400).json({ error: 'İstek zaten gönderilmiş.' });
    const sender = data.users.find(u => u.id === senderId);
    if (!sender) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const request = { id: Date.now().toString(), senderId, receiverId, status: 'pending', timestamp: Date.now() };
    data.friendRequests.push(request);
    saveData(data);
    addNotification(receiverId, `${sender.displayName} sana arkadaşlık isteği gönderdi! 🤝`);
    emitToUser(receiverId, 'friend-request', { requestId: request.id, senderId, senderName: sender.displayName, senderAvatar: sender.avatar });
    res.json(request);
  }
});

app.get('/api/friend-requests/:userId', async (req, res) => {
  const { userId } = req.params;
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM friend_requests WHERE receiverId = $1 AND status = $2', [userId, 'pending']);
    const enriched = await Promise.all(result.rows.map(async r => {
      const s = await pg.query('SELECT * FROM users WHERE id = $1', [r.senderid]);
      const sender = s.rows[0];
      return { ...r, senderName: sender ? sender.displayName : 'Bilinmeyen', senderUsername: sender ? sender.username : '', senderAvatar: sender ? sender.avatar : '' };
    }));
    res.json(enriched);
  } else {
    const data = loadData();
    const requests = (data.friendRequests || []).filter(r => r.receiverId === userId && r.status === 'pending');
    const enriched = requests.map(r => {
      const sender = data.users.find(u => u.id === r.senderId);
      return { ...r, senderName: sender ? sender.displayName : 'Bilinmeyen', senderUsername: sender ? sender.username : '', senderAvatar: sender ? sender.avatar : '' };
    });
    res.json(enriched);
  }
});

app.post('/api/friend-requests/:requestId/accept', async (req, res) => {
  const { requestId } = req.params;
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM friend_requests WHERE id = $1', [requestId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'İstek bulunamadı.' });
    const request = result.rows[0];
    await pg.query('UPDATE friend_requests SET status = $1 WHERE id = $2', ['accepted', requestId]);
    const s1 = await pg.query('SELECT * FROM users WHERE id = $1', [request.senderid]);
    const s2 = await pg.query('SELECT * FROM users WHERE id = $1', [request.receiverid]);
    const sender = s1.rows[0], receiver = s2.rows[0];
    if (sender && receiver) {
      let sFollowing = JSON.parse(sender.following || '[]');
      let rFollowing = JSON.parse(receiver.following || '[]');
      if (!sFollowing.includes(receiver.id)) sFollowing.push(receiver.id);
      if (!rFollowing.includes(sender.id)) rFollowing.push(sender.id);
      await pg.query('UPDATE users SET following = $1 WHERE id = $2', [JSON.stringify(sFollowing), sender.id]);
      await pg.query('UPDATE users SET following = $1 WHERE id = $2', [JSON.stringify(rFollowing), receiver.id]);
      addNotification(request.senderid, `${receiver.displayName} arkadaşlık isteğini kabul etti! 🎉`);
      emitToUser(request.senderid, 'friend-request-accepted', { userId: receiver.id, displayName: receiver.displayName, avatar: receiver.avatar });
    }
    res.json({ success: true });
  } else {
    const data = loadData();
    const request = data.friendRequests.find(r => r.id === requestId);
    if (!request) return res.status(404).json({ error: 'İstek bulunamadı.' });
    request.status = 'accepted';
    const sender = data.users.find(u => u.id === request.senderId);
    const receiver = data.users.find(u => u.id === request.receiverId);
    if (sender && receiver) {
      if (!sender.following) sender.following = [];
      if (!receiver.following) receiver.following = [];
      if (!sender.following.includes(receiver.id)) sender.following.push(receiver.id);
      if (!receiver.following.includes(sender.id)) receiver.following.push(sender.id);
      addNotification(request.senderId, `${receiver.displayName} arkadaşlık isteğini kabul etti! 🎉`);
      emitToUser(request.senderId, 'friend-request-accepted', { userId: receiver.id, displayName: receiver.displayName, avatar: receiver.avatar });
    }
    saveData(data);
    res.json({ success: true });
  }
});

app.post('/api/friend-requests/:requestId/reject', async (req, res) => {
  const { requestId } = req.params;
  if (usePostgres) {
    await pg.query('UPDATE friend_requests SET status = $1 WHERE id = $2', ['rejected', requestId]);
  } else {
    const data = loadData();
    const request = data.friendRequests.find(r => r.id === requestId);
    if (!request) return res.status(404).json({ error: 'İstek bulunamadı.' });
    request.status = 'rejected';
    saveData(data);
  }
  res.json({ success: true });
});

// Tweets
app.get('/api/tweets', async (req, res) => {
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM tweets ORDER BY timestamp DESC');
    res.json(result.rows);
  } else {
    const data = loadData();
    res.json(data.tweets.sort((a, b) => b.timestamp - a.timestamp));
  }
});

app.post('/api/tweets', async (req, res) => {
  const { userId, content, image } = req.body;
  let user;
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    user = result.rows[0];
  } else {
    const data = loadData();
    user = data.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }

  const newTweet = { id: Date.now().toString(), userId, authorName: user.displayName, authorUsername: user.username, authorAvatar: user.avatar, content, image: image || null, likes: [], comments: [], timestamp: Date.now() };

  if (usePostgres) {
    await pg.query('INSERT INTO tweets (id, userId, authorName, authorUsername, authorAvatar, content, image, likes, comments, timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [newTweet.id, newTweet.userId, newTweet.authorName, newTweet.authorUsername, newTweet.authorAvatar, newTweet.content, newTweet.image, '[]', '[]', newTweet.timestamp]);
    const followers = await pg.query('SELECT * FROM users WHERE following LIKE $1', [`%"${userId}"%`]);
    followers.rows.forEach(u => {
      addNotification(u.id, `${user.displayName} yeni bir tweet paylaştı! 🐦`);
      emitToUser(u.id, 'new-tweet', newTweet);
    });
  } else {
    const data = loadData();
    data.tweets.unshift(newTweet);
    saveData(data);
    data.users.forEach(u => {
      if (u.following && u.following.includes(userId)) {
        addNotification(u.id, `${user.displayName} yeni bir tweet paylaştı! 🐦`);
        emitToUser(u.id, 'new-tweet', newTweet);
      }
    });
  }
  res.json(newTweet);
});

app.delete('/api/tweets/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM tweets WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tweet bulunamadı.' });
    if (result.rows[0].userid !== userId) return res.status(403).json({ error: 'Yetkiniz yok.' });
    await pg.query('DELETE FROM tweets WHERE id = $1', [id]);
  } else {
    const data = loadData();
    const index = data.tweets.findIndex(t => t.id === id);
    if (index === -1) return res.status(404).json({ error: 'Tweet bulunamadı.' });
    if (data.tweets[index].userId !== userId) return res.status(403).json({ error: 'Yetkiniz yok.' });
    data.tweets.splice(index, 1);
    saveData(data);
  }
  res.json({ success: true });
});

app.post('/api/tweets/:id/like', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  let tweet;
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM tweets WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Bulunamadı.' });
    tweet = result.rows[0];
    let likes = JSON.parse(tweet.likes || '[]');
    const idx = likes.indexOf(userId);
    if (idx > -1) likes.splice(idx, 1); else likes.push(userId);
    await pg.query('UPDATE tweets SET likes = $1 WHERE id = $2', [JSON.stringify(likes), id]);
    tweet.likes = likes;
  } else {
    const data = loadData();
    tweet = data.tweets.find(t => t.id === id);
    if (!tweet) return res.status(404).json({ error: 'Bulunamadı.' });
    const idx = tweet.likes.indexOf(userId);
    if (idx > -1) tweet.likes.splice(idx, 1); else tweet.likes.push(userId);
    saveData(data);
  }
  res.json(tweet);
});

app.post('/api/tweets/:id/comment', async (req, res) => {
  const { id } = req.params;
  const { userId, content } = req.body;
  let tweet, user;
  if (usePostgres) {
    const t = await pg.query('SELECT * FROM tweets WHERE id = $1', [id]);
    const u = await pg.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (t.rows.length === 0 || u.rows.length === 0) return res.status(404).json({ error: 'Bulunamadı.' });
    tweet = t.rows[0]; user = u.rows[0];
    let comments = JSON.parse(tweet.comments || '[]');
    comments.push({ id: Date.now().toString(), userId, authorName: user.displayName, authorAvatar: user.avatar, content, timestamp: Date.now() });
    await pg.query('UPDATE tweets SET comments = $1 WHERE id = $2', [JSON.stringify(comments), id]);
    if (tweet.userid !== userId) addNotification(tweet.userid, `${user.displayName} gönderine yorum yaptı 💬`);
    tweet.comments = comments;
  } else {
    const data = loadData();
    tweet = data.tweets.find(t => t.id === id);
    user = data.users.find(u => u.id === userId);
    if (!tweet || !user) return res.status(404).json({ error: 'Bulunamadı.' });
    if (!tweet.comments) tweet.comments = [];
    tweet.comments.push({ id: Date.now().toString(), userId, authorName: user.displayName, authorAvatar: user.avatar, content, timestamp: Date.now() });
    saveData(data);
    if (tweet.userId !== userId) addNotification(tweet.userId, `${user.displayName} gönderine yorum yaptı 💬`);
  }
  res.json(tweet);
});

// Bookmarks
app.get('/api/bookmarks/:userId', async (req, res) => {
  const { userId } = req.params;
  if (usePostgres) {
    const bookmarks = await pg.query('SELECT tweetId FROM bookmarks WHERE userId = $1', [userId]);
    const tweetIds = bookmarks.rows.map(r => r.tweetid);
    const tweets = await pg.query('SELECT * FROM tweets');
    res.json(tweets.rows.filter(t => tweetIds.includes(t.id)));
  } else {
    const data = loadData();
    if (!data.bookmarks) data.bookmarks = {};
    const userBookmarks = data.bookmarks[userId] || [];
    res.json(data.tweets.filter(t => userBookmarks.includes(t.id)));
  }
});

app.post('/api/bookmarks', async (req, res) => {
  const { userId, tweetId } = req.body;
  if (usePostgres) {
    const existing = await pg.query('SELECT userId FROM bookmarks WHERE userId = $1 AND tweetId = $2', [userId, tweetId]);
    if (existing.rows.length > 0) await pg.query('DELETE FROM bookmarks WHERE userId = $1 AND tweetId = $2', [userId, tweetId]);
    else await pg.query('INSERT INTO bookmarks (userId, tweetId) VALUES ($1, $2)', [userId, tweetId]);
  } else {
    const data = loadData();
    if (!data.bookmarks) data.bookmarks = {};
    if (!data.bookmarks[userId]) data.bookmarks[userId] = [];
    const index = data.bookmarks[userId].indexOf(tweetId);
    if (index > -1) data.bookmarks[userId].splice(index, 1);
    else data.bookmarks[userId].push(tweetId);
    saveData(data);
  }
  res.json({ success: true });
});

// Messages
app.get('/api/messages', async (req, res) => {
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM messages ORDER BY timestamp ASC');
    res.json(result.rows);
  } else {
    const data = loadData();
    res.json(data.messages);
  }
});

app.post('/api/messages', async (req, res) => {
  const { senderId, receiverId, content } = req.body;
  const id = Date.now().toString();
  if (usePostgres) {
    const sender = await pg.query('SELECT * FROM users WHERE id = $1', [senderId]);
    await pg.query('INSERT INTO messages (id, senderId, receiverId, content, seen, timestamp) VALUES ($1,$2,$3,$4,$5,$6)', [id, senderId, receiverId, content, false, Date.now()]);
    if (sender.rows.length > 0) {
      const s = sender.rows[0];
      addNotification(receiverId, `${s.displayName} sana yeni bir mesaj gönderdi 💬`);
      emitToUser(receiverId, 'new-message', { id, senderId, receiverId, content, seen: false, timestamp: Date.now(), senderName: s.displayName, senderAvatar: s.avatar });
    }
  } else {
    const data = loadData();
    const sender = data.users.find(u => u.id === senderId);
    const newMsg = { id, senderId, receiverId, content, seen: false, timestamp: Date.now() };
    data.messages.push(newMsg);
    saveData(data);
    if (sender) {
      addNotification(receiverId, `${sender.displayName} sana yeni bir mesaj gönderdi 💬`);
      emitToUser(receiverId, 'new-message', { ...newMsg, senderName: sender.displayName, senderAvatar: sender.avatar });
    }
  }
  res.json({ id, senderId, receiverId, content, seen: false, timestamp: Date.now() });
});

app.delete('/api/messages/:id', async (req, res) => {
  const { id } = req.params;
  if (usePostgres) { await pg.query('DELETE FROM messages WHERE id = $1', [id]); }
  else { const data = loadData(); const index = data.messages.findIndex(m => m.id === id); if (index !== -1) data.messages.splice(index, 1); saveData(data); }
  res.json({ success: true });
});

app.post('/api/messages/seen', async (req, res) => {
  const { userId, partnerId } = req.body;
  if (usePostgres) { await pg.query('UPDATE messages SET seen = TRUE WHERE senderId = $1 AND receiverId = $2', [partnerId, userId]); }
  else { const data = loadData(); data.messages.forEach(m => { if (m.senderId === partnerId && m.receiverId === userId) m.seen = true; }); saveData(data); }
  res.json({ success: true });
});

// Notifications
app.get('/api/notifications/:userId', async (req, res) => {
  const { userId } = req.params;
  if (usePostgres) {
    const result = await pg.query('SELECT * FROM notifications WHERE userId = $1 ORDER BY timestamp DESC', [userId]);
    res.json(result.rows);
  } else {
    const data = loadData();
    res.json(data.notifications[userId] || []);
  }
});

// Socket.io
const userSockets = {};

io.on('connection', (socket) => {
  console.log('Kullanıcı bağlandı:', socket.id);

  socket.on('register-socket', async (userId) => {
    userSockets[userId] = socket.id;
    if (usePostgres) {
      await pg.query('UPDATE users SET socketId = $1 WHERE id = $2', [socket.id, userId]);
    } else {
      const data = loadData();
      const user = data.users.find(u => u.id === userId);
      if (user) { user.socketId = socket.id; saveData(data); }
    }
    console.log(`Socket kaydedildi: ${userId} -> ${socket.id}`);
  });

  socket.on('disconnect', async () => {
    const userId = Object.keys(userSockets).find(k => userSockets[k] === socket.id);
    if (userId) {
      delete userSockets[userId];
      if (usePostgres) {
        await pg.query('UPDATE users SET socketId = NULL WHERE id = $1', [userId]);
      } else {
        const data = loadData();
        const user = data.users.find(u => u.id === userId);
        if (user) { user.socketId = null; saveData(data); }
      }
    }
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

// Initialize and start
if (usePostgres) {
  pg.init().then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT} (PostgreSQL)`));
  });
} else {
  server.listen(PORT, () => console.log(`Server running on port ${PORT} (JSON)`));
}
