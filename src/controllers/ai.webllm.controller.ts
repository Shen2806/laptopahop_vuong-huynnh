import { Request, Response } from "express";

/** CSS cho widget (text/css) */
export function webllmCss(_req: Request, res: Response) {
    res.type("text/css").send(`
/* ===== Rùa AI - styles gọn, không đụng Bootstrap ===== */
.ai-turtle__btn{
  position:fixed; right:18px; bottom:18px; width:56px; height:56px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; background:#2e7d32; color:#fff; border:0;
  box-shadow:0 10px 25px rgba(0,0,0,.18); cursor:pointer; z-index:99998
}
.ai-pulse{position:absolute; inset:-6px; border-radius:inherit; border:2px solid #2e7d32; opacity:.6;
  animation:aiPulse 1.7s infinite}
@keyframes aiPulse{0%{transform:scale(.9); opacity:.7} 70%{transform:scale(1.15); opacity:0} 100%{opacity:0}}

.ai-turtle__card{
  position:fixed; right:18px; bottom:86px; width:360px; max-width:92vw; height:520px; display:none; flex-direction:column;
  background:#fff; border:1px solid #eaeaea; border-radius:14px; overflow:hidden; z-index:99999;
  box-shadow:0 18px 40px rgba(0,0,0,.18)
}
.ai-chat__header{display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:12px 14px; border-bottom:1px solid #eee; background:#f9f9f9}
.ai-chat__title{font-weight:700}
.ai-chat__close{border:0; background:transparent; cursor:pointer}

.ai-chat__body{flex:1; overflow:auto; padding:12px; font-size:14px}
.ai-msg{margin:8px 0; display:flex}
.ai-msg__bubble{padding:8px 10px; border-radius:12px; max-width:90%; line-height:1.45}
.ai-user .ai-msg__bubble{margin-left:auto; background:#eef5ff; border:1px solid #d6e6ff}
.ai-bot .ai-msg__bubble{background:#f5f5f5; border:1px solid #eee}
.ai-typing{display:none; color:#666; font-style:italic; margin:8px 2px}

.ai-input{display:flex; gap:8px; padding:8px; border-top:1px solid #eee; background:#fafafa}
.ai-input input{flex:1; padding:10px; border:1px solid #ddd; border-radius:10px}
.ai-input button{padding:10px 14px; border-radius:10px; border:1px solid #2e7d32; background:#2e7d32; color:#fff; font-weight:600}

/* Chips gợi ý */
.ai-suggest{display:flex; flex-wrap:wrap; gap:8px; padding:8px 12px; border-top:1px dashed #eee}
.ai-chip{border:1px solid #ddd; background:#fff; border-radius:999px; padding:6px 10px; font-size:12px; cursor:pointer}

/* Cards sản phẩm (tuỳ chọn) */
.ai-products{display:grid; gap:10px; grid-template-columns:repeat(2,minmax(0,1fr))}
.ai-pcard{display:block; text-decoration:none; color:inherit; border:1px solid #eee; border-radius:10px; overflow:hidden}
.ai-pimg{width:100%; height:110px; object-fit:cover; background:#fafafa}
.ai-pbody{padding:8px}
.ai-ptitle{font-weight:600; font-size:13px; line-height:1.35; margin-bottom:4px}
.ai-pdesc{font-size:12px; color:#666; height:32px; overflow:hidden}
.ai-price-row{display:flex; gap:6px; align-items:baseline; margin:4px 0}
.ai-sale{font-weight:700; color:#d32f2f}
.ai-base{font-size:12px; text-decoration:line-through; color:#888}
.ai-badge{font-size:11px; background:#d32f2f; color:#fff; border-radius:6px; padding:1px 6px}
.ai-pbtn{margin-top:6px; font-size:12px; color:#2e7d32; font-weight:600}
  `);
}

/** JS cho widget (ESM, text/javascript) */
export function webllmJs(_req: Request, res: Response) {
    res.type("application/javascript").send(`
// Chatbot miễn phí chạy ngay trên trình duyệt bằng WebLLM (không key)
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

const SYSTEM_PROMPT = \`
Bạn là "Rùa AI" – trợ lý tư vấn laptop cho cửa hàng LaptopShop-VH.
- Hỏi lại khi thiếu thông tin: ngân sách (VND), nhu cầu (văn phòng/gaming/đồ hoạ/di chuyển), kích cỡ màn, cân nặng/pin.
- Đề xuất 2–3 lựa chọn, nêu ưu/nhược và khoảng giá tham khảo (không bịa thông số chi tiết khi không có).
- Trả lời tiếng Việt, gọn, lịch sự, có bullet khi cần.
\`;

let engine = null;
let busy = false;
const messages = [{ role: "system", content: SYSTEM_PROMPT }];

function escapeHtml(s){return String(s).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]))}
function safeText(s){return escapeHtml(s).replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>").replace(/\\n/g,"<br>")}
function append(role,text){
  const row=document.createElement("div");
  row.className="ai-msg "+(role==="user"?"ai-user":"ai-bot");
  const b=document.createElement("div");
  b.className="ai-msg__bubble";
  b.innerHTML=role==="assistant"?safeText(text):escapeHtml(text);
  row.appendChild(b); ui.body.appendChild(row); ui.body.scrollTop=ui.body.scrollHeight;
}

async function ensureEngine(){
  if(engine) return engine;
  if(!("gpu" in navigator)){
    append("assistant","Thiết bị này chưa hỗ trợ WebGPU. Vui lòng dùng Chrome/Edge mới để dùng chatbot miễn phí.");
    throw new Error("No WebGPU");
  }
  append("assistant","Đang tải mô hình lần đầu (~vài trăm MB)…");
  engine = await CreateMLCEngine({
    model:"Qwen2.5-3B-Instruct-q4f16_1-MLC",
    initProgressCallback:(p)=>{const last=ui.body.querySelector(".ai-msg.ai-bot:last-child .ai-msg__bubble"); if(last&&p){last.textContent="Đang tải mô hình… "+Math.round((p.progress||0)*100)+"%";}}
  });
  const last=ui.body.querySelector(".ai-msg.ai-bot:last-child .ai-msg__bubble");
  if(last) last.textContent="Mình đã sẵn sàng. Bạn cần tư vấn như thế nào?";
  return engine;
}

async function ask(text){
  if(!text||busy) return;
  append("user",text);
  ui.typing.style.display="block"; ui.send.disabled=true; ui.input.disabled=true; busy=true;
  try{
    const e=await ensureEngine();
    messages.push({role:"user",content:text});
    const out=await e.chat.completions.create({messages,temperature:0.6,max_tokens:420});
    const reply=out?.choices?.[0]?.message?.content || "Xin lỗi, mình chưa trả lời được.";
    messages.push({role:"assistant",content:reply});
    append("assistant",reply);
  }catch(err){
    console.error(err);
    append("assistant","Có lỗi khi xử lý trên trình duyệt. Bạn thử lại giúp mình nhé.");
  }finally{
    ui.typing.style.display="none"; ui.send.disabled=false; ui.input.disabled=false; busy=false; ui.input.focus();
  }
}

/* ===== UI wiring ===== */
if (ui.btn && ui.card && ui.form) {
  ui.btn.addEventListener("click", ()=>{ ui.card.style.display="block"; setTimeout(()=>ui.input?.focus(),100); });
  ui.close.addEventListener("click", ()=>{ ui.card.style.display="none"; });
  ui.form.addEventListener("submit",(e)=>{ e.preventDefault(); const v=(ui.input.value||"").trim(); if(!v) return; ui.input.value=""; ask(v); });
  ui.input.addEventListener("keydown",(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); ui.form.dispatchEvent(new Event("submit",{cancelable:true})); }});
  ui.suggest?.querySelectorAll(".ai-chip").forEach(ch=> ch.addEventListener("click",()=>{ ui.input.value=ch.getAttribute("data-q")||""; ui.input.focus(); }));
  document.querySelectorAll(".chip[data-q]").forEach(ch=> ch.addEventListener("click",()=>{ ui.card.style.display="block"; const q=ch.getAttribute("data-q")||""; ui.input.value=q; setTimeout(()=>ui.input.focus(),60); }));
}
append("assistant","Chào bạn! Rùa AI có thể gợi ý laptop theo ngân sách, nhu cầu (gaming/đồ họa/văn phòng), cân nặng, pin… Hãy hỏi mình nhé.");
  `);
}
