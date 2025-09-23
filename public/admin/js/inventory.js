(function () {
  const $body   = document.getElementById('invBody');
  const $search = document.getElementById('invSearch');
  const $filter = document.getElementById('invFilter');
  const $reload = document.getElementById('invReload');

  // Modal điều chỉnh
  const adjustEl = document.getElementById('invAdjustModal');
  const adjustModal = new bootstrap.Modal(adjustEl);
  const $form = document.getElementById('invAdjustForm');
  const $pid  = document.getElementById('invProductId');
  const $pname= document.getElementById('invProductName');
  const $type = document.getElementById('invType');
  const $qty  = document.getElementById('invQty');
  const $note = document.getElementById('invNote');

  // Modal Sửa ngưỡng
  const reorderEl = document.getElementById('invReorderModal');
  const reorderModal = new bootstrap.Modal(reorderEl);
  const $rePid   = document.getElementById('reProductId');
  const $reName  = document.getElementById('reProductName');
  const $reLevel = document.getElementById('reLevel');
  const $reForm  = document.getElementById('reorderForm');

  // Toast mini
  function toast(title, body, tone) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999';
    wrap.innerHTML = `
      <div style="min-width:280px;max-width:360px;background:#0b1222cc;border:1px solid rgba(255,255,255,.12);
                  color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 10px 24px rgba(0,0,0,.35)">
        <div style="font-weight:700;margin-bottom:4px">${title}</div>
        <div style="opacity:.9">${body}</div>
      </div>`;
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 4200);
  }

  function statusBadge(s) {
    if (s === 'OOS') return '<span class="badge bg-danger">Hết</span>';
    if (s === 'LOW') return '<span class="badge bg-warning text-dark">Thấp</span>';
    return '<span class="badge bg-success">OK</span>';
  }

  function rowHtml(r) {
    return `
      <tr data-id="${r.id}" data-name="${r.name}" data-reorder="${r.reorderLevel}">
        <td>${r.id}</td>
        <td>${r.name}</td>
        <td class="text-end">${r.onHand}</td>
        <td class="text-end">${r.available}</td>
        <td class="text-end">
          <span class="me-1">${r.reorderLevel}</span>
          <button class="btn btn-sm btn-link inv-set-reorder">Sửa</button>
        </td>
        <td>${statusBadge(r.status)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary inv-adjust-in">Nhập</button>
          <button class="btn btn-sm btn-outline-danger  inv-adjust-out">Xuất</button>
        </td>
      </tr>
    `;
  }

  async function load() {
    const params = new URLSearchParams();
    const s = ($search.value || '').trim();
    if (s) params.set('search', s);
    params.set('filter', $filter.value || 'all');

    try {
      const r = await fetch(`/admin/api/inventory?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();

      if (!Array.isArray(data) || data.length === 0) {
        $body.innerHTML = `
          <tr><td colspan="7" class="text-center text-muted py-4">Không có sản phẩm nào.</td></tr>`;
        return;
      }

      $body.innerHTML = data.map(rowHtml).join('');
    } catch (err) {
      console.error('Load inventory error:', err);
      $body.innerHTML = `
        <tr><td colspan="7" class="text-center text-danger py-4">
          Không tải được dữ liệu tồn kho.
        </td></tr>`;
    }
  }

  $reload.addEventListener('click', load);
  $filter.addEventListener('change', load);
  $search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(); } });

  // Delegation: Nhập / Xuất / Sửa ngưỡng
  document.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;

    const id   = Number(tr.dataset.id);
    const name = tr.dataset.name || `#${id}`;
    const reorder = Number(tr.dataset.reorder || '0');

    if (e.target.closest('.inv-adjust-in')) {
      $pid.value = String(id);
      $pname.textContent = name;
      $type.value = 'IN';
      $qty.value = '';
      $note.value = '';
      adjustModal.show();
      return;
    }

    if (e.target.closest('.inv-adjust-out')) {
      $pid.value = String(id);
      $pname.textContent = name;
      $type.value = 'OUT';
      $qty.value = '';
      $note.value = '';
      adjustModal.show();
      return;
    }

    if (e.target.closest('.inv-set-reorder')) {
      $rePid.value = String(id);
      $reName.textContent = name;
      $reLevel.value = isFinite(reorder) ? String(reorder) : '5';
      reorderModal.show();
      return;
    }
  });

  // Submit điều chỉnh
  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      productId: Number($pid.value),
      type: $type.value,
      qty: Number($qty.value),
      note: $note.value || ''
    };
    if (!Number.isFinite(payload.qty) || !payload.qty) {
      toast('Lỗi', 'Số lượng không hợp lệ.', 'error');
      return;
    }

    const r = await fetch('/admin/api/inventory/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) {
      toast('Điều chỉnh thất bại', j.error || 'Không thể điều chỉnh.', 'error');
      return;
    }
    adjustModal.hide();
    toast('Thành công', 'Đã cập nhật tồn kho.', 'ok');
    load();
  });

  // Submit sửa ngưỡng
  $reForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = Number($rePid.value);
    const level = Math.max(0, Number($reLevel.value) || 0);

    const r = await fetch('/admin/api/inventory/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: pid, level })
    });
    const j = await r.json().catch(()=> ({}));

    if (!r.ok) {
      reorderModal.hide();
      toast('Không cập nhật được', j.error || 'Cần migrate DB để có cột reorderLevel.', 'warn');
      return;
    }
    reorderModal.hide();
    toast('Đã cập nhật', `Ngưỡng cảnh báo mới: ${level}`, 'ok');
    load();
  });

  // Socket inventory warnings
  const socket = window.__adminSocket || (window.__adminSocket = io());
  socket.on('connect', () => socket.emit('join-admin-room'));
  socket.on('inventory:low', (p) => {
    toast(p.status === 'OOS' ? 'Hết hàng!' : 'Tồn thấp!',
      `#${p.productId} ${p.name}: còn ${p.quantity} (ngưỡng ${p.reorderLevel}).`);
  });
  socket.on('inventory:low_stock', (p) => { // tương thích tên cũ
    toast(p.quantity <= 0 ? 'Hết hàng!' : 'Tồn thấp!',
      `#${p.productId} ${p.name}: còn ${p.onHand ?? p.quantity}.`);
  });

  // first load
  load();
})();
