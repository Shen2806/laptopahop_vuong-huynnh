(function ($) {
    "use strict";

    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner(0);


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
            0: {
                items: 1
            },
            576: {
                items: 1
            },
            768: {
                items: 1
            },
            992: {
                items: 2
            },
            1200: {
                items: 2
            }
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
            0: {
                items: 1
            },
            576: {
                items: 1
            },
            768: {
                items: 2
            },
            992: {
                items: 3
            },
            1200: {
                items: 4
            }
        }
    });


    // Modal Video
    $(document).ready(function () {
        var $videoSrc;
        $('.btn-play').click(function () {
            $videoSrc = $(this).data("src");
        });

        $('#videoModal').on('shown.bs.modal', function (e) {
            $("#video").attr('src', $videoSrc + "?autoplay=1&amp;modestbranding=1&amp;showinfo=0");
        })

        $('#videoModal').on('hide.bs.modal', function (e) {
            $("#video").attr('src', $videoSrc);
        })
    });



    // Product Quantity
    // $('.quantity button').on('click', function () {
    //     var button = $(this);
    //     var oldValue = button.parent().parent().find('input').val();
    //     if (button.hasClass('btn-plus')) {
    //         var newVal = parseFloat(oldValue) + 1;
    //     } else {
    //         if (oldValue > 0) {
    //             var newVal = parseFloat(oldValue) - 1;
    //         } else {
    //             newVal = 0;
    //         }
    //     }
    //     button.parent().parent().find('input').val(newVal);
    // });
    $('.quantity button').on('click', function () {
        let change = 0;

        var button = $(this);
        var oldValue = button.parent().parent().find('input').val();
        if (button.hasClass('btn-plus')) {
            var newVal = parseFloat(oldValue) + 1;
            change = 1;
        } else {
            if (oldValue > 1) {
                var newVal = parseFloat(oldValue) - 1;
                change = -1;
            } else {
                newVal = 1;
            }
        }
        const input = button.parent().parent().find('input');
        input.val(newVal);

        //set form index
        const index = input.attr("data-cart-detail-index")
        const el = document.getElementById(`cartDetails[${index}]`);
        $(el).val(newVal);

        //set quantity for detail page
        const elDetail = document.getElementById(`quantityDetail`);
        if (elDetail) {
            $(elDetail).val(newVal);
        }

        //get price
        const price = input.attr("data-cart-detail-price");
        const id = input.attr("data-cart-detail-id");

        const priceElement = $(`p[data-cart-detail-id='${id}']`);
        if (priceElement) {
            const newPrice = +price * newVal;
            priceElement.text(formatCurrency(newPrice));
        }

        //update total cart price
        const totalPriceElement = $(`p[data-cart-total-price]`);

        if (totalPriceElement && totalPriceElement.length) {
            const currentTotal = totalPriceElement.first().attr("data-cart-total-price");
            let newTotal = +currentTotal;
            if (change === 0) {
                newTotal = +currentTotal;
            } else {
                newTotal = change * (+price) + (+currentTotal);
            }

            //reset change
            change = 0;

            //update
            totalPriceElement?.each(function (index, element) {
                //update text
                $(totalPriceElement[index]).text(formatCurrency(newTotal));

                //update data-attribute
                $(totalPriceElement[index]).attr("data-cart-total-price", newTotal);
            });
        }
    });

    function formatCurrency(value) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency', currency: 'VND'
        }).format(value)
    }

    //add active class to header
    const navElement = $("#navbarCollapse");
    const currentUrl = window.location.pathname;
    navElement.find('a.nav-link').each(function () {
        const link = $(this); // Get the current link in the loop
        const href = link.attr('href'); // Get the href attribute of the link

        if (href === currentUrl) {
            link.addClass('active'); // Add 'active' class if the href matches the current URL
        } else {
            link.removeClass('active'); // Remove 'active' class if the href does not match
        }
    });


    //handle filter products
    $('#btnFilter').click(function (event) {
        event.preventDefault();

        let factoryArr = [];
        let targetArr = [];
        let priceArr = [];
        //factory filter
        $("#factoryFilter .form-check-input:checked").each(function () {
            factoryArr.push($(this).val());
        });

        //target filter
        $("#targetFilter .form-check-input:checked").each(function () {
            targetArr.push($(this).val());
        });

        //price filter
        $("#priceFilter .form-check-input:checked").each(function () {
            priceArr.push($(this).val());
        });

        //sort order
        let sortValue = $('input[name="radio-sort"]:checked').val();

        const currentUrl = new URL(window.location.href);
        const searchParams = currentUrl.searchParams;

        const currentPage = searchParams?.get("page") ?? "1"
        // Add or update query parameters
        searchParams.set('page', currentPage);
        searchParams.set('sort', sortValue);

        //reset
        searchParams.delete('factory');
        searchParams.delete('target');
        searchParams.delete('price');

        if (factoryArr.length > 0) {
            searchParams.set('factory', factoryArr.join(','));
        }

        if (targetArr.length > 0) {
            searchParams.set('target', targetArr.join(','));
        }

        if (priceArr.length > 0) {
            searchParams.set('price', priceArr.join(','));
        }

        // Update the URL and reload the page
        window.location.href = currentUrl.toString();
    });

    //handle auto checkbox after page loading
    // Parse the URL parameters
    const params = new URLSearchParams(window.location.search);

    // Set checkboxes for 'factory'
    if (params.has('factory')) {
        const factories = params.get('factory').split(',');
        factories.forEach(factory => {
            $(`#factoryFilter .form-check-input[value="${factory}"]`).prop('checked', true);
        });
    }

    // Set checkboxes for 'target'
    if (params.has('target')) {
        const targets = params.get('target').split(',');
        targets.forEach(target => {
            $(`#targetFilter .form-check-input[value="${target}"]`).prop('checked', true);
        });
    }

    // Set checkboxes for 'price'
    if (params.has('price')) {
        const prices = params.get('price').split(',');
        prices.forEach(price => {
            $(`#priceFilter .form-check-input[value="${price}"]`).prop('checked', true);
        });
    }

    // Set radio buttons for 'sort'
    if (params.has('sort')) {
        const sort = params.get('sort');
        $(`input[type="radio"][name="radio-sort"][value="${sort}"]`).prop('checked', true);
    }


    // handle add to cart wit ajax
    $(".btnAddToCartHomePage").click(function(event){
        event.preventDefault();

        if(!isLogin()){
            $.toast({
                heading: "Lỗi thao tác !",
                text: "Bạn cần đăng nhập vào tài khoản.",
                position: "top-right",
                icon: "error"
            })
            return;
        }
        const productId = $(this).attr('data-product-id');
        $.ajax({
            url: `${window.location.origin}/api/add-product-to-cart`,
            type: "POST",
            data: JSON.stringify({quantity: 1, productId: productId}),
            contentType: "application/json",

            success: function(response){
                const sum = +response.data;

                // update cart 
                $("#sumCart").text(sum)
                //show message
                $.toast({
                    heading: "Giỏ hàng",
                    text: "Thêm sản phẩm vào giỏ hàng thành công !",
                    position: "top-right",
                })
            }
            
        })
    })
    $(".btnAddToCartDetail").click(function(event){
        event.preventDefault();

        if(!isLogin()){
            $.toast({
                heading: "Lỗi thao tác !",
                text: "Bạn cần đăng nhập vào tài khoản.",
                position: "top-right",
                icon: "error"
            })
            return;
        }
        const productId = $(this).attr('data-product-id');
        const quantity = $("#quantityDetail").val()
        $.ajax({
            url: `${window.location.origin}/api/add-product-to-cart`,
            type: "POST",
            data: JSON.stringify({quantity: quantity, productId: productId}),
            contentType: "application/json",

            success: function(response){
                const sum = +response.data;

                // update cart 
                $("#sumCart").text(sum)
                //show message
                $.toast({
                     heading: "Giỏ hàng",
                text: "Thêm sản phẩm vào giỏ hàng thành công !",
                position: "top-right",
                })
            },
            error: function (response){
                alert("Có lỗi xảy ra , vui lòng kiểm tra lại code.")
                console.log("error: ", response)
            }
            
        })
    })

    function isLogin(){
        const navElement = $("#navbarCollapse");
        const childLogin = navElement.find('a.a-login');
        if(childLogin.length > 0 ){
            return false;
        }
        return true;
    }

    
    // public/client/js/product-detail.js
(function () {
  const productId = window.__PRODUCT_ID__;
  const isAuth = window.__IS_AUTH__;
  const currentUserId = window.__USER_ID__ ?? null;

  // ====== phần review/Q&A ở cuối file (mục 2,3) ======

  document.addEventListener('DOMContentLoaded', () => {
  const boot = document.getElementById('boot');
  if (!boot) return console.error('Boot element missing');

  const PRODUCT_ID = Number(boot.dataset.productId || '0');
  const IS_AUTH    = boot.dataset.isAuth === '1';
  const USER_ID    = boot.dataset.userId ? Number(boot.dataset.userId) : null;

// ===== CHAT =====

// 1) Singleton socket cho toàn trang
const socket = (window.__CHAT_SOCKET__ ||= io());

// 2) Guard: đảm bảo init 1 lần duy nhất cho widget
if (window.__CHAT_WIDGET_INIT__) {
  // đã init rồi thì không làm lại (tránh đăng ký listener lặp)
} else {
  window.__CHAT_WIDGET_INIT__ = true;

  let sessionId = null;
  const LS_KEY = `chat_session_product_${PRODUCT_ID}`;

  const $open  = document.getElementById("chatOpen");
  const $card  = document.getElementById("chatCard");
  const $close = document.getElementById("chatClose");
  const $pre   = document.getElementById("preChat");
  const $main  = document.getElementById("chatMain");
  const $name  = document.getElementById("preName");
  const $start = document.getElementById("btnStartChat");
  const $body  = document.getElementById("chatBody");
  const $form  = document.getElementById("chatForm");
  const $input = document.getElementById("chatInput");
  const $typing= document.getElementById("typingHint");
  const $sound = document.getElementById("chatSound");
  const $miniBadge = document.getElementById("chatMiniBadge");

  let closed = false;

  // 3) Set ID để khử trùng lặp message
  const seenMsgIds = (window.__CHAT_SEEN_IDS__ ||= new Set());

  function showCard() { $open.classList.add("d-none"); $card.classList.remove("d-none"); }
  function hideCard() { $card.classList.add("d-none"); $open.classList.remove("d-none"); }
  function showMain() { $pre.classList.add("d-none"); $main.classList.remove("d-none"); }
  function showPre()  { $main.classList.add("d-none"); $pre.classList.remove("d-none"); }
  function playSound(){ try { $sound.currentTime=0; $sound.play().catch(()=>{}); } catch{} }
  function incMiniBadge(){ $miniBadge.classList.remove("d-none"); $miniBadge.textContent="1"; }
  function clearMiniBadge(){ $miniBadge.classList.add("d-none"); }

  function setClosedUI() {
    if (closed) return;
    closed = true;
    if ($input) $input.disabled = true;
    const btn = $form?.querySelector('button'); if (btn) btn.disabled = true;
    appendMsg("ADMIN", "Phiên chat đã kết thúc.");
  }

  function appendMsg(who, text, isRead=false) {
    const div = document.createElement("div");
    div.className = `d-flex ${who==="USER"?"justify-content-end":"justify-content-start"} mb-2`;
    const status = who==="USER" ? `<span class="ms-2 small ${isRead?"text-primary":"text-muted"}">${isRead?"✓✓":"✓"}</span>` : "";
    div.innerHTML = `<div class="p-2 rounded ${who==="USER"?"bg-primary text-white":"bg-light"}" style="max-width:80%">${text}${status}</div>`;
    $body.appendChild(div);
    $body.scrollTop = $body.scrollHeight;
  }

  async function loadHistory() {
    const res = await fetch(`/api/chat/sessions/${sessionId}/messages`);
    const list = await res.json();
    $body.innerHTML = "";

    // reset vết & nạp lại
    seenMsgIds.clear();
    list.forEach(m => {
      if (typeof m.id !== "undefined") seenMsgIds.add(m.id);
      appendMsg(m.sender, m.content, !!m.isRead);
    });

    socket.emit("chat:read", { sessionId, readerRole: "USER" });
  }

  function ensureSessionThen() {
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
      const gender = (document.querySelector('input[name="preGender"]:checked')?.value) || "OTHER";
      socket.emit("chat:create_session", { name, gender, productId: PRODUCT_ID, userId: USER_ID }, (sess) => {
        sessionId = sess.id;
        localStorage.setItem(LS_KEY, String(sessionId));
        showMain();
        loadHistory();
      });
    };
  }

  $open.addEventListener("click", () => { showCard(); clearMiniBadge(); ensureSessionThen(); });
  $close.addEventListener("click", () => { hideCard(); });

  $form?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (closed) return;
    const content = ($input.value || "").trim(); if (!content) return;
    socket.emit("chat:message", { sessionId, sender: "USER", content });
    appendMsg("USER", content, false);
    $input.value = "";
  });

  let tmr;
  $input?.addEventListener("input", () => {
    if (!sessionId || closed) return;
    socket.emit("chat:typing", { sessionId, who: "USER", isTyping: true });
    clearTimeout(tmr);
    tmr = setTimeout(()=> socket.emit("chat:typing", { sessionId, who: "USER", isTyping: false }), 800);
  });

  // 👉 Trước khi đăng ký, gỡ mọi listener cũ để chắc chắn không bị lặp
  socket.off("chat:message");
  socket.off("chat:typing");
  socket.off("chat:read");
  socket.off("chat:status");
  socket.off("chat:closed");

  socket.on("chat:message", (msg) => {
    // Khử trùng theo id
    if (msg && typeof msg.id !== "undefined") {
      if (seenMsgIds.has(msg.id)) return;
      seenMsgIds.add(msg.id);
    }
    // Sai phòng thì bỏ
    if (Number(msg.sessionId) !== Number(sessionId)) return;

    if (msg.sender === "ADMIN") {
      appendMsg("ADMIN", msg.content);
      if ($card.classList.contains("d-none")) { incMiniBadge(); playSound(); }
      socket.emit("chat:read", { sessionId, readerRole: "USER" });
    }
  });

  socket.on("chat:typing", ({ who, isTyping }) => {
    if (who === "ADMIN") $typing.classList.toggle("d-none", !isTyping);
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

  // =============== Q&A (Ask -> Admin Answer) ===============
(() => {
  const boot = document.getElementById('boot');
  const PRODUCT_ID = Number(boot?.dataset?.productId || 0);
  const IS_AUTH = (boot?.dataset?.isAuth || '0') === '1';

  const $qaList = document.getElementById('qaList');
  const $qaForm = document.getElementById('qaForm');

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderQAItem(q) {
    // q = { id, content, createdAt, user:{id,name,avatar}, reply?:{content,createdAt} }
    const userName = escapeHtml(q.user?.name || 'Ẩn danh');
    const userAvatar = q.user?.avatar ? `/images/${q.user.avatar}` : '/images/default-avatar.png';
    const at = new Date(q.createdAt).toLocaleString('vi-VN');

    const hasReply = !!q.reply;
    const replyHtml = hasReply
      ? `<div class="mt-2 ps-3 border-start">
          <div class="small text-success fw-semibold"><i class="fas fa-user-shield me-1"></i>Admin</div>
          <div>${escapeHtml(q.reply.content)}</div>
          <div class="small text-muted">${new Date(q.reply.createdAt).toLocaleString('vi-VN')}</div>
        </div>`
      : `<div class="mt-2 small text-muted"><em>Đang chờ phản hồi từ Admin...</em></div>`;

    return `
      <div class="border rounded p-2 mb-2">
        <div class="d-flex align-items-center gap-2">
          <img src="${userAvatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />
          <strong>${userName}</strong>
          <small class="text-muted">${at}</small>
        </div>
        <div class="mt-1">${escapeHtml(q.content)}</div>
        ${replyHtml}
      </div>
    `;
  }

  async function loadQuestions() {
    if (!IS_AUTH) {
      // nếu bạn muốn ẩn hoàn toàn khi chưa đăng nhập thì thôi không fetch
      // còn muốn cho xem public thì có thể vẫn fetch.
    }
    const r = await fetch(`/api/products/${PRODUCT_ID}/questions`);
    const list = await r.json();
    if ($qaList) {
      $qaList.innerHTML = list.map(renderQAItem).join('') || '<div class="text-muted">Chưa có câu hỏi nào.</div>';
    }
  }

  // Submit hỏi (không reload)
  if ($qaForm) {
    $qaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ta = $qaForm.querySelector('textarea[name="content"]');
      const content = (ta?.value || '').trim();
      if (!content) return;

      const res = await fetch(`/api/products/${PRODUCT_ID}/questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!res.ok) {
        const msg = await res.json().catch(()=>({}));
        alert(msg?.error || 'Gửi câu hỏi thất bại');
        return;
      }

      const created = await res.json();
      // prepend câu hỏi mới
      if ($qaList) {
        $qaList.insertAdjacentHTML('afterbegin', renderQAItem(created));
      }
      ta.value = '';
    });
  }

  // (Tuỳ chọn) realtime: nhận trả lời từ admin → cập nhật UI
  // User đã login sẽ join room user-{id} ở header script của bạn rồi.
  try {
    const s = io?.();
    s?.on?.('qa:answered', ({ questionId, content, createdAt }) => {
      // tìm block câu hỏi chưa có reply và gắn vào
      const blocks = Array.from($qaList.querySelectorAll('.border.rounded.p-2.mb-2'));
      for (const el of blocks) {
        // không có data-id -> thêm vào render để tìm dễ; hoặc fallback: refresh list
      }
      // Cách đơn giản nhất: reload danh sách Q&A
      loadQuestions();
    });
  } catch {}

  // Init
  loadQuestions();
})();


})();

})(jQuery);
