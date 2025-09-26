// /admin/js/chat.js
(function () {
  // Dùng lại 1 socket duy nhất cho toàn trang admin
  const socket     = window.__adminSocket || (window.__adminSocket = io());

  // ===== DOM =====
  const $sessions  = document.getElementById("sessions");
  const $panel     = document.getElementById("panel");
  const $roomMsgs  = document.getElementById("roomMsgs");
  const $form      = document.getElementById("adminForm");
  const $input     = document.getElementById("adminInput");
  const $typing    = document.getElementById("typingHintAdmin");
  const $btnClose  = document.getElementById("closeSession");

  // Badge (có thể là #adminChatBadgeHeader hoặc phần tử mang data-admin-badge="chat")
  const $badges = Array.from(
    document.querySelectorAll('[data-admin-badge="chat"], #adminChatBadge, #adminChatBadgeHeader')
  );

  // ===== STATE =====
  let currentSessionId = null;
  let sessionClosed    = false;
  let typingTimer      = null;

  // ===== Utils =====
  function moneyBadgeInc() {
    $badges.forEach(b => {
      const cur = Math.max(0, parseInt(b.textContent || "0", 10)) + 1;
      b.textContent = String(cur);
      b.classList.remove("d-none");
    });
  }
  function moneyBadgeZero() {
    $badges.forEach(b => { b.textContent = "0"; b.classList.add("d-none"); });
  }

  function renderMsg(who, text, isRead = false) {
    const wrap = document.createElement("div");
    wrap.className = `d-flex ${who === "ADMIN" ? "justify-content-end" : "justify-content-start"} mb-2`;

    const status = who === "ADMIN"
      ? `<span class="ms-2 small ${isRead ? "text-primary" : "text-muted"}">${isRead ? "✓✓" : "✓"}</span>`
      : "";

    wrap.innerHTML =
      `<div class="p-2 rounded ${who === "ADMIN" ? "bg-primary text-white" : "bg-light"}" style="max-width:80%">
         ${text}${status}
       </div>`;

    $roomMsgs.appendChild(wrap);
    $roomMsgs.scrollTop = $roomMsgs.scrollHeight;
  }

  function setClosedUI(closed) {
    sessionClosed = !!closed;
    if ($input)  $input.disabled = sessionClosed;
    const btn = $form?.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = sessionClosed;
      btn.classList.toggle('btn-primary', !closed);
      btn.classList.toggle('btn-secondary', closed);
    }
    if ($typing) {
      $typing.classList.remove('d-none');
      $typing.textContent = closed
        ? 'Phiên đã kết thúc — không thể gửi tin.'
        : 'Khách đang nhập…';
      if (!closed) $typing.classList.add('d-none'); // ẩn mặc định khi OPEN
    }
  }

  async function loadSessions() {
    const res = await fetch("/admin/api/chat/sessions");
    const sessions = await res.json();
    // Nút mỗi phiên: data-id giữ sessionId, hiện badge unread
    $sessions.innerHTML = sessions.map(s =>
      `<button data-id="${s.id}" class="btn btn-outline-secondary me-2 mb-2">
         #${s.id} - ${s.name}
         ${s.unread > 0 ? `<span class="badge bg-danger ms-2">${s.unread}</span>` : ""}
       </button>`
    ).join("");
  }

  async function openSession(sessionId) {
    currentSessionId = Number(sessionId);
    if (!Number.isFinite(currentSessionId)) return;

    $panel.classList.remove("d-none");
    $roomMsgs.innerHTML = "";
    setClosedUI(false); // tạm mở, chờ server báo trạng thái thật

    // Join phòng + nhận status (OPEN/CLOSED)
    socket.emit("admin:join", { sessionId: currentSessionId });

    // Tải lịch sử
    const res = await fetch(`/api/chat/sessions/${currentSessionId}/messages`);
    const list = await res.json();
    list.forEach(m => renderMsg(m.sender, m.content, !!m.isRead));

    // Đọc tất cả tin nhắn user chưa đọc
    socket.emit("chat:read", { sessionId: currentSessionId, readerRole: "ADMIN" });

    // Đã mở 1 phiên => có thể coi là đã xử lý các badge tổng
    moneyBadgeZero();
  }

  // ===== Socket bindings =====
  socket.on("connect", () => {
    console.log("[admin] connected:", socket.id);
    socket.emit("join-admin-room");
  });

  // Server trả trạng thái phòng sau khi join / hoặc khi có thay đổi
  socket.on("chat:status", ({ sessionId, status }) => {
    if (Number(sessionId) !== Number(currentSessionId)) return;
    setClosedUI(status === "CLOSED");
  });

  // Nhận tin nhắn trong phòng hiện tại
  socket.on("chat:message", (msg) => {
    // msg: { id, sessionId, sender, content, isRead, createdAt }
    if (Number(msg.sessionId) !== Number(currentSessionId)) return;
    if (msg.sender === "USER") {
      renderMsg("USER", msg.content);
      // admin đã thấy => mark read
      socket.emit("chat:read", { sessionId: currentSessionId, readerRole: "ADMIN" });
    }
  });

  // Khi user đang gõ
  socket.on("chat:typing", ({ who, isTyping }) => {
    if (who !== "USER") return;
    if (!$typing) return;
    $typing.textContent = 'Khách đang nhập…';
    $typing.classList.toggle("d-none", !isTyping || sessionClosed);
  });

  // Khi server đóng phiên
  socket.on("chat:closed", ({ sessionId }) => {
    if (Number(sessionId) !== Number(currentSessionId)) return;
    setClosedUI(true);
    renderMsg("USER", "Phiên chat đã kết thúc.", true);
  });

  // Có session mới
  socket.on("admin:new_session", () => loadSessions());

  // Có tin mới từ user (notify trên danh sách phiên)
  socket.on("notify:chat_message", async ({ sessionId }) => {
    if (currentSessionId && Number(sessionId) === Number(currentSessionId)) {
      // Đang mở đúng phiên -> refresh nhẹ + mark read
      const res = await fetch(`/api/chat/sessions/${currentSessionId}/messages`);
      const list = await res.json();
      $roomMsgs.innerHTML = "";
      list.forEach(m => renderMsg(m.sender, m.content, !!m.isRead));
      socket.emit("chat:read", { sessionId: currentSessionId, readerRole: "ADMIN" });
    } else {
      // Tin cho phiên khác
      moneyBadgeInc();
      await loadSessions();
    }
  });

  // ===== UI events =====
  // Click 1 phiên ở danh sách
  $sessions.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    openSession(btn.dataset.id);
  });

  // Gửi tin
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentSessionId || sessionClosed) return;
    const content = ($input.value || "").trim();
    if (!content) return;

    socket.emit("chat:message", {
      sessionId: currentSessionId,
      sender: "ADMIN",
      content
    });

    renderMsg("ADMIN", content, false);
    $input.value = "";
  });

  // Typing indicator cho admin
  $input.addEventListener("input", () => {
    if (!currentSessionId || sessionClosed) return;
    socket.emit("chat:typing", { sessionId: currentSessionId, who: "ADMIN", isTyping: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socket.emit("chat:typing", { sessionId: currentSessionId, who: "ADMIN", isTyping: false });
    }, 800);
  });

  // Kết thúc phiên (ĐÚNG event server: "chat:close")
  $btnClose?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!currentSessionId) return;
    socket.emit("chat:close", { sessionId: currentSessionId });
    // UI sẽ khóa khi nhận 'chat:closed'
  });

  // ===== init =====
  (async function init() {
    await loadSessions();
    // Panel ẩn cho tới khi chọn 1 phiên
    $panel.classList.add("d-none");
  })();
})();
