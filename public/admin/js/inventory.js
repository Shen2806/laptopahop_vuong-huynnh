(function () {
  // ===== 1) Danh sách hãng (theo bạn cung cấp) =====
  const factoryOptions = [
    { value: "APPLE",     name: "Apple (MacBook)" },
    { value: "ASUS",      name: "Asus" },
    { value: "LENOVO",    name: "Lenovo" },
    { value: "DELL",      name: "Dell" },
    { value: "LG",        name: "LG" },
    { value: "ACER",      name: "Acer" },
    { value: "HP",        name: "HP" },
    { value: "MSI",       name: "MSI" },
    { value: "GIGABYTE",  name: "Gigabyte" },
    { value: "ALIENWARE", name: "Alienware" },
  ];

  // ===== 2) DOM gốc =====
  const $body   = document.getElementById('invBody');
  const $search = document.getElementById('invSearch');
  const $filter = document.getElementById('invFilter');
  const $reload = document.getElementById('invReload');

  // ===== 3) Tạo control "Hãng" (không cần sửa EJS) =====
  function ensureFactoryControl() {
    const toolbar = $reload ? $reload.parentElement : null;
    let $factory = document.getElementById('invFactory'); // nếu có sẵn thì dùng

    if (!$factory && toolbar) {
      $factory = document.createElement('select');
      $factory.id = 'invFactory';
      $factory.className = 'form-select';
      $factory.style.width = '200px';

      // build options từ factoryOptions
      const opts = ['<option value="all">Tất cả hãng</option>'].concat(
        factoryOptions.map(o => `<option value="${o.value}">${o.name}</option>`)
      );
      $factory.innerHTML = opts.join('');

      // chèn trước invFilter
      toolbar.insertBefore($factory, $filter || $reload);
    }
    return $factory;
  }
  const $factory = ensureFactoryControl();

  // ===== 4) Modal điều chỉnh =====
  const adjustEl = document.getElementById('invAdjustModal');
  const adjustModal = new bootstrap.Modal(adjustEl);
  const $form = document.getElementById('invAdjustForm');
  const $pid  = document.getElementById('invProductId');
  const $pname= document.getElementById('invProductName');
  const $type = document.getElementById('invType');
  const $qty  = document.getElementById('invQty');
  const $note = document.getElementById('invNote');

  // ===== 5) Modal sửa ngưỡng =====
  const reorderEl = document.getElementById('invReorderModal');
  const reorderModal = new bootstrap.Modal(reorderEl);
  const $rePid   = document.getElementById('reProductId');
  const $reName  = document.getElementById('reProductName');
  const $reLevel = document.getElementById('reLevel');
  const $reForm  = document.getElementById('reorderForm');

  // ===== 6) State =====
  const state = {
    data: [],
    search: '',
    filter:  ($filter?.value  || 'all'), // all | oos | low
    factory: ($factory?.value || 'all')  // all | APPLE | ASUS | ...
  };

  // ===== 7) Toast mini =====
  function toast(title, body) {
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
// ==== Thêm ngay dưới statusBadge ====
function deriveStatus(r) {
  const onHand  = Number(r.onHand ?? 0);
  const avail   = Number(r.available ?? onHand);
  const reorder = Number(r.reorderLevel ?? 0);
  if (onHand <= 0 || avail <= 0) return 'OOS';
  if (onHand > 0 && onHand <= reorder) return 'LOW';
  return 'OK';
}

  // ===== 8) Map/Detect brand trên từng record =====
  // Ưu tiên code (APPLE/ASUS/...), fallback đoán theo tên sản phẩm nếu thiếu field.
  const brandKeywords = {
    APPLE:     ['apple','macbook'],
    ASUS:      ['asus'],
    LENOVO:    ['lenovo'],
    DELL:      ['dell'],
    LG:        ['lg'],
    ACER:      ['acer'],
    HP:        ['hp','hewlett packard'],
    MSI:       ['msi'],
    GIGABYTE:  ['gigabyte'],
    ALIENWARE: ['alienware']
  };

  function getFactoryCode(r) {
    // các field có thể có trong API của bạn:
    let code =
      (r?.factory) || (r?.brandCode) || (r?.brand?.code) || (r?.manufacturer?.code) ||
      (typeof r?.brand === 'string' ? r.brand : null);

    if (code) {
      code = String(code).toUpperCase().trim();
      if (factoryOptions.some(o => o.value === code)) return code;
    }

    // đoán theo tên sản phẩm
    const name = String(r?.name || '').toLowerCase();
    for (const [k, arr] of Object.entries(brandKeywords)) {
      if (arr.some(word => name.includes(word))) return k;
    }
    return null; // không xác định
  }

  function getFactoryNameByCode(code) {
    const f = factoryOptions.find(o => o.value === code);
    return f ? f.name : 'Khác';
  }

  // ===== 9) Tạo 1 dòng HTML =====
 // ==== Trong rowHtml(r), thay phần onHand/available và status ====
function rowHtml(r) {
  const factoryCode = getFactoryCode(r);
  const factoryName = factoryCode ? getFactoryNameByCode(factoryCode) : 'Khác';
  const onHand = Number(r.onHand ?? 0);
  const available = Number(r.available ?? onHand);
  const computedStatus = r.status || deriveStatus(r);

  const nameCell = `
    <div class="fw-semibold">${r.name}</div>
    <div class="small text-muted">Hãng: ${factoryName}</div>
  `;

  const onHandCell = onHand <= 0
    ? `<span class="text-danger fw-semibold">0 — Hết hàng</span>`
    : onHand;

  const availCell = available <= 0
    ? `<span class="text-danger">0</span>`
    : available;

  return `
    <tr data-id="${r.id}" data-name="${r.name}" data-reorder="${r.reorderLevel || 0}" data-factory="${factoryCode || ''}">
      <td>${r.id}</td>
      <td>${nameCell}</td>
      <td class="text-end">${onHandCell}</td>
      <td class="text-end">${availCell}</td>
      <td class="text-end">
        <span class="me-1">${r.reorderLevel}</span>
        <button class="btn btn-sm btn-link inv-set-reorder">Sửa</button>
      </td>
      <td>${statusBadge(computedStatus)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary inv-adjust-in">Nhập</button>
        <button class="btn btn-sm btn-outline-danger  inv-adjust-out">Xuất</button>
      </td>
    </tr>
  `;
}


  // ===== 10) Render + lọc =====
  function applyAndRender() {
    let items = [...state.data];

    // search
    if (state.search) {
      const k = state.search;
      items = items.filter(r => (r.name || '').toLowerCase().includes(k) || String(r.id||'').includes(k));
    }

    // filter tồn
    items = items.filter(r => {
      const onHand = Number(r.onHand ?? 0);
      const reorder = Number(r.reorderLevel ?? 0);
      if (state.filter === 'oos') return onHand <= 0 || r.status === 'OOS';
      if (state.filter === 'low') return (onHand > 0 && onHand <= reorder) || r.status === 'LOW';
      return true;
    });

    // filter Hãng
    if (state.factory !== 'all') {
      items = items.filter(r => getFactoryCode(r) === state.factory);
    }

    // render
    if (!items.length) {
      $body.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Không có sản phẩm nào.</td></tr>`;
      return;
    }
    $body.innerHTML = items.map(rowHtml).join('');
  }

  // ===== 11) Load dữ liệu từ server (giữ nguyên endpoint cũ) =====
  async function load() {
    const params = new URLSearchParams();
    const s = ($search?.value || '').trim();
    if (s) params.set('search', s);
    params.set('filter', $filter?.value || 'all');

    // Nếu server của bạn đã hỗ trợ lọc hãng, bạn có thể bật dòng dưới:
    // if ($factory && $factory.value !== 'all') params.set('factory', $factory.value);

    try {
      const r = await fetch(`/admin/api/inventory?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const arr = Array.isArray(data) ? data : (data.items || []);
      state.data = arr.map(r => ({ ...r, status: r.status || deriveStatus(r) }));
applyAndRender();
    } catch (e) {
      console.error('Load inventory error:', e);
      $body.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Không tải được dữ liệu tồn kho.</td></tr>`;
    }
  }

  // ===== 12) Sự kiện thanh công cụ =====
  $reload?.addEventListener('click', load);
  $filter?.addEventListener('change', e => { state.filter  = e.target.value;  applyAndRender(); });
  $factory?.addEventListener('change', e => { state.factory = e.target.value; applyAndRender(); });
  $search?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); state.search = ($search.value||'').trim().toLowerCase(); applyAndRender(); }
  });
  $search?.addEventListener('input', e => { state.search = (e.target.value||'').trim().toLowerCase(); });

  // ===== 13) Delegation: nhập/xuất/sửa ngưỡng =====
  document.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;

    const id   = Number(tr.dataset.id);
    const name = tr.dataset.name || `#${id}`;
    const reorder = Number(tr.dataset.reorder || '0');

    if (e.target.closest('.inv-adjust-in')) {
      $pid.value = String(id); $pname.textContent = name; $type.value = 'IN';
      $qty.value = ''; $note.value = ''; adjustModal.show(); return;
    }
    if (e.target.closest('.inv-adjust-out')) {
      $pid.value = String(id); $pname.textContent = name; $type.value = 'OUT';
      $qty.value = ''; $note.value = ''; adjustModal.show(); return;
    }
    if (e.target.closest('.inv-set-reorder')) {
      $rePid.value = String(id); $reName.textContent = name;
      $reLevel.value = isFinite(reorder) ? String(reorder) : '5';
      reorderModal.show(); return;
    }
  });

  // ===== 14) Submit điều chỉnh =====
  const $formEl = document.getElementById('invAdjustForm');
  $formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      productId: Number($pid.value),
      type: $type.value,
      qty: Number($qty.value),
      note: $note.value || ''
    };
    if (!Number.isFinite(payload.qty) || !payload.qty) { toast('Lỗi', 'Số lượng không hợp lệ.'); return; }

    const r = await fetch('/admin/api/inventory/adjust', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) { toast('Điều chỉnh thất bại', j.error || 'Không thể điều chỉnh.'); return; }
    adjustModal.hide(); toast('Thành công', 'Đã cập nhật tồn kho.'); load();
  });

  // ===== 15) Submit sửa ngưỡng =====
  const $reFormEl = document.getElementById('reorderForm');
  $reFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = Number($rePid.value);
    const level = Math.max(0, Number($reLevel.value) || 0);
    const r = await fetch('/admin/api/inventory/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: pid, level })
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) { reorderModal.hide(); toast('Không cập nhật được', j.error || 'Cần migrate DB có cột reorderLevel.'); return; }
    reorderModal.hide(); toast('Đã cập nhật', `Ngưỡng cảnh báo mới: ${level}`); load();
  });

  // ===== 16) Socket cảnh báo =====
  const socket = window.__adminSocket || (window.__adminSocket = io());
  socket.on('connect', () => socket.emit('join-admin-room'));
  socket.on('inventory:low', (p) => {
    toast(p.status === 'OOS' ? 'Hết hàng!' : 'Tồn thấp!', `#${p.productId} ${p.name}: còn ${p.quantity} (ngưỡng ${p.reorderLevel}).`);
  });
  socket.on('inventory:low_stock', (p) => {
    toast((p.onHand ?? p.quantity) <= 0 ? 'Hết hàng!' : 'Tồn thấp!', `#${p.productId} ${p.name}: còn ${p.onHand ?? p.quantity}.`);
  });

  // ===== 17) First load =====
  load();
})();
