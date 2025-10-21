// Chatbot miễn phí: chạy trực tiếp trên trình duyệt bằng WebLLM (không key, không gọi server)
import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const $ = (id) => document.getElementById(id);
const ui = {
  btn: $("aiTurtleBtn"),
  card: $("aiTurtleCard"),
  close: $("aiTurtleClose"),
  body: $("aiChatBody"),
  form: $("aiForm"),
  input: $("aiInput"),
  send: $("aiSend"),
  typing: $("aiTyping"),
  suggest: document.querySelector(".ai-suggest"),
};

const SYSTEM_PROMPT = `
Bạn là "Rùa AI" – trợ lý tư vấn laptop cho cửa hàng LaptopShop-VH.
- Hỏi lại khi thiếu thông tin: ngân sách (VND), nhu cầu (văn phòng/gaming/đồ hoạ/di chuyển), kích cỡ màn, cân nặng/pin.
- Đề xuất 2–3 lựa chọn, nêu ưu/nhược và khoảng giá tham khảo (không bịa thông số chi tiết khi không có).
- Trả lời tiếng Việt, gọn, lịch sự, có bullet khi cần.
`;

let engine = null;
let busy = false;
const messages = [{ role: "system", content: SYSTEM_PROMPT }];

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
}
function safeText(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br>");
}
function append(role, text) {
  const row = document.createElement("div");
  row.className = "ai-msg " + (role === "user" ? "ai-user" : "ai-bot");
  const b = document.createElement("div");
  b.className = "ai-msg__bubble";
  b.innerHTML = role === "assistant" ? safeText(text) : escapeHtml(text);
  row.appendChild(b);
  ui.body.appendChild(row);
  ui.body.scrollTop = ui.body.scrollHeight;
}

async function ensureEngine() {
  if (engine) return engine;
  if (!("gpu" in navigator)) {
    append("assistant","Thiết bị này chưa hỗ trợ WebGPU. Vui lòng dùng Chrome/Edge mới để dùng chatbot miễn phí.");
    throw new Error("No WebGPU");
  }
  append("assistant","Đang tải mô hình lần đầu (~vài trăm MB)…");
  engine = await CreateMLCEngine({
    model: "Qwen2.5-3B-Instruct-q4f16_1-MLC", // nhẹ & nhanh; có thể đổi Llama-3-8B… (nặng hơn)
    initProgressCallback: (p) => {
      const last = ui.body.querySelector(".ai-msg.ai-bot:last-child .ai-msg__bubble");
      if (last && p) last.textContent = `Đang tải mô hình… ${Math.round((p.progress || 0) * 100)}%`;
    }
  });
  const last = ui.body.querySelector(".ai-msg.ai-bot:last-child .ai-msg__bubble");
  if (last) last.textContent = "Mình đã sẵn sàng. Bạn cần tư vấn như thế nào?";
  return engine;
}

async function ask(text) {
  if (!text || busy) return;
  append("user", text);
  ui.typing.style.display = "block"; ui.send.disabled = true; ui.input.disabled = true; busy = true;
  try {
    const e = await ensureEngine();
    messages.push({ role: "user", content: text });

    const out = await e.chat.completions.create({
      messages,
      temperature: 0.6,
      max_tokens: 420
    });
    const reply = out?.choices?.[0]?.message?.content || "Xin lỗi, mình chưa trả lời được.";
    messages.push({ role: "assistant", content: reply });
    append("assistant", reply);
  } catch (err) {
    console.error(err);
    append("assistant","Có lỗi khi xử lý trên trình duyệt. Bạn thử lại giúp mình nhé.");
  } finally {
    ui.typing.style.display = "none"; ui.send.disabled = false; ui.input.disabled = false; busy = false;
    ui.input.focus();
  }
}

/* ====== UI wiring ====== */
if (ui.btn && ui.card && ui.form) {
  ui.btn.addEventListener("click", () => { ui.card.style.display = "block"; setTimeout(()=>ui.input?.focus(), 100); });
  ui.close.addEventListener("click", () => { ui.card.style.display = "none"; });
  ui.form.addEventListener("submit", (e) => { e.preventDefault(); const v = (ui.input.value || "").trim(); if (!v) return; ui.input.value=""; ask(v); });
  ui.input.addEventListener("keydown", (e)=>{ if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); ui.form.dispatchEvent(new Event("submit",{cancelable:true})); }});
  // chips trong card
  ui.suggest?.querySelectorAll(".ai-chip").forEach(ch => ch.addEventListener("click", () => { ui.input.value = ch.getAttribute("data-q") || ""; ui.input.focus(); }));
  // chips ngoài trang (ví dụ các .chip ở “Buying guide”)
  document.querySelectorAll(".chip[data-q]").forEach(ch => ch.addEventListener("click", () => {
    ui.card.style.display = "block";
    const q = ch.getAttribute("data-q") || "";
    ui.input.value = q; setTimeout(()=>ui.input.focus(), 60);
  }));
}
// Lời chào mặc định
append("assistant","Chào bạn! Rùa AI có thể gợi ý laptop theo ngân sách, nhu cầu (gaming/đồ họa/văn phòng), cân nặng, pin… Hãy hỏi mình nhé.");
