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

  // ====== CTA Mua ngay & các phần khác sẽ ở mục dưới ======
    // ====== RENDER SAO ======
  function renderStarsValue(v, size = "1.1rem") {
    const full = Math.floor(v), half = v - full >= 0.5 ? 1 : 0, empty = 5 - full - half;
    let html = "";
    for (let i = 0; i < full; i++) html += `<i class="fa fa-star text-warning" style="font-size:${size}"></i>`;
    if (half) html += `<i class="fa fa-star-half-alt text-warning" style="font-size:${size}"></i>`;
    for (let i = 0; i < empty; i++) html += `<i class="fa fa-star text-secondary" style="font-size:${size}"></i>`;
    return html;
  }

  async function loadMetaBasic() {
    const res = await fetch(`/api/products/${productId}/meta`);
    const data = await res.json();
    const avg = Number(data.ratingAvg || 0);
    const count = Number(data.ratingCount || 0);
    const $avg = document.getElementById("avgStars");
    const $cnt = document.getElementById("ratingCount");
    if ($avg) $avg.innerHTML = renderStarsValue(avg) + `<span class="ms-2 fw-semibold">${avg}</span>`;
    if ($cnt) $cnt.textContent = `(${count} đánh giá)`;
  }

  async function loadReviews() {
    const res = await fetch(`/api/products/${productId}/reviews`);
    const reviews = await res.json();
    const $list = document.getElementById("reviewList");
    if (!$list) return;
    $list.innerHTML = reviews.map(r => `
      <div class="border rounded p-2 mb-2">
        <div class="d-flex align-items-center gap-2">
          <img src="/images/${r.user.avatar||'default-avatar.png'}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />
          <strong>${r.user.name}</strong>
          <span class="small text-muted">${new Date(r.createdAt).toLocaleString('vi-VN')}</span>
        </div>
        <div class="mt-1">${renderStarsValue(r.rating)}</div>
        <div class="mt-1">${r.comment || ""}</div>
      </div>
    `).join("");
    // nếu là review của tôi -> set lại UI chọn sao & comment
    const mine = reviews.find(x => Number(x.user.id) === Number(currentUserId));
    if (mine) {
      const $rf = document.getElementById("reviewForm");
      if ($rf) {
        const ta = $rf.querySelector("textarea");
        if (ta) ta.value = mine.comment || "";
        // vẽ lại sao
        let current = mine.rating;
        const $box = document.getElementById("ratingStars");
        if ($box) {
          function paint(n) {
            $box.innerHTML = Array.from({ length: 5 }, (_, i) =>
              `<i data-v="${i+1}" class="fa ${i+1<=n?"fa-star":"fa-star-o"} text-warning fs-4" style="cursor:pointer"></i>`
            ).join("");
          }
          paint(current);
          $box.onclick = (e) => {
            const v = Number(e.target?.dataset?.v || 0);
            if (v) { current = v; paint(current); $box.dataset.value = String(current); }
          };
          $box.dataset.value = String(current);
        }
      }
    }
  }

  // init rating selector (nếu chưa có mine)
  (function initRatingSelector(){
    const $box = document.getElementById("ratingStars");
    if (!$box) return;
    let current = 5;
    function paint(n) {
      $box.innerHTML = Array.from({ length: 5 }, (_, i) =>
        `<i data-v="${i+1}" class="fa ${i+1<=n?"fa-star":"fa-star-o"} text-warning fs-4" style="cursor:pointer"></i>`
      ).join("");
    }
    paint(current);
    $box.onclick = (e)=> {
      const v = Number(e.target?.dataset?.v || 0);
      if (v) { current = v; paint(current); $box.dataset.value = String(current); }
    };
    $box.dataset.value = String(current);
  })();

  // submit review (upsert, không reload)
  (function bindReviewSubmit(){
    const $rf = document.getElementById("reviewForm");
    if (!$rf) return;
    $rf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rbox = document.getElementById("ratingStars");
      const rating = Number(rbox?.dataset?.value || 5);
      const comment = $rf.querySelector("textarea").value.trim();
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      await loadMetaBasic();
      await loadReviews(); // cập nhật danh sách, giữ dữ liệu
    });
  })();

  // khởi tạo lần đầu
  loadMetaBasic();
  loadReviews();

(() => {
  const boot = document.getElementById('boot');
  window.__PRODUCT_ID__ = Number(boot?.dataset.productId);
  window.__IS_AUTH__    = boot?.dataset.isAuth === '1';
  window.__USER_ID__    = boot?.dataset.userId ? Number(boot.dataset.userId) : null;
})();

})();

})(jQuery);
