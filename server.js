// ============================================================
// server.js — MyGPT Node.js backend
// Handles: Auth, Groq API calls, JSON-file chat storage, REST API
// ============================================================

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const crypto  = require("crypto");

// ── CONFIGURATION ────────────────────────────────────────────
const PORT    = 3000;
const API_KEY = "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";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL   = "llama-3.3-70b-versatile";

// Use a fixed secret so tokens survive server restarts
const JWT_SECRET = "mygpt_secret_key_2024_do_not_share";

const SYSTEM_PROMPT = `You are MyGPT, a helpful and friendly AI assistant 
created by the user. You answer questions clearly and concisely. 
You are not ChatGPT — you are MyGPT, a personal AI assistant.
When the user shares a file, image, video, or link, acknowledge it and 
help them with whatever they need related to that content.`;
// ─────────────────────────────────────────────────────────────


// ── JSON FILE DATABASE ───────────────────────────────────────
const DB_FILE = path.join(__dirname, "mygpt-data.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], chats: [], messages: [], nextUserId: 1, nextChatId: 1, nextMsgId: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return { users: [], chats: [], messages: [], nextUserId: 1, nextChatId: 1, nextMsgId: 1 };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}


// ── SIMPLE TOKEN HELPERS ─────────────────────────────────────
function createToken(userId) {
  const payload = { userId, iat: Date.now() };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    return null;
  }
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + JWT_SECRET).digest("hex");
}


// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = payload.userId;
  next();
}


// ── EXPRESS APP ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Serve static frontend files from /public (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, "public")));


// ============================================================
// PAGE ROUTES (must come BEFORE the catch-all)
// ============================================================

// Login/Register page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

// Also support /register and /signup URLs
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});


// ============================================================
// AUTH API ROUTES
// ============================================================

// ── POST /api/auth/signup — create account with email/password
app.post("/api/auth/signup", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const db = loadDB();

  // Check if email already exists
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
  }

  // Create user
  const user = {
    id: db.nextUserId++,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hashPassword(password),
    provider: "email",
    created_at: new Date().toISOString()
  };

  db.users.push(user);
  saveDB(db);

  // Return token so user is logged in immediately after signup
  const token = createToken(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, provider: user.provider }
  });
});

// ── POST /api/auth/login — sign in with email/password (validates against saved data)
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  const db = loadDB();
  const user = db.users.find(u => u.email === email.toLowerCase().trim());

  // User doesn't exist
  if (!user) {
    return res.status(401).json({ error: "No account found with this email. Please sign up first." });
  }

  // User signed up with social login (no password set)
  if (!user.password) {
    return res.status(401).json({ error: `This account uses ${user.provider} login. Please sign in with ${user.provider}.` });
  }

  // Wrong password
  if (user.password !== hashPassword(password)) {
    return res.status(401).json({ error: "Incorrect password. Please try again." });
  }

  const token = createToken(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, provider: user.provider }
  });
});

// ── GET /api/auth/me — get current user info (validate token)
app.get("/api/auth/me", authMiddleware, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, name: user.name, email: user.email, provider: user.provider });
});

// ── GET /api/auth/google — simulate Google OAuth redirect
app.get("/api/auth/google", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth-callback.html"));
});

// ── GET /api/auth/github — simulate GitHub OAuth redirect
app.get("/api/auth/github", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth-callback.html"));
});

// ── POST /api/auth/social — handle social login completion
app.post("/api/auth/social", (req, res) => {
  const { provider, name, email } = req.body;

  if (!provider || !email || !email.trim()) {
    return res.status(400).json({ error: "Provider and email are required" });
  }

  const db = loadDB();

  // Find existing user or create new one
  let user = db.users.find(u => u.email === email.toLowerCase().trim());

  if (!user) {
    user = {
      id: db.nextUserId++,
      name: (name || email.split("@")[0]).trim(),
      email: email.toLowerCase().trim(),
      password: null,
      provider,
      created_at: new Date().toISOString()
    };
    db.users.push(user);
    saveDB(db);
  }

  const token = createToken(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, provider: user.provider }
  });
});


// ============================================================
// CHAT API ROUTES (protected — user must be logged in)
// ============================================================

// ── GET /api/chats — list all chat sessions for the logged-in user
app.get("/api/chats", authMiddleware, (req, res) => {
  const db = loadDB();
  const chats = db.chats
    .filter(c => c.user_id === req.userId)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  res.json(chats);
});

// ── POST /api/chats — create a new chat session
app.post("/api/chats", authMiddleware, (req, res) => {
  const db = loadDB();
  const title = req.body.title || "New Chat";
  const chat = {
    id: db.nextChatId++,
    user_id: req.userId,
    title,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.chats.push(chat);
  saveDB(db);
  res.json(chat);
});

// ── PUT /api/chats/:id — update chat title
app.put("/api/chats/:id", authMiddleware, (req, res) => {
  const db = loadDB();
  const chatId = parseInt(req.params.id);
  const chat = db.chats.find(c => c.id === chatId && c.user_id === req.userId);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  chat.title = req.body.title || chat.title;
  chat.updated_at = new Date().toISOString();
  saveDB(db);
  res.json(chat);
});

// ── DELETE /api/chats/:id — delete a chat and its messages
app.delete("/api/chats/:id", authMiddleware, (req, res) => {
  const db = loadDB();
  const chatId = parseInt(req.params.id);
  const chat = db.chats.find(c => c.id === chatId && c.user_id === req.userId);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  db.chats = db.chats.filter(c => c.id !== chatId);
  db.messages = db.messages.filter(m => m.chat_id !== chatId);
  saveDB(db);
  res.json({ success: true });
});

// ── GET /api/chats/:id/messages — get all messages in a chat
app.get("/api/chats/:id/messages", authMiddleware, (req, res) => {
  const db = loadDB();
  const chatId = parseInt(req.params.id);
  const chat = db.chats.find(c => c.id === chatId && c.user_id === req.userId);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  const messages = db.messages
    .filter(m => m.chat_id === chatId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  res.json(messages);
});

// ── POST /api/chats/:id/messages — send a message & get AI reply
app.post("/api/chats/:id/messages", authMiddleware, async (req, res) => {
  const db = loadDB();
  const chatId = parseInt(req.params.id);
  const chat = db.chats.find(c => c.id === chatId && c.user_id === req.userId);
  if (!chat) return res.status(404).json({ error: "Chat not found" });

  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Message content is required" });
  }

  // Save user message
  const userMsg = {
    id: db.nextMsgId++,
    chat_id: chatId,
    role: "user",
    content,
    created_at: new Date().toISOString()
  };
  db.messages.push(userMsg);
  saveDB(db);

  // Get full conversation history for this chat
  const history = db.messages
    .filter(m => m.chat_id === chatId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Build messages array for Groq API
  const apiMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role, content: m.content }))
  ];

  try {
    // Call Groq API
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || "Groq API request failed");
    }

    const data = await response.json();
    const reply = data.choices[0].message.content.trim();

    // Save AI reply
    const db2 = loadDB();
    const aiMsg = {
      id: db2.nextMsgId++,
      chat_id: chatId,
      role: "assistant",
      content: reply,
      created_at: new Date().toISOString()
    };
    db2.messages.push(aiMsg);

    // Update chat title from first user message (if it's still "New Chat")
    const chatRef = db2.chats.find(c => c.id === chatId);
    if (chatRef) {
      if (chatRef.title === "New Chat") {
        chatRef.title = content.length > 40 ? content.substring(0, 40) + "…" : content;
      }
      chatRef.updated_at = new Date().toISOString();
    }

    saveDB(db2);
    res.json({ role: "assistant", content: reply });

  } catch (error) {
    console.error("Groq API error:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// ── CATCH-ALL — serve index.html (the chat app) for any unknown route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ── START SERVER ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ MyGPT server running at http://localhost:${PORT}\n`);
});
