const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

const DATA_FILE = path.join(__dirname, 'database.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      users: [],
      tweets: [],
      messages: [],
      bookmarks: {},
      blocks: [],
      notifications: {},
      friendRequests: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { users: [], tweets: [], messages: [], bookmarks: [], blocks: [], notifications: {}, friendRequests: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function addNotification(userId, text) {
  const data = loadData();
  if (!data.notifications) data.notifications = {};
  if (!data.notifications[userId]) data.notifications[userId] = [];
  data.notifications[userId].unshift({
    id: Date.now().toString(),
    text,
    timestamp: Date.now()
  });
  saveData(data);
}

function getUserSocketId(userId) {
  const data = loadData();
  const user = data.users.find(u => u.id === userId);
  return user ? user.socketId || null : null;
}

function emitToUser(userId, event, data) {
  const socketId = getUserSocketId(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
}

const birdAvatars = [
  "https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1522858547137-f1d65545800d?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=150&q=80"
];

// Auth
app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body;
  const data = loadData();
  if (data.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
  }

  const randomAvatar = birdAvatars[Math.floor(Math.random() * birdAvatars.length)];
  const newUser = {
    id: Date.now().toString(),
    username,
    password,
    displayName: displayName || username,
    bio: 'Tweetier kuşu 🐦',
    avatar: randomAvatar,
    following: [],
    socketId: null
  };
  data.users.push(newUser);
  saveData(data);
  const { password: _, ...userWithoutPass } = newUser;
  res.json(userWithoutPass);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const data = loadData();
  const user = data.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  const { password: _, ...userWithoutPass } = user;
  res.json(userWithoutPass);
});

// Users
app.get('/api/users', (req, res) => {
  const data = loadData();
  const users = data.users.map(({ password, socketId, ...u }) => u);
  res.json(users);
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { displayName, bio, avatar } = req.body;
  const data = loadData();
  const user = data.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  if (displayName !== undefined) user.displayName = displayName;
  if (bio !== undefined) user.bio = bio;
  if (avatar !== undefined) user.avatar = avatar;
  saveData(data);

  const { password: _, ...userWithoutPass } = user;
  res.json(userWithoutPass);
});

app.post('/api/users/:id/follow', (req, res) => {
  const { id } = req.params;
  const { currentUserId } = req.body;
  const data = loadData();
  const currentUser = data.users.find(u => u.id === currentUserId);
  if (!currentUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  if (!currentUser.following) currentUser.following = [];
  const index = currentUser.following.indexOf(id);
  if (index > -1) {
    currentUser.following.splice(index, 1);
  } else {
    currentUser.following.push(id);
    addNotification(id, `${currentUser.displayName} seni arkadaş olarak ekledi! 👥`);
    emitToUser(id, 'friend-added', { userId: currentUserId, displayName: currentUser.displayName });
  }
  saveData(data);
  const { password: _, ...userWithoutPass } = currentUser;
  res.json(userWithoutPass);
});

app.post('/api/users/:id/block', (req, res) => {
  const { id } = req.params;
  const { currentUserId } = req.body;
  const data = loadData();
  if (!data.blocks) data.blocks = [];

  const blockKey = `${currentUserId}_${id}`;
  const index = data.blocks.indexOf(blockKey);
  if (index > -1) {
    data.blocks.splice(index, 1);
  } else {
    data.blocks.push(blockKey);
  }
  saveData(data);
  res.json({ success: true, blocked: index === -1 });
});

app.get('/api/blocks/:userId', (req, res) => {
  const { userId } = req.params;
  const data = loadData();
  const userBlocks = (data.blocks || []).filter(b => b.startsWith(`${userId}_`)).map(b => b.split('_')[1]);
  res.json(userBlocks);
});

// Friend Requests
app.post('/api/friend-requests', (req, res) => {
  const { senderId, receiverId } = req.body;
  const data = loadData();
  if (!data.friendRequests) data.friendRequests = [];

  const existing = data.friendRequests.find(
    r => r.senderId === senderId && r.receiverId === receiverId && r.status === 'pending'
  );
  if (existing) return res.status(400).json({ error: 'İstek zaten gönderilmiş.' });

  const sender = data.users.find(u => u.id === senderId);
  if (!sender) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const request = {
    id: Date.now().toString(),
    senderId,
    receiverId,
    status: 'pending',
    timestamp: Date.now()
  };
  data.friendRequests.push(request);
  saveData(data);

  addNotification(receiverId, `${sender.displayName} sana arkadaşlık isteği gönderdi! 🤝`);
  emitToUser(receiverId, 'friend-request', {
    requestId: request.id,
    senderId,
    senderName: sender.displayName,
    senderAvatar: sender.avatar
  });

  res.json(request);
});

app.get('/api/friend-requests/:userId', (req, res) => {
  const { userId } = req.params;
  const data = loadData();
  const requests = (data.friendRequests || []).filter(
    r => r.receiverId === userId && r.status === 'pending'
  );
  const enriched = requests.map(r => {
    const sender = data.users.find(u => u.id === r.senderId);
    return {
      ...r,
      senderName: sender ? sender.displayName : 'Bilinmeyen',
      senderUsername: sender ? sender.username : '',
      senderAvatar: sender ? sender.avatar : ''
    };
  });
  res.json(enriched);
});

app.post('/api/friend-requests/:requestId/accept', (req, res) => {
  const { requestId } = req.params;
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
    emitToUser(request.senderId, 'friend-request-accepted', {
      userId: receiver.id,
      displayName: receiver.displayName,
      avatar: receiver.avatar
    });
  }

  saveData(data);
  res.json({ success: true });
});

app.post('/api/friend-requests/:requestId/reject', (req, res) => {
  const { requestId } = req.params;
  const data = loadData();
  const request = data.friendRequests.find(r => r.id === requestId);
  if (!request) return res.status(404).json({ error: 'İstek bulunamadı.' });

  request.status = 'rejected';
  saveData(data);
  res.json({ success: true });
});

// Tweets
app.get('/api/tweets', (req, res) => {
  const data = loadData();
  res.json(data.tweets.sort((a, b) => b.timestamp - a.timestamp));
});

app.post('/api/tweets', (req, res) => {
  const { userId, content, image } = req.body;
  const data = loadData();
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const newTweet = {
    id: Date.now().toString(),
    userId,
    authorName: user.displayName,
    authorUsername: user.username,
    authorAvatar: user.avatar,
    content,
    image: image || null,
    likes: [],
    comments: [],
    timestamp: Date.now()
  };
  data.tweets.unshift(newTweet);
  saveData(data);

  data.users.forEach(u => {
    if (u.following && u.following.includes(userId)) {
      addNotification(u.id, `${user.displayName} yeni bir tweet paylaştı! 🐦`);
      emitToUser(u.id, 'new-tweet', newTweet);
    }
  });

  res.json(newTweet);
});

app.delete('/api/tweets/:id', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const data = loadData();
  const index = data.tweets.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Tweet bulunamadı.' });

  if (data.tweets[index].userId !== userId) {
    return res.status(403).json({ error: 'Yetkiniz yok.' });
  }

  data.tweets.splice(index, 1);
  saveData(data);
  res.json({ success: true });
});

app.post('/api/tweets/:id/like', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const data = loadData();
  const tweet = data.tweets.find(t => t.id === id);
  if (!tweet) return res.status(404).json({ error: 'Bulunamadı.' });

  const index = tweet.likes.indexOf(userId);
  if (index > -1) {
    tweet.likes.splice(index, 1);
  } else {
    tweet.likes.push(userId);
  }
  saveData(data);
  res.json(tweet);
});

app.post('/api/tweets/:id/comment', (req, res) => {
  const { id } = req.params;
  const { userId, content } = req.body;
  const data = loadData();
  const tweet = data.tweets.find(t => t.id === id);
  const user = data.users.find(u => u.id === userId);
  if (!tweet || !user) return res.status(404).json({ error: 'Bulunamadı.' });

  if (!tweet.comments) tweet.comments = [];
  tweet.comments.push({
    id: Date.now().toString(),
    userId,
    authorName: user.displayName,
    authorAvatar: user.avatar,
    content,
    timestamp: Date.now()
  });
  saveData(data);

  if (tweet.userId !== userId) {
    addNotification(tweet.userId, `${user.displayName} gönderine yorum yaptı 💬`);
  }
  res.json(tweet);
});

// Bookmarks
app.get('/api/bookmarks/:userId', (req, res) => {
  const { userId } = req.params;
  const data = loadData();
  if (!data.bookmarks) data.bookmarks = {};
  const userBookmarks = data.bookmarks[userId] || [];
  const savedTweets = data.tweets.filter(t => userBookmarks.includes(t.id));
  res.json(savedTweets);
});

app.post('/api/bookmarks', (req, res) => {
  const { userId, tweetId } = req.body;
  const data = loadData();
  if (!data.bookmarks) data.bookmarks = {};
  if (!data.bookmarks[userId]) data.bookmarks[userId] = [];

  const index = data.bookmarks[userId].indexOf(tweetId);
  if (index > -1) {
    data.bookmarks[userId].splice(index, 1);
  } else {
    data.bookmarks[userId].push(tweetId);
  }
  saveData(data);
  res.json({ success: true });
});

// Messages
app.get('/api/messages', (req, res) => {
  const data = loadData();
  res.json(data.messages);
});

app.post('/api/messages', (req, res) => {
  const { senderId, receiverId, content } = req.body;
  const data = loadData();
  const sender = data.users.find(u => u.id === senderId);

  const newMsg = {
    id: Date.now().toString(),
    senderId,
    receiverId,
    content,
    seen: false,
    timestamp: Date.now()
  };
  data.messages.push(newMsg);
  saveData(data);

  if (sender) {
    addNotification(receiverId, `${sender.displayName} sana yeni bir mesaj gönderdi 💬`);
    emitToUser(receiverId, 'new-message', {
      ...newMsg,
      senderName: sender.displayName,
      senderAvatar: sender.avatar
    });
  }
  res.json(newMsg);
});

app.delete('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const index = data.messages.findIndex(m => m.id === id);
  if (index === -1) return res.status(404).json({ error: 'Mesaj bulunamadı.' });
  data.messages.splice(index, 1);
  saveData(data);
  res.json({ success: true });
});

app.post('/api/messages/seen', (req, res) => {
  const { userId, partnerId } = req.body;
  const data = loadData();
  data.messages.forEach(m => {
    if (m.senderId === partnerId && m.receiverId === userId) {
      m.seen = true;
    }
  });
  saveData(data);
  res.json({ success: true });
});

// Notifications
app.get('/api/notifications/:userId', (req, res) => {
  const { userId } = req.params;
  const data = loadData();
  if (!data.notifications) data.notifications = {};
  res.json(data.notifications[userId] || []);
});

// Socket.io
const userSockets = {};

io.on('connection', (socket) => {
  console.log('Kullanıcı bağlandı:', socket.id);

  socket.on('register-socket', (userId) => {
    userSockets[userId] = socket.id;
    const data = loadData();
    const user = data.users.find(u => u.id === userId);
    if (user) {
      user.socketId = socket.id;
      saveData(data);
    }
    console.log(`Socket kaydedildi: ${userId} -> ${socket.id}`);
  });

  socket.on('disconnect', () => {
    const userId = Object.keys(userSockets).find(k => userSockets[k] === socket.id);
    if (userId) {
      delete userSockets[userId];
      const data = loadData();
      const user = data.users.find(u => u.id === userId);
      if (user) {
        user.socketId = null;
        saveData(data);
      }
    }
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
