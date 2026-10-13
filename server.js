const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// Database helper functions
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      posts: [],
      friendRequests: [],
      friendships: [],
      messages: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { users: [], posts: [], friendRequests: [], friendships: [], messages: [] };
  }
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Routes

// Root health check
app.get('/', (req, res) => {
  res.json({ status: 'Tweetier API is running!', version: '1.0.0' });
});

// Register
app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
  }

  const db = loadDb();
  const existing = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
  }

  const newUser = {
    id: 'user_' + Date.now(),
    username,
    password,
    displayName: displayName || username,
    bio: 'Tweetier kullanıcısı',
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  saveDb(db);

  const { password: _, ...userSafe } = newUser;
  res.json({ message: 'Kayıt başarılı!', user: userSafe });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDb();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre.' });
  }

  const { password: _, ...userSafe } = user;
  res.json({ message: 'Giriş başarılı!', user: userSafe });
});

// Get user profile & stats
app.get('/api/users/:userId', (req, res) => {
  const db = loadDb();
  const user = db.users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const { password: _, ...userSafe } = user;
  res.json(userSafe);
});

// Search users
app.get('/api/users', (req, res) => {
  const db = loadDb();
  const query = (req.query.q || '').toLowerCase();
  const currentUserId = req.query.currentUserId;

  let users = db.users.map(({ password, ...u }) => u);
  if (query) {
    users = users.filter(u => u.username.toLowerCase().includes(query) || u.displayName.toLowerCase().includes(query));
  }
  if (currentUserId) {
    users = users.filter(u => u.id !== currentUserId);
  }
  res.json(users);
});

// Get posts (timeline)
app.get('/api/posts', (req, res) => {
  const db = loadDb();
  const currentUserId = req.query.userId;

  // Enrich posts with user info
  const postsWithUser = db.posts.map(post => {
    const author = db.users.find(u => u.id === post.userId);
    return {
      ...post,
      author: author ? { id: author.id, username: author.username, displayName: author.displayName, avatar: author.avatar } : { username: 'Bilinmeyen' }
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(postsWithUser);
});

// Create post (tweet)
app.post('/api/posts', (req, res) => {
  const { userId, content } = req.body;
  if (!userId || !content) {
    return res.status(400).json({ error: 'Kullanıcı ID ve içerik gereklidir.' });
  }

  const db = loadDb();
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const newPost = {
    id: 'post_' + Date.now(),
    userId,
    content,
    likes: [],
    createdAt: new Date().toISOString()
  };

  db.posts.push(newPost);
  saveDb(db);

  const postWithUser = {
    ...newPost,
    author: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar }
  };

  res.json(postWithUser);
});

// Like / Unlike post
app.post('/api/posts/:postId/like', (req, res) => {
  const { userId } = req.body;
  const db = loadDb();
  const post = db.posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' });

  const index = post.likes.indexOf(userId);
  if (index > -1) {
    post.likes.splice(index, 1);
  } else {
    post.likes.push(userId);
  }

  saveDb(db);
  res.json(post);
});

// Friend Request System
// Send friend request
app.post('/api/friends/request', (req, res) => {
  const { senderId, receiverId } = req.body;
  if (!senderId || !receiverId || senderId === receiverId) {
    return res.status(400).json({ error: 'Geçersiz istek.' });
  }

  const db = loadDb();
  
  // Check if already friends
  const alreadyFriends = db.friendships.some(
    f => (f.user1 === senderId && f.user2 === receiverId) || (f.user1 === receiverId && f.user2 === senderId)
  );
  if (alreadyFriends) return res.status(400).json({ error: 'Zaten arkadaşsınız.' });

  // Check if request already exists
  const existingReq = db.friendRequests.find(
    r => (r.senderId === senderId && r.receiverId === receiverId) || (r.senderId === receiverId && r.receiverId === senderId)
  );
  if (existingReq) return res.status(400).json({ error: 'Zaten bekleyen bir arkadaşlık isteği var.' });

  const newReq = {
    id: 'req_' + Date.now(),
    senderId,
    receiverId,
    createdAt: new Date().toISOString()
  };

  db.friendRequests.push(newReq);
  saveDb(db);
  res.json({ message: 'Arkadaşlık isteği gönderildi!', request: newReq });
});

// Get friend requests for user
app.get('/api/friends/requests/:userId', (req, res) => {
  const db = loadDb();
  const userId = req.params.userId;

  const requests = db.friendRequests
    .filter(r => r.receiverId === userId)
    .map(r => {
      const sender = db.users.find(u => u.id === r.senderId);
      return {
        ...r,
        sender: sender ? { id: sender.id, username: sender.username, displayName: sender.displayName, avatar: sender.avatar } : null
      };
    });

  res.json(requests);
});

// Accept or reject friend request
app.post('/api/friends/respond', (req, res) => {
  const { requestId, action } = req.body; // action: 'accept' or 'reject'
  const db = loadDb();

  const reqIndex = db.friendRequests.findIndex(r => r.id === requestId);
  if (reqIndex === -1) return res.status(404).json({ error: 'İstek bulunamadı.' });

  const friendReq = db.friendRequests[reqIndex];
  db.friendRequests.splice(reqIndex, 1);

  if (action === 'accept') {
    db.friendships.push({
      id: 'ship_' + Date.now(),
      user1: friendReq.senderId,
      user2: friendReq.receiverId,
      createdAt: new Date().toISOString()
    });
  }

  saveDb(db);
  res.json({ message: action === 'accept' ? 'Arkadaşlık isteği kabul edildi.' : 'İstek reddedildi.' });
});

// Get user's friends list
app.get('/api/friends/:userId', (req, res) => {
  const db = loadDb();
  const userId = req.params.userId;

  const friendIds = [];
  db.friendships.forEach(f => {
    if (f.user1 === userId) friendIds.push(f.user2);
    if (f.user2 === userId) friendIds.push(f.user1);
  });

  const friends = db.users
    .filter(u => friendIds.includes(u.id))
    .map(({ password, ...u }) => u);

  res.json(friends);
});

// Messaging (Direct Messages)
// Get chat messages between two users
app.get('/api/messages/:userId1/:userId2', (req, res) => {
  const { userId1, userId2 } = req.params;
  const db = loadDb();

  const chatMessages = db.messages.filter(
    m => (m.senderId === userId1 && m.receiverId === userId2) || (m.senderId === userId2 && m.receiverId === userId1)
  ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  res.json(chatMessages);
});

// Send message
app.post('/api/messages', (req, res) => {
  const { senderId, receiverId, text } = req.body;
  if (!senderId || !receiverId || !text) {
    return res.status(400).json({ error: 'Eksik bilgi.' });
  }

  const db = loadDb();
  const newMessage = {
    id: 'msg_' + Date.now(),
    senderId,
    receiverId,
    text,
    createdAt: new Date().toISOString()
  };

  db.messages.push(newMessage);
  saveDb(db);
  res.json(newMessage);
});

app.listen(PORT, () => {
  console.log(`Tweetier Server is running on port ${PORT}`);
});
