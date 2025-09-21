(function(){
  const socket = io();
  socket.on("connect", ()=> socket.emit("join-admin-room"));

  const $badge = document.getElementById("qaNotifyBadge");
  const $sound = document.getElementById("qaSound");
  function incBadge(){
    const cur = Number($badge.textContent||"0")+1;
    $badge.textContent = String(cur);
    $badge.classList.remove("d-none");
  }
  function play(){ try{$sound.currentTime=0;$sound.play().catch(()=>{});}catch{} }

  socket.on("notify:qa_new_question", ()=>{ incBadge(); play(); });

  const $list = document.getElementById("qaListAdmin");
  const $search = document.getElementById("qaSearch");
  const $btnSearch = document.getElementById("qaBtnSearch");

  let status = "all";
  document.querySelectorAll('[data-filter]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      status = btn.getAttribute('data-filter') || 'all';
      load();
    });
  });

  $btnSearch.addEventListener('click', load);
  $search.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); load(); }});

  function escapeHtml(str){return (str||'').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}

  function itemHtml(q){
    return `
      <div class="border rounded-3 p-3 mb-3" data-qid="${q.id}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="small">
            <span class="me-2"><i class="fa-solid fa-box-open me-1"></i>${escapeHtml(q.product.name)}</span>
            <span class="me-2"><i class="fa-solid fa-user me-1"></i>${escapeHtml(q.user.name)}</span>
            <span class="me-2 text-muted"><i class="fa-regular fa-clock me-1"></i>${new Date(q.createdAt).toLocaleString('vi-VN')}</span>
          </div>
          <span class="status-badge ${q.replied?'status-answered':'status-unanswered'}">${q.replied?'Đã trả lời':'Chưa trả lời'}</span>
        </div>
        <div class="mb-2">${escapeHtml(q.content)}</div>
        ${
          q.replied
          ? `<div class="ps-3 border-start">
               <div class="small text-muted mb-1">Admin · ${new Date(q.reply.createdAt).toLocaleString('vi-VN')}</div>
               <div>${escapeHtml(q.reply.content)}</div>
             </div>`
          : `<button class="btn btn-sm btn-primary qa-reply">Trả lời</button>`
        }
      </div>
    `;
  }

  async function load(){
    const params = new URLSearchParams();
    params.set('status', status);
    const s = $search.value.trim();
    if (s) params.set('search', s);

    const r = await fetch(`/admin/api/qa/questions?${params.toString()}`);
    const data = await r.json();
    $list.innerHTML = data.map(itemHtml).join('');
  }

  load();

  // modal trả lời
  const modalEl = document.getElementById('qaReplyModal');
  const modal = new bootstrap.Modal(modalEl);
  const $form = document.getElementById('qaReplyForm');
  const $qId = document.getElementById('qaReplyQuestionId');
  const $qText = document.getElementById('qaReplyQuestionText');
  const $qContent = document.getElementById('qaReplyContent');

  // mở modal
  $list.addEventListener('click', (e)=>{
    const btn = e.target.closest('.qa-reply');
    if(!btn) return;
    const wrap = btn.closest('[data-qid]');
    const qid = wrap?.dataset?.qid;
    $qId.value = qid || '';
    $qText.textContent = wrap.querySelector('.mb-2')?.textContent || '';
    $qContent.value = '';
    modal.show();
  });

  // submit trả lời (không reload)
  let busy = false;
  $form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(busy) return; busy = true;
    const id = Number($qId.value);
    const content = $qContent.value.trim();
    if(!id || !content){ busy=false; return; }

    const btn = $form.querySelector('button[type="submit"]');
    btn?.setAttribute('disabled','true');
    try{
      const r = await fetch(`/admin/api/qa/questions/${id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ content })
      });
      if(r.status===409){
        alert('Câu hỏi đã được trả lời.');
      } else if(!r.ok){
        const j = await r.json().catch(()=>({}));
        alert(j.error || 'Trả lời thất bại');
      } else {
        modal.hide();
        load();
      }
    } finally {
      btn?.removeAttribute('disabled');
      busy = false;
    }
  });
})();
