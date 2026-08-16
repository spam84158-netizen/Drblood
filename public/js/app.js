// ==================== State ====================
let currentConversationId = null;
let isGenerating = false;
let abortController = null;
// Mode actif pour la PROCHAINE conversation à créer. Une fois une conversation
// créée, son mode est figé côté serveur (voir server/routes/conversations.js)
// et ne peut plus être changé depuis le frontend.
let currentMode = "vd1";

// ==================== DOM refs ====================
const $messages = document.getElementById("messages");
const $emptyState = document.getElementById("emptyState");
const $input = document.getElementById("messageInput");
const $sendBtn = document.getElementById("sendBtn");
const $stopBtn = document.getElementById("stopBtn");
const $conversationList = document.getElementById("conversationList");
const $conversationTitle = document.getElementById("conversationTitle");
const $newChatBtn = document.getElementById("newChatBtn");
const $sidebar = document.getElementById("sidebar");
const $sidebarOverlay = document.getElementById("sidebarOverlay");
const $openSidebarBtn = document.getElementById("openSidebarBtn");
const $closeSidebarBtn = document.getElementById("closeSidebarBtn");
const $filePreviewOverlay = document.getElementById("filePreviewOverlay");
const $filePreviewName = document.getElementById("filePreviewName");
const $filePreviewBody = document.getElementById("filePreviewBody");
const $filePreviewDownload = document.getElementById("filePreviewDownload");
const $filePreviewClose = document.getElementById("filePreviewClose");
const $modeVD1Btn = document.getElementById("modeVD1Btn");
const $modeVD2Btn = document.getElementById("modeVD2Btn");
const $modeHint = document.getElementById("modeHint");
marked.setOptions({
  breaks: true,
  highlight: null, // on gère la coloration nous-mêmes après rendu (voir renderMarkdown)
});

// Le thème (clair/sombre) est géré globalement par nav.js, partagé entre toutes les pages.

// ==================== Sidebar (mobile) ====================
$openSidebarBtn.addEventListener("click", () => {
  $sidebar.classList.add("open");
  $sidebarOverlay.classList.add("open");
});
function closeSidebar() {
  $sidebar.classList.remove("open");
  $sidebarOverlay.classList.remove("open");
}
$closeSidebarBtn.addEventListener("click", closeSidebar);
$sidebarOverlay.addEventListener("click", closeSidebar);

// ==================== Textarea auto-resize + Enter to send ====================
$input.addEventListener("input", () => {
  $input.style.height = "auto";
  $input.style.height = Math.min($input.scrollHeight, 200) + "px";
});
$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
$sendBtn.addEventListener("click", sendMessage);
$stopBtn.addEventListener("click", stopGeneration);
$newChatBtn.addEventListener("click", createNewConversation);

// ==================== API helpers ====================
// Attache le token Firebase de l'utilisateur connecté à chaque appel API,
// pour que le backend sache à qui appartiennent les conversations.
async function authHeaders(extra = {}) {
  const token = await window.firebaseAuth.getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function apiGet(url) {
  const res = await fetch(url, { headers: await authHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || "Erreur API");
  return res.json();
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Erreur API");
  return res.json();
}
async function apiPatch(url, body) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Erreur API");
  return res.json();
}
async function apiDelete(url) {
  const res = await fetch(url, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || "Erreur API");
  return res.json();
}

// ==================== Conversations list ====================
async function loadConversations() {
  try {
    const conversations = await apiGet("/api/conversations");
    renderConversationList(conversations);
    return conversations;
  } catch (err) {
    console.error(err);
    return [];
  }
}

function renderConversationList(conversations) {
  $conversationList.innerHTML = "";
  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = "conversation-item" + (conv.id === currentConversationId ? " active" : "");
    item.dataset.id = conv.id;

    if (conv.mode === "vd2") {
      const badge = document.createElement("span");
      badge.className = "conv-mode-badge";
      badge.textContent = "VD2";
      item.appendChild(badge);
    }

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = conv.title;
    item.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "actions";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✎";
    renameBtn.title = "Renommer";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameConversation(conv.id, conv.title);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Supprimer";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    item.addEventListener("click", () => openConversation(conv.id));
    $conversationList.appendChild(item);
  });
}

async function renameConversation(id, oldTitle) {
  const newTitle = prompt("Renommer la conversation :", oldTitle);
  if (!newTitle || newTitle.trim() === "" || newTitle === oldTitle) return;
  try {
    await apiPatch(`/api/conversations/${id}`, { title: newTitle.trim() });
    if (id === currentConversationId) $conversationTitle.textContent = newTitle.trim();
    loadConversations();
  } catch (err) {
    alert("Impossible de renommer : " + err.message);
  }
}

async function deleteConversation(id) {
  if (!confirm("Supprimer définitivement cette conversation ?")) return;
  try {
    await apiDelete(`/api/conversations/${id}`);
    if (id === currentConversationId) {
      currentConversationId = null;
      showEmptyState();
      $conversationTitle.textContent = "Nouvelle conversation";
    }
    loadConversations();
  } catch (err) {
    alert("Impossible de supprimer : " + err.message);
  }
}

async function createNewConversation() {
  currentConversationId = null;
  $conversationTitle.textContent = "Nouvelle conversation";
  showEmptyState();
  document.querySelectorAll(".conversation-item").forEach((el) => el.classList.remove("active"));
  closeSidebar();
  $input.focus();
}

// ==================== Mode VD1 / VD2 ====================
const MODE_INFO = {
  vd1: {
    hint: "Assistant généraliste — pose n'importe quelle question.",
    placeholder: "Écris ton message... (Entrée pour envoyer, Shift+Entrée pour un saut de ligne)",
  },
  vd2: {
    hint: "Générateur de signalements WhatsApp — indique le numéro puis la cause.",
    placeholder: "Numéro WhatsApp ou cause du signalement...",
  },
};

function applyModeUI(mode) {
  currentMode = mode;
  $modeVD1Btn.classList.toggle("active", mode === "vd1");
  $modeVD2Btn.classList.toggle("active", mode === "vd2");
  $modeHint.textContent = MODE_INFO[mode].hint;
  $input.placeholder = MODE_INFO[mode].placeholder;
}

function selectMode(mode) {
  if (mode === currentMode && !currentConversationId) return;
  // Changer de mode démarre toujours une nouvelle conversation : un fil de
  // discussion reste entièrement VD1 ou entièrement VD2, jamais mixte.
  applyModeUI(mode);
  createNewConversation();
}

$modeVD1Btn.addEventListener("click", () => selectMode("vd1"));
$modeVD2Btn.addEventListener("click", () => selectMode("vd2"));

async function openConversation(id) {
  try {
    const conv = await apiGet(`/api/conversations/${id}`);
    currentConversationId = id;
    $conversationTitle.textContent = conv.title;
    applyModeUI(conv.mode === "vd2" ? "vd2" : "vd1");
    renderMessages(conv.messages);
    document.querySelectorAll(".conversation-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === id);
    });
    closeSidebar();
  } catch (err) {
    alert("Impossible d'ouvrir la conversation : " + err.message);
  }
}

// ==================== Messages rendering ====================
function showEmptyState() {
  $messages.innerHTML = "";
  $messages.appendChild($emptyState);
}

function renderMessages(messages) {
  $messages.innerHTML = "";
  if (!messages || messages.length === 0) {
    showEmptyState();
    return;
  }
  messages.forEach((m) => addMessageBubble(m.role, m.content, m.files));
  scrollToBottom();
}

function renderMarkdown(text) {
  const html = marked.parse(text || "");
  const container = document.createElement("div");
  container.innerHTML = html;

  // Ajoute la coloration syntaxique + bouton copier sur chaque bloc de code
  container.querySelectorAll("pre code").forEach((block) => {
    hljs.highlightElement(block);
    const pre = block.parentElement;
    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-code-btn";
    copyBtn.textContent = "Copier";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(block.textContent);
      copyBtn.textContent = "Copié !";
      setTimeout(() => (copyBtn.textContent = "Copier"), 1500);
    });
    wrapper.appendChild(copyBtn);
  });

  return container.innerHTML;
}

function addMessageBubble(role, content, filesBatches) {
  if ($messages.contains($emptyState)) $messages.innerHTML = "";

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === "user" ? "T" : "IA";

  const contentEl = document.createElement("div");
  contentEl.className = "message-content";

  if (role === "assistant") {
    contentEl.innerHTML = renderMarkdown(content);
  } else {
    contentEl.textContent = content;
  }

  row.appendChild(avatar);

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = role === "user" ? "flex-end" : "flex-start";
  wrap.style.width = "100%";
  wrap.appendChild(contentEl);

  if (role === "assistant" && Array.isArray(filesBatches)) {
    filesBatches.forEach((batch) => renderFileCards(wrap, batch));
  }

  if (role === "assistant" && content) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const copyBtn = document.createElement("button");
    copyBtn.innerHTML = "📋 Copier";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(content);
      copyBtn.innerHTML = "✓ Copié";
      setTimeout(() => (copyBtn.innerHTML = "📋 Copier"), 1500);
    });
    actions.appendChild(copyBtn);
    wrap.appendChild(actions);
  }

  row.appendChild(wrap);
  $messages.appendChild(row);
  return { row, contentEl, wrap };
}

function scrollToBottom() {
  $messages.scrollTop = $messages.scrollHeight;
}

// ==================== Fichiers générés par l'IA (cartes + aperçu) ====================
function fileIconLabel(filename) {
  const ext = (filename.split(".").pop() || "").slice(0, 3).toUpperCase();
  return ext || "DOC";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// payload: { files: [{batchId, filename, size, previewable}], archive: {batchId, filename, size} | null }
function renderFileCards(container, payload) {
  const wrap = document.createElement("div");
  wrap.className = "file-cards";

  if (payload.archive) {
    wrap.appendChild(
      buildFileCard(payload.archive.batchId, payload.archive.filename, payload.archive.size, false, true)
    );
  }
  (payload.files || []).forEach((f) => {
    wrap.appendChild(buildFileCard(f.batchId, f.filename, f.size, f.previewable, false));
  });

  container.appendChild(wrap);
}

function buildFileCard(batchId, filename, size, previewable, isArchive) {
  const card = document.createElement("div");
  card.className = "file-card" + (isArchive ? " is-archive" : "");

  const icon = document.createElement("div");
  icon.className = "file-card-icon";
  icon.textContent = fileIconLabel(filename);

  const info = document.createElement("div");
  info.className = "file-card-info";
  const name = document.createElement("div");
  name.className = "file-card-name";
  name.textContent = filename;
  const size_ = document.createElement("div");
  size_.className = "file-card-size";
  size_.textContent = formatFileSize(size);
  info.appendChild(name);
  info.appendChild(size_);

  const buttons = document.createElement("div");
  buttons.className = "file-card-buttons";

  if (previewable) {
    const previewBtn = document.createElement("button");
    previewBtn.textContent = "Aperçu";
    previewBtn.addEventListener("click", () => openFilePreview(batchId, filename));
    buttons.appendChild(previewBtn);
  }

  const downloadLink = document.createElement("a");
  downloadLink.href = `/api/files/${batchId}/${encodeURIComponent(filename)}/download`;
  downloadLink.textContent = "Télécharger";
  downloadLink.setAttribute("download", filename);
  buttons.appendChild(downloadLink);

  card.appendChild(icon);
  card.appendChild(info);
  card.appendChild(buttons);
  return card;
}

async function openFilePreview(batchId, filename) {
  $filePreviewName.textContent = filename;
  $filePreviewDownload.href = `/api/files/${batchId}/${encodeURIComponent(filename)}/download`;
  $filePreviewDownload.setAttribute("download", filename);
  $filePreviewBody.innerHTML = `<div class="typing-indicator" style="padding:24px;"><span></span><span></span><span></span></div>`;
  $filePreviewOverlay.classList.remove("hidden");

  try {
    const res = await fetch(`/api/files/${batchId}/${encodeURIComponent(filename)}/preview`, {
      headers: await authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Aperçu indisponible.");
    const { content } = await res.json();
    renderPreviewContent(filename, content);
  } catch (err) {
    $filePreviewBody.innerHTML = `<div class="error-bubble" style="margin:16px;">⚠️ ${err.message}</div>`;
  }
}

function renderPreviewContent(filename, content) {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (ext === "html" || ext === "htm") {
    const iframe = document.createElement("iframe");
    iframe.sandbox = "allow-scripts";
    iframe.srcdoc = content;
    $filePreviewBody.innerHTML = "";
    $filePreviewBody.appendChild(iframe);
    return;
  }

  if (ext === "md" || ext === "markdown") {
    const div = document.createElement("div");
    div.className = "md-preview";
    div.innerHTML = marked.parse(content);
    $filePreviewBody.innerHTML = "";
    $filePreviewBody.appendChild(div);
    return;
  }

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = content;
  pre.appendChild(code);
  $filePreviewBody.innerHTML = "";
  $filePreviewBody.appendChild(pre);
  try {
    hljs.highlightElement(code);
  } catch (_) {
    // langage non détecté, on garde le texte brut
  }
}

function closeFilePreview() {
  $filePreviewOverlay.classList.add("hidden");
  $filePreviewBody.innerHTML = "";
}
$filePreviewClose.addEventListener("click", closeFilePreview);
$filePreviewOverlay.addEventListener("click", (e) => {
  if (e.target === $filePreviewOverlay) closeFilePreview();
});

// ==================== Sending messages (SSE streaming) ====================
async function sendMessage() {
  const text = $input.value.trim();
  if (!text || isGenerating) return;

  // Crée une conversation si besoin (première question)
  if (!currentConversationId) {
    try {
      const conv = await apiPost("/api/conversations", {
        title: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
        mode: currentMode,
      });
      currentConversationId = conv.id;
      $conversationTitle.textContent = conv.title;
      loadConversations();
    } catch (err) {
      alert("Impossible de créer la conversation : " + err.message);
      return;
    }
  }

  $input.value = "";
  $input.style.height = "auto";
  addMessageBubble("user", text);
  scrollToBottom();

  setGenerating(true);

  // Bulle assistant avec indicateur de frappe
  const { contentEl, wrap } = addMessageBubble("assistant", "");
  contentEl.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  scrollToBottom();

  abortController = new AbortController();
  let fullText = "";
  let firstChunk = true;
  let wasInterrupted = false;
  let filesReceived = false;

  try {
    const res = await fetch(`/api/chat/${currentConversationId}`, {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: text }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Erreur serveur");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop(); // garde le fragment incomplet pour le prochain tour

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6);
        let payload;
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (payload.error) {
          contentEl.innerHTML = `<div class="error-bubble">⚠️ ${payload.error}</div>`;
          setGenerating(false);
          return;
        }

        if (payload.delta) {
          if (firstChunk) {
            contentEl.innerHTML = "";
            firstChunk = false;
          }
          fullText += payload.delta;
          contentEl.innerHTML = renderMarkdown(fullText);
          scrollToBottom();
        }

        if (payload.files) {
          if (firstChunk) {
            contentEl.innerHTML = "";
            firstChunk = false;
          }
          renderFileCards(wrap, payload.files);
          filesReceived = true;
          scrollToBottom();
        }

        if (payload.done) {
          finalizeAssistantMessage(contentEl, fullText, false, filesReceived);
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      wasInterrupted = true;
      finalizeAssistantMessage(contentEl, fullText, true);
    } else {
      contentEl.innerHTML = `<div class="error-bubble">⚠️ ${err.message}</div>`;
    }
  } finally {
    setGenerating(false);
    if (!wasInterrupted) loadConversations();
  }
}

function finalizeAssistantMessage(contentEl, text, interrupted = false, hasFiles = false) {
  contentEl.innerHTML = text ? renderMarkdown(text) : hasFiles ? "" : renderMarkdown("*(réponse vide)*");
  if (interrupted) {
    const note = document.createElement("div");
    note.className = "interrupted-note";
    note.textContent = "⏹ Génération interrompue par l'utilisateur.";
    contentEl.parentElement.appendChild(note);
  }
}

function stopGeneration() {
  if (abortController) abortController.abort();
}

function setGenerating(state) {
  isGenerating = state;
  $sendBtn.classList.toggle("hidden", state);
  $stopBtn.classList.toggle("hidden", !state);
  $sendBtn.disabled = state;
}

// ==================== Init ====================
// On attend que Firebase confirme l'utilisateur connecté avant le premier appel API
// (sinon la requête part sans token et échoue avec une erreur d'authentification).
document.addEventListener(
  "auth:ready",
  () => {
    applyModeUI("vd1");
    loadConversations();
    $input.focus();
  },
  { once: true }
);
