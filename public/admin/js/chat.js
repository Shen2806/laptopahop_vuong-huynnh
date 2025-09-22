(async function(){
  const socket = io();
  const $sessions = document.getElementById("sessions");
  const $panel = document.getElementById("panel");
  const $roomMsgs = document.getElementById("roomMsgs");
  const $adminForm = document.getElementById("adminForm");
  const $adminInput = document.getElementById("adminInput");
  const $typing = document.getElementById("typingHintAdmin");
  const $badge = document.getElementById("adminChatBadge");

  let currentSessionId = null;
  let closed = false;

  function renderMsg(who, text, isRead=false) {
    const div = document.createElement("div");
    div.className = `d-flex ${who==="ADMIN"?"justify-content-end":"justify-content-start"} mb-2`;
    const status = who==="ADMIN" ? `<span class="ms-2 small ${isRead?"text-primary":"text-muted"}">${isRead?"✓✓":"✓"}</span>` : "";
    div.innerHTML = `<div class="p-2 rounded ${who==="ADMIN"?"bg-primary text-white":"bg-light"}" style="max-width:80%">${text}${status}</div>`;
    $roomMsgs.appendChild(div);
    $roomMsgs.scrollTop = $roomMsgs.scrollHeight;
  }

  function decBadge() {
    if (!$badge) return;
    const cur = Math.max(0, Number($badge.textContent||"0")-1);
    if (cur===0){ $badge.classList.add("d-none"); $badge.textContent="0"; }
    else { $badge.textContent = String(cur); }
  }

  function setClosedUI() {
    if (closed) return;
    closed = true;
    $adminInput.disabled = true;
    $adminForm.querySelector('button').disabled = true;
    renderMsg("USER", "Phiên chat đã kết thúc.", true);
  }

  socket.on("connect", ()=>{
    console.log("[admin] connected:", socket.id);
    socket.emit("join-admin-room");
  });

  async function loadSessions() {
    const res = await fetch("/admin/api/chat/sessions");
    const sessions = await res.json();
    $sessions.innerHTML = sessions.map(s =>
      `<button data-id="${s.id}" class="btn btn-outline-secondary me-2 mb-2">
        #${s.id} - ${s.name}
        ${s.unread>0?`<span class="badge bg-danger ms-2">${s.unread}</span>`:""}
      </button>`).join("");
  }
  await loadSessions();

  // Chọn session
  $sessions.addEventListener("click", async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;

    currentSessionId = Number(btn.dataset.id);
    closed = false; // reset
    $adminInput.disabled = false;
    $adminForm.querySelector('button').disabled = false;

    $panel.classList.remove("d-none");
    $roomMsgs.innerHTML = "";

    console.log("[admin] join session", currentSessionId);
    socket.emit("admin:join", { sessionId: currentSessionId });

    const res = await fetch(`/api/chat/sessions/${currentSessionId}/messages`);
    const list = await res.json();
    list.forEach(m => renderMsg(m.sender, m.content, !!m.isRead));

    socket.emit("chat:read", { sessionId: currentSessionId, readerRole: "ADMIN" });
    decBadge();
  });

  // Gửi tin
  $adminForm.addEventListener("submit", (e)=>{
    e.preventDefault();
    if (closed) return;
    const content = $adminInput.value.trim(); if (!content) return;
    console.log("[admin] send", { sessionId: currentSessionId, content });
    socket.emit("chat:message", { sessionId: currentSessionId, sender: "ADMIN", content });
    renderMsg("ADMIN", content, false);
    $adminInput.value = "";
  });

  // Typing
  let t;
  $adminInput.addEventListener("input", ()=>{
    if (!currentSessionId || closed) return;
    socket.emit("chat:typing", { sessionId: currentSessionId, who: "ADMIN", isTyping: true });
    clearTimeout(t);
    t = setTimeout(()=> socket.emit("chat:typing", { sessionId: currentSessionId, who: "ADMIN", isTyping: false }), 800);
  });

  // Nhận tin trong phòng hiện tại
  socket.on("chat:message", (msg)=>{
    console.log("[admin] chat:message in", msg);
    if (Number(msg.sessionId) !== Number(currentSessionId)) return;
    if (msg.sender === "USER") {
      renderMsg("USER", msg.content);
      socket.emit("chat:read", { sessionId: currentSessionId, readerRole: "ADMIN" });
    }
  });

  // Fallback: có notify từ user → nếu đúng phòng thì tải lại lịch sử
  socket.on("notify:chat_message", async ({ sessionId }) => {
    console.log("[admin] notify:chat_message", sessionId, "current=", currentSessionId);
    if (currentSessionId && Number(sessionId) === Number(currentSessionId)) {
      const res = await fetch(`/api/chat/sessions/${currentSessionId}/messages`);
      const list = await res.json();
      $roomMsgs.innerHTML = "";
      list.forEach(m => renderMsg(m.sender, m.content, !!m.isRead));
      socket.emit("chat:read", { sessionId: currentSessionId, readerRole: "ADMIN" });
    } else {
      await loadSessions();
    }
  });

  // Typing hiển thị
  socket.on("chat:typing", ({ who, isTyping }) => {
    if (who === "USER") $typing.classList.toggle("d-none", !isTyping);
  });

  // Trạng thái phiên
  socket.on("chat:status", ({ sessionId: sid, status }) => {
    console.log("[admin] chat:status", sid, status);
    if (Number(sid)!==Number(currentSessionId)) return;
    if (status === "CLOSED") setClosedUI();
  });

  socket.on("chat:closed", () => {
    console.log("[admin] chat:closed");
    setClosedUI();
  });

  socket.on("admin:new_session", () => loadSessions());

})();


(function(){
  const socket   = window.__adminSocket || (window.__adminSocket = io());
  const $badge   = document.getElementById('adminChatBadgeHeader');
  const $panel   = document.getElementById('panel');
  const $sessions= document.getElementById('sessions');
  const $form    = document.getElementById('adminForm');
  const $input   = document.getElementById('adminInput');
  const $hint    = document.getElementById('typingHintAdmin');
  const $close   = document.getElementById('closeSession');

  let currentSessionId = null;
  let clearBadgeOnNextOpen = false;
  let sessionClosed = false;

  function clearAllBadges(){
    document.querySelectorAll('[data-admin-badge="chat"]').forEach(el=>{
      el.textContent = '0';
      el.classList.add('d-none');
    });
  }
  function setClosedUI(closed){
    sessionClosed = !!closed;
    if ($input) $input.disabled = sessionClosed;
    const btn = $form?.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = sessionClosed; btn.classList.toggle('btn-primary', !closed); btn.classList.toggle('btn-secondary', closed); }
    if ($hint) { $hint.classList.remove('d-none'); $hint.textContent = closed ? 'Phiên đã kết thúc — không thể gửi tin.' : 'Khách đang nhập…'; }
  }

  // Click badge => bật panel, chờ clear khi chọn 1 phiên
  $badge?.addEventListener('click', ()=>{
    clearBadgeOnNextOpen = true;
    $panel?.classList.remove('d-none');
    document.getElementById('sessions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Chọn 1 phiên (item phải có data-conv-id = sessionId)
  $sessions?.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-conv-id]');
    if (!btn) return;
    const sessionId = Number(btn.dataset.convId);
    if (!Number.isFinite(sessionId)) return;

    currentSessionId = sessionId;
    socket.emit('session:join', { sessionId }, ()=>{});
    socket.emit('message:read', { sessionId }, ()=>{});
    if (clearBadgeOnNextOpen) { clearAllBadges(); clearBadgeOnNextOpen = false; }
    setClosedUI(false);
  });

  // Đóng phiên
  $close?.addEventListener('click', (e)=>{
    e.preventDefault();
    if (!currentSessionId) return;
    socket.emit('session:close', { sessionId: currentSessionId }, (res)=>{
      if (res?.ok) setClosedUI(true);
    });
  });

  // Cấm gửi khi đóng
  $form?.addEventListener('submit', (e)=>{
    if (sessionClosed) { e.preventDefault(); return false; }
  });

  // Server báo phiên đã đóng
  socket.off('session:closed');
  socket.on('session:closed', ({ sessionId })=>{
    if (currentSessionId && sessionId === currentSessionId) setClosedUI(true);
  });

  // Nếu đang mở phiên và có tin mới trong chính phiên đó -> mark read luôn
  socket.off('message:new');
  socket.on('message:new', (msg)=>{
    if (currentSessionId && msg.sessionId === currentSessionId) {
      socket.emit('message:read', { sessionId: currentSessionId }, ()=>{});
    }
  });
})();
