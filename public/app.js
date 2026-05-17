// ============================================================
// app.js — MyGPT frontend (talks to Node.js backend)
// All chat history is stored via the server API.
// ============================================================

(function() {
  // ── Auth gate — if no token, redirect ONCE and stop ──────────
  const AUTH_TOKEN = localStorage.getItem("mygpt_token");
  if (!AUTH_TOKEN) {
    // Prevent infinite loop: only redirect if we're not already heading to /login
    if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
      window.location.href = "/login";
    }
    return; // Stop — don't run any chat code
  }

  // ── API base URL ─────────────────────────────────────────────
  const API_BASE = "/api";

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + AUTH_TOKEN
    };
  }

  function logout() {
    localStorage.removeItem("mygpt_token");
    localStorage.removeItem("mygpt_user");
    window.location.href = "/login";
  }

  // ── DOM references ─────────────────────────────────────────────
  const messagesDiv       = document.getElementById("messages");
  const userInput         = document.getElementById("userInput");
  const sendBtn           = document.getElementById("sendBtn");
  const newChatBtn        = document.getElementById("newChatBtn");
  const historyList       = document.getElementById("historyList");
  const attachBtn         = document.getElementById("attachBtn");
  const attachMenu        = document.getElementById("attachMenu");
  const fileInput         = document.getElementById("fileInput");
  const uploadFileBtn     = document.getElementById("uploadFileBtn");
  const uploadImageBtn    = document.getElementById("uploadImageBtn");
  const uploadVideoBtn    = document.getElementById("uploadVideoBtn");
  const addLinkBtn        = document.getElementById("addLinkBtn");
  const attachmentPreview = document.getElementById("attachmentPreview");
  const linkModal         = document.getElementById("linkModal");
  const linkInput         = document.getElementById("linkInput");
  const confirmLinkBtn    = document.getElementById("confirmLinkBtn");
  const cancelLinkBtn     = document.getElementById("cancelLinkBtn");
  const logoutBtn         = document.getElementById("logoutBtn");

  // If DOM elements are missing, we're on the wrong page — stop
  if (!messagesDiv || !userInput) return;

  // ── State ──────────────────────────────────────────────────────
  let currentChatId      = null;
  let pendingAttachments = [];

  // ============================================================
  // ON PAGE LOAD
  // ============================================================
  loadChatHistory();
  setupUserInfo();

  function setupUserInfo() {
    const userInfo = JSON.parse(localStorage.getItem("mygpt_user") || "{}");
    const userNameEl = document.getElementById("userName");
    if (userNameEl && userInfo.name) {
      userNameEl.textContent = userInfo.name;
    }
  }

  // ── Logout button ──────────────────────────────────────────────
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      logout();
    });
  }

  // ============================================================
  // LOAD CHAT HISTORY
  // ============================================================
  async function loadChatHistory() {
    try {
      const res = await fetch(`${API_BASE}/chats`, { headers: authHeaders() });
      if (res.status === 401) { logout(); return; }
      const chats = await res.json();
      historyList.innerHTML = "";
      chats.forEach(chat => addChatToSidebar(chat));
    } catch (err) {
      console.error("Failed to load chat history:", err);
    }
  }

  // ============================================================
  // TEXTAREA — auto-resize
  // ============================================================
  userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
  });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ============================================================
  // SEND BUTTON
  // ============================================================
  sendBtn.addEventListener("click", sendMessage);

  // ============================================================
  // NEW CHAT
  // ============================================================
  newChatBtn.addEventListener("click", () => {
    currentChatId = null;
    pendingAttachments = [];
    attachmentPreview.innerHTML = "";
    messagesDiv.innerHTML = "";
    showWelcome();
    document.querySelectorAll(".history-item").forEach(i => {
      i.classList.remove("active");
    });
  });

  // ============================================================
  // ATTACH BUTTON
  // ============================================================
  attachBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    attachMenu.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    attachMenu.classList.remove("open");
  });

  // ============================================================
  // ATTACH MENU OPTIONS
  // ============================================================
  uploadFileBtn.addEventListener("click", () => {
    fileInput.accept = ".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx";
    fileInput.click();
    attachMenu.classList.remove("open");
  });

  uploadImageBtn.addEventListener("click", () => {
    fileInput.accept = "image/*";
    fileInput.click();
    attachMenu.classList.remove("open");
  });

  uploadVideoBtn.addEventListener("click", () => {
    fileInput.accept = "video/*";
    fileInput.click();
    attachMenu.classList.remove("open");
  });

  addLinkBtn.addEventListener("click", () => {
    linkModal.classList.add("open");
    linkInput.value = "";
    linkInput.focus();
    attachMenu.classList.remove("open");
  });

  // ============================================================
  // FILE INPUT
  // ============================================================
  fileInput.addEventListener("change", () => {
    Array.from(fileInput.files).forEach(file => addFileAttachment(file));
    fileInput.value = "";
  });

  // ============================================================
  // ADD FILE ATTACHMENT
  // ============================================================
  function addFileAttachment(file) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const isPDF   = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isText  = file.type.startsWith("text/") ||
                    /\.(txt|csv|md|json|xml|html|css|js|ts|py|java|c|cpp|cs)$/i.test(file.name);

    if (isImage || isVideo) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const attachment = { type: isImage ? "image" : "video", name: file.name, dataURL: e.target.result, textContent: null };
        pendingAttachments.push(attachment);
        renderPreviewChip(attachment);
      };
      reader.readAsDataURL(file);

    } else if (isPDF) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const attachment = { type: "file", name: file.name, dataURL: null, textContent: "⏳ Reading PDF…" };
        pendingAttachments.push(attachment);
        const chip = renderPreviewChip(attachment);
        try {
          const text = await extractPDFText(e.target.result);
          attachment.textContent = text;
          const label = chip.querySelector(".preview-name");
          if (label) label.textContent = "✅ " + file.name;
        } catch (err) {
          attachment.textContent = `[Could not read PDF: ${err.message}]`;
        }
      };
      reader.readAsArrayBuffer(file);

    } else if (isText) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const attachment = { type: "file", name: file.name, dataURL: null, textContent: e.target.result };
        pendingAttachments.push(attachment);
        renderPreviewChip(attachment);
      };
      reader.readAsText(file);

    } else {
      const attachment = { type: "file", name: file.name, dataURL: null, textContent: null };
      pendingAttachments.push(attachment);
      renderPreviewChip(attachment);
    }
  }

  // ============================================================
  // EXTRACT PDF TEXT
  // ============================================================
  async function extractPDFText(arrayBuffer) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(" ");
      fullText += `\n--- Page ${i} ---\n${pageText}`;
    }
    return fullText.trim();
  }

  // ============================================================
  // LINK MODAL
  // ============================================================
  confirmLinkBtn.addEventListener("click", () => {
    const url = linkInput.value.trim();
    if (!url) return;
    try { new URL(url); } catch {
      linkInput.style.borderColor = "#e53e3e";
      return;
    }
    const attachment = { type: "link", name: url, url: url };
    pendingAttachments.push(attachment);
    renderPreviewChip(attachment);
    linkModal.classList.remove("open");
    linkInput.value = "";
  });

  cancelLinkBtn.addEventListener("click", () => linkModal.classList.remove("open"));
  linkModal.addEventListener("click", (e) => { if (e.target === linkModal) linkModal.classList.remove("open"); });
  linkInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmLinkBtn.click(); });

  // ============================================================
  // RENDER PREVIEW CHIP
  // ============================================================
  function renderPreviewChip(attachment) {
    const chip = document.createElement("div");
    chip.classList.add("preview-item");

    if (attachment.type === "image") {
      const img = document.createElement("img");
      img.src = attachment.dataURL;
      chip.appendChild(img);
    } else if (attachment.type === "video") {
      chip.innerHTML = `<span style="font-size:1.4rem">🎬</span>`;
    } else if (attachment.type === "file") {
      chip.innerHTML = `<span style="font-size:1.4rem">${getFileIcon(attachment.name)}</span>`;
    } else if (attachment.type === "link") {
      chip.innerHTML = `<span style="font-size:1.4rem">🔗</span>`;
    }

    const label = document.createElement("span");
    label.classList.add("preview-name");
    label.textContent = attachment.type === "link" ? shortenURL(attachment.url) : attachment.name;
    chip.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.classList.add("preview-remove");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      const idx = pendingAttachments.indexOf(attachment);
      if (idx > -1) pendingAttachments.splice(idx, 1);
      chip.remove();
    });
    chip.appendChild(removeBtn);
    attachmentPreview.appendChild(chip);
    return chip;
  }

  // ============================================================
  // MAIN SEND FUNCTION
  // ============================================================
  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && pendingAttachments.length === 0) return;

    const welcomeEl = document.getElementById("welcome");
    if (welcomeEl) welcomeEl.style.display = "none";

    const attachmentsToSend = [...pendingAttachments];
    pendingAttachments = [];
    attachmentPreview.innerHTML = "";

    appendUserMessage(text, attachmentsToSend);

    userInput.value = "";
    userInput.style.height = "auto";

    const messageContent = buildMessageContent(text, attachmentsToSend);

    sendBtn.disabled = true;
    const typingRow = showTypingIndicator();

    try {
      if (!currentChatId) {
        const res = await fetch(`${API_BASE}/chats`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ title: "New Chat" })
        });
        if (res.status === 401) { logout(); return; }
        const chat = await res.json();
        currentChatId = chat.id;
      }

      const res = await fetch(`${API_BASE}/chats/${currentChatId}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content: messageContent })
      });

      if (res.status === 401) { logout(); return; }

      const data = await res.json();
      typingRow.remove();

      if (data.error) {
        appendMessage("ai", "⚠️ Error: " + data.error);
      } else {
        appendMessage("ai", data.content);
      }

      await loadChatHistory();

    } catch (error) {
      typingRow.remove();
      appendMessage("ai", "⚠️ Error: " + error.message);
    }

    sendBtn.disabled = false;
    scrollToBottom();
  }

  // ============================================================
  // BUILD MESSAGE CONTENT
  // ============================================================
  function buildMessageContent(text, attachments) {
    if (attachments.length === 0) return text;

    const parts = attachments.map(a => {
      if (a.type === "image") return `[User attached an image: "${a.name}"]`;
      if (a.type === "video") return `[User attached a video: "${a.name}"]`;
      if (a.type === "link")  return `[User shared a link: ${a.url}]`;
      if (a.type === "file") {
        if (a.textContent && a.textContent !== "⏳ Reading PDF…") {
          const preview = a.textContent.length > 12000
            ? a.textContent.substring(0, 12000) + "\n\n[... file truncated ...]"
            : a.textContent;
          return `[File: "${a.name}"]\n\`\`\`\n${preview}\n\`\`\``;
        }
        return `[User attached a file: "${a.name}" — binary format, cannot be read]`;
      }
      return "";
    });

    const attachmentText = parts.join("\n\n");
    return text ? `${attachmentText}\n\n${text}` : attachmentText;
  }

  // ============================================================
  // LOAD A CHAT FROM SIDEBAR
  // ============================================================
  async function loadChat(chatId) {
    currentChatId = chatId;
    messagesDiv.innerHTML = "";

    document.querySelectorAll(".history-item").forEach(i => i.classList.remove("active"));
    const activeItem = document.querySelector(`.history-item[data-id="${chatId}"]`);
    if (activeItem) activeItem.classList.add("active");

    try {
      const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, { headers: authHeaders() });
      if (res.status === 401) { logout(); return; }
      const messages = await res.json();

      if (messages.length === 0) {
        showWelcome();
        return;
      }

      messages.forEach(msg => {
        appendMessage(msg.role === "user" ? "user" : "ai", msg.content);
      });

      scrollToBottom();
    } catch (err) {
      appendMessage("ai", "⚠️ Failed to load chat: " + err.message);
    }
  }

  // ============================================================
  // ADD CHAT TO SIDEBAR
  // ============================================================
  function addChatToSidebar(chat) {
    const item = document.createElement("div");
    item.classList.add("history-item");
    item.dataset.id = chat.id;
    item.textContent = "💬 " + (chat.title.length > 30 ? chat.title.substring(0, 30) + "…" : chat.title);
    item.title = chat.title;

    if (chat.id === currentChatId) item.classList.add("active");

    item.addEventListener("click", () => loadChat(chat.id));

    historyList.appendChild(item);
  }

  // ============================================================
  // APPEND USER MESSAGE BUBBLE
  // ============================================================
  function appendUserMessage(text, attachments) {
    const row = document.createElement("div");
    row.classList.add("message-row", "user");

    const avatar = document.createElement("div");
    avatar.classList.add("avatar");
    avatar.textContent = "You";

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");

    attachments.forEach(a => {
      if (a.type === "image") {
        const img = document.createElement("img");
        img.src = a.dataURL;
        img.classList.add("bubble-image");
        bubble.appendChild(img);
      } else if (a.type === "video") {
        const video = document.createElement("video");
        video.src = a.dataURL;
        video.classList.add("bubble-video");
        video.controls = true;
        bubble.appendChild(video);
      } else if (a.type === "file") {
        const chip = document.createElement("div");
        chip.classList.add("bubble-file");
        chip.innerHTML = `<span class="file-icon">${getFileIcon(a.name)}</span> ${a.name}`;
        bubble.appendChild(chip);
      } else if (a.type === "link") {
        const link = document.createElement("a");
        link.href = a.url;
        link.target = "_blank";
        link.classList.add("bubble-link");
        link.innerHTML = `🔗 ${a.url}`;
        bubble.appendChild(link);
      }
    });

    if (text) {
      const textNode = document.createTextNode(text);
      bubble.appendChild(textNode);
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    messagesDiv.appendChild(row);
    scrollToBottom();
  }

  // ============================================================
  // APPEND MESSAGE BUBBLE
  // ============================================================
  function appendMessage(role, text) {
    const row = document.createElement("div");
    row.classList.add("message-row", role === "user" ? "user" : "ai");

    const avatar = document.createElement("div");
    avatar.classList.add("avatar");
    avatar.textContent = role === "user" ? "You" : "✦";

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    bubble.textContent = text;

    row.appendChild(avatar);
    row.appendChild(bubble);
    messagesDiv.appendChild(row);
    scrollToBottom();
  }

  // ============================================================
  // TYPING INDICATOR
  // ============================================================
  function showTypingIndicator() {
    const row = document.createElement("div");
    row.classList.add("message-row", "ai");
    const avatar = document.createElement("div");
    avatar.classList.add("avatar");
    avatar.textContent = "✦";
    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    const dots = document.createElement("div");
    dots.classList.add("typing-indicator");
    dots.innerHTML = "<span></span><span></span><span></span>";
    bubble.appendChild(dots);
    row.appendChild(avatar);
    row.appendChild(bubble);
    messagesDiv.appendChild(row);
    scrollToBottom();
    return row;
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function scrollToBottom() { messagesDiv.scrollTop = messagesDiv.scrollHeight; }

  function showWelcome() {
    const welcome = document.createElement("div");
    welcome.classList.add("welcome");
    welcome.id = "welcome";
    welcome.innerHTML = `
      <div class="welcome-logo">✦</div>
      <h1>How can I help you today?</h1>
      <p>Ask me anything — I'm MyGPT, your personal AI assistant.</p>
    `;
    messagesDiv.appendChild(welcome);
  }

  function getFileIcon(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const icons = { pdf:"📄", doc:"📝", docx:"📝", txt:"📃", csv:"📊", xls:"📊", xlsx:"📊", ppt:"📑", pptx:"📑" };
    return icons[ext] || "📁";
  }

  function shortenURL(url) {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname !== "/" ? u.pathname.substring(0, 20) + "…" : "");
    } catch { return url.substring(0, 30) + "…"; }
  }

})();
