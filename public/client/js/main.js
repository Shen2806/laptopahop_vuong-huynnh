(function ($) {
  "use strict";

  // Spinner
  const spinner = function () {
    setTimeout(function () {
      if ($('#spinner').length > 0) {
        $('#spinner').removeClass('show');
      }
    }, 1);
  };
  spinner();

  // Fixed Navbar
  $(window).scroll(function () {
    if ($(window).width() < 992) {
      if ($(this).scrollTop() > 55) {
        $('.fixed-top').addClass('shadow');
      } else {
        $('.fixed-top').removeClass('shadow');
      }
    } else {
      if ($(this).scrollTop() > 55) {
        $('.fixed-top').addClass('shadow').css('top', 0);
      } else {
        $('.fixed-top').removeClass('shadow').css('top', 0);
      }
    }
  });

  // Back to top button
  $(window).scroll(function () {
    if ($(this).scrollTop() > 300) {
      $('.back-to-top').fadeIn('slow');
    } else {
      $('.back-to-top').fadeOut('slow');
    }
  });
  $('.back-to-top').click(function () {
    $('html, body').animate({ scrollTop: 0 }, 1500, 'easeInOutExpo');
    return false;
  });

  // Testimonial carousel
  $(".testimonial-carousel").owlCarousel({
    autoplay: true,
    smartSpeed: 2000,
    center: false,
    dots: true,
    loop: true,
    margin: 25,
    nav: true,
    navText: [
      '<i class="bi bi-arrow-left"></i>',
      '<i class="bi bi-arrow-right"></i>'
    ],
    responsiveClass: true,
    responsive: {
      0: { items: 1 },
      576: { items: 1 },
      768: { items: 1 },
      992: { items: 2 },
      1200: { items: 2 }
    }
  });

  // vegetable carousel
  $(".vegetable-carousel").owlCarousel({
    autoplay: true,
    smartSpeed: 1500,
    center: false,
    dots: true,
    loop: true,
    margin: 25,
    nav: true,
    navText: [
      '<i class="bi bi-arrow-left"></i>',
      '<i class="bi bi-arrow-right"></i>'
    ],
    responsiveClass: true,
    responsive: {
      0: { items: 1 },
      576: { items: 1 },
      768: { items: 2 },
      992: { items: 3 },
      1200: { items: 4 }
    }
  });

  // Modal Video
  $(document).ready(function () {
    let $videoSrc;
    $('.btn-play').click(function () {
      $videoSrc = $(this).data("src");
    });

    $('#videoModal').on('shown.bs.modal', function () {
      $("#video").attr(
        'src',
        $videoSrc + "?autoplay=1&amp;modestbranding=1&amp;showinfo=0"
      );
    });

    $('#videoModal').on('hide.bs.modal', function () {
      $("#video").attr('src', $videoSrc);
    });
  });

  // Quantity
  $('.quantity button').on('click', function () {
    let change = 0;

    const button = $(this);
    const oldValue = button.parent().parent().find('input').val();
    let newVal = parseFloat(oldValue);

    if (button.hasClass('btn-plus')) {
      newVal = parseFloat(oldValue) + 1;
      change = 1;
    } else {
      if (oldValue > 1) {
        newVal = parseFloat(oldValue) - 1;
        change = -1;
      } else {
        newVal = 1;
      }
    }

    const input = button.parent().parent().find('input');

    // === Clamp theo tồn kho (toast, không alert) ===
    (function clampByStock () {
      const stock = Number(
        input.attr('data-stock') ||
        input.attr('data-cart-detail-stock') ||
        $('#quantityDetail').attr('data-stock') || NaN
      );
      if (Number.isFinite(stock) && newVal > stock) {
        newVal = stock;
        change = 0; // không cộng dồn tổng vì đã chạm trần
        if (typeof toastErr === 'function') {
          toastErr(`Số lượng vượt quá tồn kho. Chỉ còn ${stock} sản phẩm.`);
        }
      }
    })();

    input.val(newVal);

    // set form index
    const index = input.attr("data-cart-detail-index");
    const el = document.getElementById(`cartDetails[${index}]`);
    $(el).val(newVal);

    // set quantity for detail page
    const elDetail = document.getElementById(`quantityDetail`);
    if (elDetail) {
      $(elDetail).val(newVal);
    }

    // get price
    const price = input.attr("data-cart-detail-price");
    const id = input.attr("data-cart-detail-id");

    const priceElement = $(`p[data-cart-detail-id='${id}']`);
    if (priceElement) {
      const newPrice = +price * newVal;
      priceElement.text(formatCurrency(newPrice));
    }

    // update total cart price
    const totalPriceElement = $(`p[data-cart-total-price]`);

    if (totalPriceElement && totalPriceElement.length) {
      const currentTotal = totalPriceElement.first().attr("data-cart-total-price");
      let newTotal = +currentTotal;

      if (change !== 0) {
        newTotal = change * (+price) + (+currentTotal);
      }

      // reset change
      change = 0;

      // update
      totalPriceElement.each(function (idx, element) {
        $(totalPriceElement[idx]).text(formatCurrency(newTotal));
        $(totalPriceElement[idx]).attr("data-cart-total-price", newTotal);
      });
    }
  });

  function formatCurrency(value) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value);
  }

  // add active class to header
  const navElement = $("#navbarCollapse");
  const currentUrl = window.location.pathname;
  navElement.find('a.nav-link').each(function () {
    const link = $(this);
    const href = link.attr('href');

    if (href === currentUrl) {
      link.addClass('active');
    } else {
      link.removeClass('active');
    }
  });

  // Kẹp số lượng khi gõ tay (không đụng handler nút → không bị double)
  $(document)
    .off('input.qtyClamp change.qtyClamp blur.qtyClamp', '.quantity input')
    .on('input.qtyClamp change.qtyClamp blur.qtyClamp', '.quantity input', function () {
      const $input = $(this);
      let val = Math.max(1, Number($input.val() || 1));

      const stock = Number(
        $input.attr('data-stock') ||
        $input.attr('data-cart-detail-stock') ||
        $('#quantityDetail').attr('data-stock') || NaN
      );

      if (Number.isFinite(stock) && val > stock) {
        val = stock;
        if (typeof toastErr === 'function') {
          toastErr(`Số lượng vượt quá tồn kho. Chỉ còn ${stock} sản phẩm.`);
        }
      }

      $input.val(val);

      const $detail = $('#quantityDetail');
      if ($detail.length) $detail.val(val);
    });

  /* =============== LỌC SẢN PHẨM =============== */
  // Nếu trang có Filter Modal (id #filterModal) thì NHƯỜNG cho filter.ejs xử lý để tránh chồng chéo
  if (!document.querySelector('#filterModal')) {
    $(document)
      .off('click', '#btnFilter')
      .on('click', '#btnFilter', function (event) {
        event.preventDefault();

        const url = new URL(window.location.href);
        const sp = url.searchParams;

        // Xóa param cũ (kể cả page)
        [
          'factory',
          'target',
          'price',
          'cpu',
          'ram',
          'storage',
          'res',
          'screen',
          'feature',
          'sort',
          'page'
        ].forEach(k => sp.delete(k));
        sp.set('page', '1');

        const appendChecked = (wrapSel, key) => {
          $(`${wrapSel} .form-check-input:checked`).each(function () {
            sp.append(key, this.value);
          });
        };

        appendChecked('#factoryFilter', 'factory');
        appendChecked('#targetFilter', 'target');
        appendChecked('#priceFilter', 'price');
        appendChecked('#cpuFilter', 'cpu');
        appendChecked('#ramFilter', 'ram');
        appendChecked('#storageFilter', 'storage');
        appendChecked('#resFilter', 'res');
        appendChecked('#screenFilter', 'screen');
        appendChecked('#featureFilter', 'feature');

        const sortValue = $('input[name="radio-sort"]:checked').val();
        if (sortValue && sortValue !== 'gia-khong-sap-xep') {
          sp.set('sort', sortValue);
        }

        window.location.href = url.toString();
      });
  }

  /* =============== TỰ TÍCH CHECKBOX SAU KHI LOAD =============== */
  (function autoCheckFiltersFromURL () {
    const params = new URLSearchParams(window.location.search);

    const valuesOf = (key) => {
      const many = params.getAll(key);
      if (many && many.length) return many;
      const single = params.get(key);
      return single ? String(single).split(',') : [];
    };

    const setChecks = (selector, key) => {
      const vals = valuesOf(key);
      vals.forEach(v =>
        $(`${selector} .form-check-input[value="${v}"]`).prop('checked', true)
      );
    };

    setChecks('#factoryFilter', 'factory');
    setChecks('#targetFilter', 'target');
    setChecks('#priceFilter', 'price');
    setChecks('#cpuFilter', 'cpu');
    setChecks('#ramFilter', 'ram');
    setChecks('#storageFilter', 'storage');
    setChecks('#resFilter', 'res');
    setChecks('#screenFilter', 'screen');
    setChecks('#featureFilter', 'feature');

    if (params.has('sort')) {
      $(
        `input[type="radio"][name="radio-sort"][value="${params.get('sort')}"]`
      ).prop('checked', true);
    }
  })();

  /* ======= Tính lại phân trang sau khi lọc trên client ======= */
  window.__fixPaginationAfterClientFilter = function () {
    try {
      const $list = $('#product-list');
      const $pager = $('#product-pagination, ul.pagination.pager').first();
      if (!$list.length) return;

      const url = new URL(window.location.href);
      const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;

      const pageSizeFromAttr = parseInt(
        $pager.attr('data-page-size') || '0',
        10
      );
      const pageSizeFromQS = parseInt(
        url.searchParams.get('pageSize') || '0',
        10
      );

      const PAGE_SIZE =
        (Number.isFinite(pageSizeFromAttr) && pageSizeFromAttr > 0)
          ? pageSizeFromAttr
          : (
            Number.isFinite(pageSizeFromQS) && pageSizeFromQS > 0
              ? pageSizeFromQS
              : 12
          );

      let $tiles = $list
        .find('[class^="col-"], [class*=" col-"]')
        .filter(function () {
          return $(this).find('button, .btn').length > 0;
        });

      if (!$tiles.length) {
        $tiles = $list.find('.card').map(function () {
          return (
            $(this).closest('[class^="col-"], [class*=" col-"]')[0] || this
          );
        });
      }

      const visibleCount = $tiles.filter(function () {
        return $(this).css('display') !== 'none';
      }).length;

      if (visibleCount === 0 && page > 1) {
        url.searchParams.set('page', '1');
        window.location.replace(url.toString());
        return 'redirected';
      }

      if ($pager.length) {
        if (visibleCount <= PAGE_SIZE) $pager.hide();
        else $pager.show();
      }
    } catch (e) {
      console.error('fixPaginationAfterClientFilter error:', e);
    }
  };

  /* ======= Lọc giá trên client xong thì xử lý luôn phân trang ======= */
  (function hookClientFilterPagination () {
    const orig = window.__applyClientPriceFilter;
    window.__applyClientPriceFilter = function () {
      if (typeof orig === 'function') orig();
      if (window.__fixPaginationAfterClientFilter) {
        window.__fixPaginationAfterClientFilter();
      }
    };

    $(function () {
      if (window.__applyClientPriceFilter) window.__applyClientPriceFilter();
      else if (window.__fixPaginationAfterClientFilter) {
        window.__fixPaginationAfterClientFilter();
      }
    });

    window.addEventListener('popstate', function () {
      if (window.__applyClientPriceFilter) window.__applyClientPriceFilter();
      else if (window.__fixPaginationAfterClientFilter) {
        window.__fixPaginationAfterClientFilter();
      }
    });
  })();

  /* =============== COMMON =============== */
  function isLogin () {
    const navElement = $("#navbarCollapse");
    return navElement.find('a.a-login').length === 0;
  }

  function toastOk (msg) {
    $.toast?.({
      heading: "Thành công",
      text: msg,
      position: "top-right",
      icon: "success",
      hideAfter: 2200
    });
  }

  function toastErr (msg) {
    $.toast?.({
      heading: "Lỗi thao tác !",
      text: msg,
      position: "top-right",
      icon: "error"
    });
  }

  // === HELPERS hiển thị badge ===
  function getCurrentBadge () {
    const el =
      document.querySelector('.js-sumCart') || document.getElementById('sumCart');
    if (!el) return 0;
    const raw = (el.textContent || '0').replace('+', '').trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function renderCartCount (v) {
    const n = Number.isFinite(Number(v)) ? Number(v) : 0;
    const txt = n > 9 ? '9+' : String(n);
    document.querySelectorAll('.js-sumCart').forEach(el => {
      el.textContent = txt;
    });

    const legacy = document.getElementById('sumCart');
    if (legacy) {
      const child = legacy.querySelector('.js-sumCart');
      if (child) child.textContent = txt;
      else legacy.textContent = txt;
    }
  }

  async function refetchCartCount () {
    try {
      const r = await fetch('/api/cart/count', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
      });
      const j = await r.json().catch(() => ({}));
      const c = j?.count ?? j?.data?.count;
      if (Number.isFinite(Number(c))) renderCartCount(c);
    } catch {
      // ignore
    }
  }

  // === Gọi API thêm giỏ (dùng chung) ===
  function addToCart ({ productId, quantity, onDone, onFail }) {
    $.ajax({
      url: '/api/add-product-to-cart',
      type: 'POST',
      data: JSON.stringify({ quantity, productId }),
      contentType: 'application/json',
      dataType: 'json',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      },
      xhrFields: { withCredentials: true },
      success: function (res) {
        const srvCount = Number(res?.data?.count ?? res?.count);
        if (Number.isFinite(srvCount)) {
          renderCartCount(srvCount);
        } else {
          refetchCartCount();
        }
        onDone && onDone();
      },
      error: function (xhr) {
        onFail &&
          onFail(
            xhr?.responseJSON?.message ||
            'Không thể thêm vào giỏ. Vui lòng thử lại.'
          );
      }
    });
  }

  // === Bind sự kiện cho cả Home/Filter + Detail ===
  $(function () {
    const $doc = $(document);
    $doc.off('click.addHome click.addDetail');

    // Home/Filter: quantity = 1
    $doc.on('click.addHome', '.btnAddToCartHomePage', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof isLogin === 'function' && !isLogin()) {
        return toastErr("Bạn cần đăng nhập vào tài khoản.");
      }

      const $btn = $(this);
      if ($btn.data('busy')) return;
      $btn.data('busy', true).prop('disabled', true);

      const productId = Number($btn.data('product-id'));
      const stock = Number($btn.data('stock'));

      if (Number.isFinite(stock) && stock <= 0) {
        $btn.prop('disabled', true);
        return toastErr('Sản phẩm đã hết hàng.');
      }

      const qty = 1;

      // cập nhật lạc quan ngay
      renderCartCount(getCurrentBadge() + qty);

      addToCart({
        productId,
        quantity: qty,
        onDone: () => {
          toastOk('Thêm sản phẩm vào giỏ hàng thành công!');
          $btn.data('busy', false).prop('disabled', false);
        },
        onFail: (msg) => {
          toastErr(msg);
          refetchCartCount();
          $btn.data('busy', false).prop('disabled', false);
        }
      });
    });

    // Trang chi tiết
    $doc.on('click.addDetail', '.btnAddToCartDetail', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof isLogin === 'function' && !isLogin()) {
        return toastErr("Bạn cần đăng nhập vào tài khoản.");
      }

      const $btn = $(this);
      if ($btn.data('busy')) return;
      $btn.data('busy', true).prop('disabled', true);

      const productId = Number($btn.data('product-id'));
      const qty = Math.max(1, Number($('#quantityDetail').val() || '1'));
      const stock = Number($('#quantityDetail').attr('data-stock'));

      if (Number.isFinite(stock) && stock <= 0) {
        $btn.prop('disabled', true);
        return toastErr('Sản phẩm đã hết hàng.');
      }
      if (Number.isFinite(stock) && qty > stock) {
        return toastErr(`Số lượng vượt quá tồn kho. Chỉ còn ${stock} sản phẩm.`);
      }

      renderCartCount(getCurrentBadge() + qty);

      addToCart({
        productId,
        quantity: qty,
        onDone: () => {
          toastOk('Thêm sản phẩm vào giỏ hàng thành công!');
          $btn.data('busy', false).prop('disabled', false);
        },
        onFail: (msg) => {
          toastErr(msg);
          refetchCartCount();
          $btn.data('busy', false).prop('disabled', false);
        }
      });
    });
  });

  /* =============== MUA NGAY (Trang chi tiết) =============== */
  $(document)
    .off('click.buyNow', '#btnBuyNow')
    .on('click.buyNow', '#btnBuyNow', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!isLogin()) return toastErr("Bạn cần đăng nhập vào tài khoản.");

      const productId = Number($('.btnAddToCartDetail').data('product-id'));
      const quantity = Math.max(
        1,
        Number($('#quantityDetail').val() || '1')
      );

      try {
        const r = await fetch('/api/buy-now', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ productId, quantity })
        });
        if (!r.ok) {
          const errBody = await r.json().catch(() => ({}));
          throw new Error(errBody.message || 'Không thể Mua ngay.');
        }
        const data = await r.json();
        window.location.href = data.redirect || '/checkout?mode=buy';
      } catch (err) {
        toastErr(
          err.message ||
          'Không thể thực hiện Mua ngay. Vui lòng thử lại.'
        );
      }
    });

  // public/client/js/product-detail.js
  (function () {
    const productId = window.__PRODUCT_ID__;
    const isAuth = window.__IS_AUTH__;
    const currentUserId = window.__USER_ID__ ?? null;

    document.addEventListener('DOMContentLoaded', () => {
      const boot = document.getElementById('boot');
      if (!boot) return console.error('Boot element missing');

      const PRODUCT_ID = Number(boot.dataset.productId || '0');
      const IS_AUTH = boot.dataset.isAuth === '1';
      const USER_ID = boot.dataset.userId
        ? Number(boot.dataset.userId)
        : null;

      // ===== CHAT =====

      // 1) Singleton socket cho toàn trang
      const socket = (window.__CHAT_SOCKET__ ||= io());

      // 2) Guard: đảm bảo init 1 lần duy nhất cho widget
      if (window.__CHAT_WIDGET_INIT__) {
        // đã init rồi thì không làm lại
      } else {
        window.__CHAT_WIDGET_INIT__ = true;

        let sessionId = null;
        const LS_KEY = `chat_session_product_${PRODUCT_ID}`;

        const $open = document.getElementById("chatOpen");
        const $card = document.getElementById("chatCard");
        const $close = document.getElementById("chatClose");
        const $pre = document.getElementById("preChat");
        const $main = document.getElementById("chatMain");
        const $name = document.getElementById("preName");
        const $start = document.getElementById("btnStartChat");
        const $body = document.getElementById("chatBody");
        const $form = document.getElementById("chatForm");
        const $input = document.getElementById("chatInput");
        const $typing = document.getElementById("typingHint");
        const $sound = document.getElementById("chatSound");
        const $miniBadge = document.getElementById("chatMiniBadge");

        let closed = false;

        const seenMsgIds = (window.__CHAT_SEEN_IDS__ ||= new Set());

        function showCard () {
          $open.classList.add("d-none");
          $card.classList.remove("d-none");
        }
        function hideCard () {
          $card.classList.add("d-none");
          $open.classList.remove("d-none");
        }
        function showMain () {
          $pre.classList.add("d-none");
          $main.classList.remove("d-none");
        }
        function showPre () {
          $main.classList.add("d-none");
          $pre.classList.remove("d-none");
        }
        function playSound () {
          try {
            $sound.currentTime = 0;
            $sound.play().catch(() => {});
          } catch {}
        }
        function incMiniBadge () {
          $miniBadge.classList.remove("d-none");
          $miniBadge.textContent = "1";
        }
        function clearMiniBadge () {
          $miniBadge.classList.add("d-none");
        }

        function setClosedUI () {
          if (closed) return;
          closed = true;
          if ($input) $input.disabled = true;
          const btn = $form?.querySelector('button');
          if (btn) btn.disabled = true;
          appendMsg("ADMIN", "Phiên chat đã kết thúc.");
        }

        function appendMsg (who, text, isRead = false) {
          const div = document.createElement("div");
          div.className =
            "d-flex " +
            (who === "USER"
              ? "justify-content-end"
              : "justify-content-start") +
            " mb-2";
          const status =
            who === "USER"
              ? `<span class="ms-2 small ${
                  isRead ? "text-primary" : "text-muted"
                }">${isRead ? "✓✓" : "✓"}</span>`
              : "";
          div.innerHTML = `<div class="p-2 rounded ${
            who === "USER" ? "bg-primary text-white" : "bg-light"
          }" style="max-width:80%">${text}${status}</div>`;
          $body.appendChild(div);
          $body.scrollTop = $body.scrollHeight;
        }

        async function loadHistory () {
          const res = await fetch(
            `/api/chat/sessions/${sessionId}/messages`
          );
          const list = await res.json();
          $body.innerHTML = "";

          seenMsgIds.clear();
          list.forEach((m) => {
            if (typeof m.id !== "undefined") seenMsgIds.add(m.id);
            appendMsg(m.sender, m.content, !!m.isRead);
          });

          socket.emit("chat:read", {
            sessionId,
            readerRole: "USER"
          });
        }

        function ensureSessionThen () {
          const saved = localStorage.getItem(LS_KEY);
          if (saved) {
            sessionId = Number(saved);
            socket.emit("chat:join", { sessionId });
            showMain();
            loadHistory();
            return;
          }
          showPre();
          $start.onclick = () => {
            const name = ($name.value || "Khách").trim();
            const gender =
              document.querySelector('input[name="preGender"]:checked')
                ?.value || "OTHER";
            socket.emit(
              "chat:create_session",
              { name, gender, productId: PRODUCT_ID, userId: USER_ID },
              (sess) => {
                sessionId = sess.id;
                localStorage.setItem(LS_KEY, String(sessionId));
                showMain();
                loadHistory();
              }
            );
          };
        }

        $open.addEventListener("click", () => {
          showCard();
          clearMiniBadge();
          ensureSessionThen();
        });
        $close.addEventListener("click", () => {
          hideCard();
        });

        $form?.addEventListener("submit", (e) => {
          e.preventDefault();
          if (closed) return;
          const content = ($input.value || "").trim();
          if (!content) return;
          socket.emit("chat:message", {
            sessionId,
            sender: "USER",
            content
          });
          appendMsg("USER", content, false);
          $input.value = "";
        });

        let tmr;
        $input?.addEventListener("input", () => {
          if (!sessionId || closed) return;
          socket.emit("chat:typing", {
            sessionId,
            who: "USER",
            isTyping: true
          });
          clearTimeout(tmr);
          tmr = setTimeout(
            () =>
              socket.emit("chat:typing", {
                sessionId,
                who: "USER",
                isTyping: false
              }),
            800
          );
        });

        socket.off("chat:message");
        socket.off("chat:typing");
        socket.off("chat:read");
        socket.off("chat:status");
        socket.off("chat:closed");

        socket.on("chat:message", (msg) => {
          if (msg && typeof msg.id !== "undefined") {
            if (seenMsgIds.has(msg.id)) return;
            seenMsgIds.add(msg.id);
          }
          if (Number(msg.sessionId) !== Number(sessionId)) return;

          if (msg.sender === "ADMIN") {
            appendMsg("ADMIN", msg.content);
            if ($card.classList.contains("d-none")) {
              incMiniBadge();
              playSound();
            }
            socket.emit("chat:read", {
              sessionId,
              readerRole: "USER"
            });
          }
        });

        socket.on("chat:typing", ({ who, isTyping }) => {
          if (who === "ADMIN") {
            $typing.classList.toggle("d-none", !isTyping);
          }
        });

        socket.on("chat:read", ({ sessionId: sid, readerRole }) => {
          if (Number(sid) !== Number(sessionId)) return;
          if (readerRole === "ADMIN") loadHistory();
        });

        socket.on("chat:status", ({ sessionId: sid, status }) => {
          if (Number(sid) !== Number(sessionId)) return;
          if (status === "CLOSED") setClosedUI();
        });

        socket.on("chat:closed", () => setClosedUI());
      }
    });
  })();

  // ================= SO SÁNH SẢN PHẨM =================
  (function () {
    const MAX_COMPARE = 4;
    const KEY = 'compareList';

    function getList () {
      try {
        return JSON.parse(localStorage.getItem(KEY) || '[]');
      } catch (e) {
        return [];
      }
    }

    function saveList (arr) {
      localStorage.setItem(KEY, JSON.stringify(arr));
    }

    function inList (id) {
      const arr = getList();
      for (let i = 0; i < arr.length; i++) {
        if (String(arr[i].id) === String(id)) return true;
      }
      return false;
    }

    function addItem (p) {
      const arr = getList();
      if (arr.length >= MAX_COMPARE) {
        if ($.toast) {
          $.toast({
            heading: 'So sánh',
            text: 'Bạn chỉ có thể so sánh tối đa ' + MAX_COMPARE + ' sản phẩm.',
            position: 'top-right',
            icon: 'warning'
          });
        }
        return false;
      }
      if (!inList(p.id)) {
        arr.push({
          id: Number(p.id),
          name: String(p.name || ''),
          image: String(p.image || '')
        });
        saveList(arr);
        return true;
      }
      return true;
    }

    function removeItem (id) {
      const arr = getList();
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        if (String(arr[i].id) !== String(id)) out.push(arr[i]);
      }
      saveList(out);
    }

    function clearAll () {
      saveList([]);
    }

    function renderBar () {
      const bar = document.getElementById('compareBar');
      const wrap = document.getElementById('compareItems');
      const btnGo = document.getElementById('btnCompareNow');

      if (!bar || !wrap || !btnGo) return;

      const arr = getList();
      if (arr.length === 0) {
        bar.style.display = 'none';
        btnGo.disabled = true;
        wrap.innerHTML = '';
        return;
      }

      bar.style.display = 'block';
      btnGo.disabled = !(arr.length >= 2);

      let html = '';
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        const img = it.image
          ? '/images/product/' + encodeURIComponent(it.image)
          : '/images/no-image.png';
        html +=
          '<div class="compare-chip" data-id="' +
          it.id +
          '">' +
          '<img src="' +
          img +
          '" alt="p">' +
          '<span class="name small">' +
          escapeHtml(it.name) +
          '</span>' +
          '<span class="x" title="Xóa" aria-label="Xóa" data-id="' +
          it.id +
          '">×</span>' +
          '</div>';
      }
      wrap.innerHTML = html;

      $('.btnCompareToggle').each(function () {
        const pid = $(this).data('product-id');
        if (inList(pid)) $(this).addClass('active');
        else $(this).removeClass('active');
      });
    }

    function escapeHtml (s) {
      return String(s || '').replace(/[&<>"']/g, function (c) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c];
      });
    }

    $(document)
      .off('click.compare', '.btnCompareToggle')
      .on('click.compare', '.btnCompareToggle', function (e) {
        e.preventDefault();
        const id = $(this).data('product-id');
        const name = $(this).data('product-name') || '';
        const image = $(this).data('product-image') || '';
        if (inList(id)) {
          removeItem(id);
          if ($.toast) {
            $.toast({
              heading: 'So sánh',
              text: 'Đã bỏ khỏi danh sách so sánh.',
              position: 'top-right'
            });
          }
        } else {
          const ok = addItem({ id, name, image });
          if (ok && $.toast) {
            $.toast({
              heading: 'So sánh',
              text: 'Đã thêm vào danh sách so sánh.',
              position: 'top-right'
            });
          }
        }
        renderBar();
      });

    $(document)
      .off('click.compare.x', '#compareItems .x')
      .on('click.compare.x', '#compareItems .x', function () {
        const id = $(this).data('id');
        removeItem(id);
        renderBar();
      });

    $(document)
      .off('click.compare.clear', '#btnCompareClear')
      .on('click.compare.clear', '#btnCompareClear', function () {
        clearAll();
        renderBar();
      });

    $(document)
      .off('click.compare.go', '#btnCompareNow')
      .on('click.compare.go', '#btnCompareNow', function () {
        const arr = getList();
        if (arr.length < 2) return;
        const ids = [];
        for (let i = 0; i < arr.length; i++) {
          ids.push(arr[i].id);
        }
        window.location.href = '/compare?ids=' + ids.join(',');
      });

    $(function () {
      renderBar();
    });
  })();

  /* ======= ÁP BỘ LỌC GIÁ TRÊN CLIENT (ẨN CARD NGOÀI KHOẢNG) ======= */
  window.__applyClientPriceFilter = function () {
    try {
      const sp = new URLSearchParams(window.location.search);

      let tokens = sp.getAll('price');
      if (!tokens.length) {
        const single = sp.get('price');
        if (single) tokens = String(single).split(',');
      }

      const MAP = {
        'duoi-10-trieu': [0, 9_999_999],
        '10-15-trieu': [10_000_000, 15_000_000],
        '15-20-trieu': [15_000_000, 20_000_000],
        'tren-20-trieu': [20_000_001, Number.MAX_SAFE_INTEGER]
      };
      const ranges = [];
      tokens.forEach((t) => {
        if (MAP[t]) ranges.push(MAP[t]);
      });

      const minP = sp.get('minPrice');
      const maxP = sp.get('maxPrice');
      if (minP || maxP) {
        const a = minP ? parseInt(minP, 10) : 0;
        const b = maxP ? parseInt(maxP, 10) : Number.MAX_SAFE_INTEGER;
        if (Number.isFinite(a) || Number.isFinite(b)) ranges.push([a, b]);
      }

      const hasPriceFilter = ranges.length > 0;
      if (!hasPriceFilter) {
        $('#product-list')
          .find('[data-prod], [class^="col-"], [class*=" col-"], .card')
          .filter(function () {
            return $(this).find('button, .btn').length;
          })
          .css('display', '');
        return;
      }

      const inAny = (n) => ranges.some(([a, b]) => n >= a && n <= b);
      const parseVND = (text) => {
        const digits = String(text || '').replace(/[^\d]/g, '');
        return digits ? parseInt(digits, 10) : NaN;
      };

      let $tiles = $('#product-list')
        .find('[class^="col-"], [class*=" col-"]')
        .filter(function () {
          return $(this).find('button, .btn').length > 0;
        });

      if (!$tiles.length) {
        $tiles = $('#product-list').find('.card').map(function () {
          return (
            $(this).closest('[class^="col-"], [class*=" col-"]')[0] || this
          );
        });
      }

      $($tiles).each(function () {
        const $tile = $(this);
        let priceText = '';

        $tile.find('*').each(function () {
          const t = $(this).text();
          if (t && t.indexOf('₫') !== -1 && /\d/.test(t)) priceText = t;
        });

        const price = parseVND(priceText);

        if (!Number.isFinite(price)) {
          $tile.css('display', '');
          return;
        }
        $tile.css('display', inAny(price) ? '' : 'none');
      });
    } catch (e) {
      console.error('applyClientPriceFilter error:', e);
    }
  };

  $(function () {
    if (window.__applyClientPriceFilter) window.__applyClientPriceFilter();
  });
  window.addEventListener('popstate', function () {
    if (window.__applyClientPriceFilter) window.__applyClientPriceFilter();
  });
  document.addEventListener('products:replaced', function () {
    if (window.__applyClientPriceFilter) window.__applyClientPriceFilter();
  });
})(jQuery);
