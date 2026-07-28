(function () {
  "use strict";

  function formatPrice(n) {
    if (n === null || n === undefined) return "Price on request";
    return "$" + n.toLocaleString("en-US");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function listingCardHtml(l) {
    var photo;
    if (l.photoUrl) {
      photo = '<img src="' + escapeHtml(l.photoUrl) + '" alt="' + escapeHtml(l.address) + '" loading="lazy">';
    } else if (l.illustrationUrl) {
      photo = '<img class="listing-illustration" src="' + escapeHtml(l.illustrationUrl) + '" alt="Illustration of a home in this style" loading="lazy">';
    } else {
      photo = "Photo";
    }
    return (
      '<article class="listing-card" data-id="' + escapeHtml(l.id || "") + '" data-address="' + escapeHtml(l.address) + '">' +
        '<div class="listing-photo">' + (l.badge ? '<span class="listing-badge">' + escapeHtml(l.badge) + "</span>" : "") + photo + "</div>" +
        '<div class="listing-body">' +
          '<div class="listing-price">' + formatPrice(l.price) + "</div>" +
          '<div class="listing-address">' + escapeHtml(l.address) + "</div>" +
          '<div class="listing-meta">' + (l.beds ?? "?") + " bd &middot; " + (l.baths ?? "?") + " ba &middot; " + (l.sqft ? l.sqft.toLocaleString() : "?") + " sqft</div>" +
          '<span class="listing-cta">View Details &rarr;</span>' +
        "</div>" +
      "</article>"
    );
  }

  function setGridState(grid, html) {
    grid.innerHTML = html;
  }

  function fetchListings(params) {
    var qs = Object.keys(params)
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); })
      .join("&");
    return fetch("/api/listings" + (qs ? "?" + qs : ""))
      .then(function (res) {
        if (!res.ok) throw new Error("Listing search failed (" + res.status + ")");
        return res.json();
      });
  }

  function renderGrid(grid, params) {
    setGridState(grid, '<p class="listing-loading">Loading listings&hellip;</p>');
    fetchListings(params)
      .then(function (data) {
        var listings = data.listings || [];
        if (!listings.length) {
          setGridState(grid, '<p class="listing-empty">No matching listings right now &mdash; try a different search.</p>');
          return;
        }
        setGridState(grid, listings.map(listingCardHtml).join(""));
        if (data.source === "spark") {
          grid.insertAdjacentHTML(
            "afterend",
            '<p class="idx-attribution">Listing data provided by IDX via Flexmls. Information deemed reliable but not guaranteed.</p>'
          );
        }
      })
      .catch(function (err) {
        console.error("[listings] fetch failed:", err);
        setGridState(grid, '<p class="listing-error">We couldn&rsquo;t load listings right now. Please call us at (602) 910-2498.</p>');
      });
  }

  function renderListings() {
    var grids = document.querySelectorAll(".listing-grid");
    grids.forEach(function (grid) {
      renderGrid(grid, {
        community: grid.getAttribute("data-community") || undefined,
        limit: grid.getAttribute("data-limit") || undefined
      });
    });
  }

  /* ---------- Lead capture / mock CRM sync ---------- */
  var LEADS_KEY = "az_relo_leads";

  function logLead(lead) {
    lead.capturedAt = new Date().toISOString();
    try {
      var existing = JSON.parse(localStorage.getItem(LEADS_KEY) || "[]");
      existing.push(lead);
      localStorage.setItem(LEADS_KEY, JSON.stringify(existing));
    } catch (e) {
      /* localStorage unavailable (e.g. private browsing) - lead still captured in-session */
    }

    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead)
    })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        console.log("[CRM sync]", result.synced ? "synced to Follow Up Boss" : "logged (not synced)", lead, result);
      })
      .catch(function (err) {
        console.error("[CRM sync] lead POST failed (still saved locally in this browser):", err);
      });
  }

  /* ---------- Sticky header state (for potential shrink-on-scroll styling hooks) ---------- */
  var header = document.getElementById("site-header");
  var lastScrollY = window.scrollY;
  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    if (header) header.classList.toggle("is-scrolled", y > 10);
    lastScrollY = y;
  }, { passive: true });

  /* ---------- Mobile nav toggle ---------- */
  var navToggle = document.getElementById("nav-toggle");
  if (navToggle && header) {
    navToggle.addEventListener("click", function () {
      var isOpen = header.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    document.querySelectorAll(".main-nav a").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- IDX search (soft registration gate after interaction) ---------- */
  var idxForm = document.getElementById("idx-search-form");
  var gateOverlay = document.getElementById("gate-modal-overlay");
  var gateClose = document.getElementById("gate-modal-close");
  var gateSkip = document.getElementById("gate-modal-skip");
  var gateForm = document.getElementById("gate-form");
  var listingViewCount = 0;
  var GATE_THRESHOLD = 3;

  function openModal(overlay) {
    if (overlay) overlay.classList.remove("is-hidden");
  }
  function closeModal(overlay) {
    if (overlay) overlay.classList.add("is-hidden");
  }

  /* ---------- Listing detail modal ---------- */
  var listingModalOverlay = document.getElementById("listing-modal-overlay");
  var listingModalBody = document.getElementById("listing-modal-body");
  var listingModalClose = document.getElementById("listing-modal-close");

  function listingDetailHtml(l) {
    var photo = "";
    if (l.photoUrl) {
      photo = '<img src="' + escapeHtml(l.photoUrl) + '" alt="' + escapeHtml(l.address) + '">';
    } else if (l.illustrationUrl) {
      photo = '<img class="listing-illustration" src="' + escapeHtml(l.illustrationUrl) + '" alt="Illustration of a home in this style">';
    }
    return (
      '<div class="listing-detail-photo">' + photo + "</div>" +
      '<h3 id="listing-modal-title">' + formatPrice(l.price) + "</h3>" +
      '<p class="listing-detail-address">' + escapeHtml(l.address) + "</p>" +
      '<p class="listing-detail-meta">' + (l.beds ?? "?") + " bd &middot; " + (l.baths ?? "?") + " ba &middot; " + (l.sqft ? l.sqft.toLocaleString() : "?") + " sqft</p>" +
      '<button type="button" class="btn btn-primary" id="listing-showing-btn">Request a Showing</button>' +
      '<form class="listing-showing-form is-hidden" id="listing-showing-form" data-address="' + escapeHtml(l.address) + '">' +
        '<input type="text" placeholder="Full Name" required>' +
        '<input type="email" placeholder="Email" required>' +
        '<input type="tel" placeholder="Phone" required>' +
        '<button type="submit" class="btn btn-primary">Send Request</button>' +
      "</form>"
    );
  }

  function openListingDetail(id) {
    if (!id || !listingModalOverlay) return;
    listingModalBody.innerHTML = '<p class="listing-loading">Loading&hellip;</p>';
    openModal(listingModalOverlay);
    fetch("/api/listings/" + encodeURIComponent(id))
      .then(function (res) {
        if (!res.ok) throw new Error("Listing not found (" + res.status + ")");
        return res.json();
      })
      .then(function (listing) {
        listingModalBody.innerHTML = listingDetailHtml(listing);
      })
      .catch(function (err) {
        console.error("[listing detail] fetch failed:", err);
        listingModalBody.innerHTML = '<p class="listing-error">We couldn&rsquo;t load this listing. Please call us at (602) 910-2498.</p>';
      });
  }

  if (listingModalClose) listingModalClose.addEventListener("click", function () { closeModal(listingModalOverlay); });
  if (listingModalOverlay) {
    listingModalOverlay.addEventListener("click", function (e) {
      if (e.target === listingModalOverlay) closeModal(listingModalOverlay);
    });
  }
  if (listingModalBody) {
    listingModalBody.addEventListener("click", function (e) {
      if (e.target.id === "listing-showing-btn") {
        e.target.classList.add("is-hidden");
        var form = document.getElementById("listing-showing-form");
        if (form) form.classList.remove("is-hidden");
      }
    });
    listingModalBody.addEventListener("submit", function (e) {
      var form = e.target.closest("#listing-showing-form");
      if (!form) return;
      e.preventDefault();
      var inputs = form.querySelectorAll("input");
      logLead({
        type: "showing_request",
        address: form.getAttribute("data-address"),
        name: inputs[0].value.trim(),
        email: inputs[1].value.trim(),
        phone: inputs[2].value.trim()
      });
      listingModalBody.innerHTML = "<h3>Request Sent!</h3><p>A Relocation Expert Arizona agent will reach out shortly to schedule your showing.</p>";
    });
  }

  if (idxForm) {
    idxForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var query = document.getElementById("idx-search-input").value.trim();
      var minBeds = idxForm.querySelector('input[name="beds"]').checked ? 3 : undefined;
      var pool = idxForm.querySelector('input[name="pool"]').checked;
      var newOnly = idxForm.querySelector('input[name="new"]').checked;

      logLead({ type: "idx_search", query: query || "(all homes)", minBeds: minBeds, pool: pool, newOnly: newOnly });

      var resultsGrid = document.getElementById("listing-grid");
      if (resultsGrid) {
        renderGrid(resultsGrid, { q: query || undefined, minBeds: minBeds, pool: pool, newOnly: newOnly });
      }
      document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
    });
  }

  document.addEventListener("click", function (e) {
    var card = e.target.closest(".listing-card");
    if (!card) return;
    listingViewCount += 1;
    if (listingViewCount >= GATE_THRESHOLD) {
      openModal(gateOverlay);
    } else {
      openListingDetail(card.getAttribute("data-id"));
    }
  });

  if (gateClose) gateClose.addEventListener("click", function () { closeModal(gateOverlay); });
  if (gateSkip) gateSkip.addEventListener("click", function () { closeModal(gateOverlay); });
  if (gateOverlay) {
    gateOverlay.addEventListener("click", function (e) {
      if (e.target === gateOverlay) closeModal(gateOverlay);
    });
  }
  if (gateForm) {
    gateForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var inputs = gateForm.querySelectorAll("input");
      logLead({ type: "soft_registration", name: inputs[0].value, email: inputs[1].value });
      closeModal(gateOverlay);
    });
  }

  var saveSearchBtn = document.getElementById("save-search-btn");
  if (saveSearchBtn) {
    saveSearchBtn.addEventListener("click", function () {
      openModal(gateOverlay);
    });
  }

  /* ---------- Home valuation tool (address-first partial capture) ---------- */
  var valuationForm = document.getElementById("valuation-form");
  var step1 = document.getElementById("valuation-step-1");
  var step2 = document.getElementById("valuation-step-2");
  var stepSuccess = document.getElementById("valuation-step-success");
  var continueBtn = document.getElementById("valuation-continue");
  var addressInput = document.getElementById("valuation-address");

  function estimateValue(address) {
    var hash = 0;
    for (var i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
    var base = 420000 + (hash % 480000);
    return Math.round(base / 1000) * 1000;
  }

  if (continueBtn) {
    continueBtn.addEventListener("click", function () {
      if (!addressInput.value.trim()) {
        addressInput.focus();
        return;
      }
      // Partial capture: log the address-only lead immediately, even if the
      // visitor abandons before completing step 2.
      logLead({ type: "valuation_partial", address: addressInput.value.trim() });
      step1.classList.add("is-hidden");
      step2.classList.remove("is-hidden");
      document.getElementById("valuation-name").focus();
    });
  }

  if (valuationForm) {
    valuationForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var address = addressInput.value.trim();
      var name = document.getElementById("valuation-name").value.trim();
      var email = document.getElementById("valuation-email").value.trim();
      var phone = document.getElementById("valuation-phone").value.trim();

      // Belt-and-suspenders: native `required` validation only checks
      // fields that are currently rendered, which is normally correct here
      // since step 1 is hidden by the time step 2 submits — but don't rely
      // on that alone for a flow whose entire purpose is capturing contact
      // info to hand off to the CRM.
      if (!name || !email || !phone) {
        var firstEmpty = !name ? document.getElementById("valuation-name")
          : !email ? document.getElementById("valuation-email")
          : document.getElementById("valuation-phone");
        firstEmpty.focus();
        return;
      }

      logLead({ type: "valuation_complete", address: address, name: name, email: email, phone: phone });

      var estimate = estimateValue(address);
      var low = Math.round((estimate * 0.95) / 1000) * 1000;
      var high = Math.round((estimate * 1.05) / 1000) * 1000;
      document.getElementById("valuation-result-text").textContent =
        "Estimated value for " + address + ": " + formatPrice(low) + " – " + formatPrice(high) + ".";

      var cmaLink = document.getElementById("valuation-cma-link");
      if (cmaLink) {
        var cmaParams = ["address", "name", "email", "phone"].map(function (key) {
          return key + "=" + encodeURIComponent({ address: address, name: name, email: email, phone: phone }[key]);
        }).join("&");
        cmaLink.href = "/cma?" + cmaParams;
      }

      step2.classList.add("is-hidden");
      stepSuccess.classList.remove("is-hidden");
    });
  }

  /* ---------- Lead magnet form ---------- */
  var leadMagnetForm = document.getElementById("lead-magnet-form");
  if (leadMagnetForm) {
    leadMagnetForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = leadMagnetForm.querySelector("input[type=email]").value.trim();
      logLead({ type: "lead_magnet", email: email });
      var btn = leadMagnetForm.querySelector("button");
      btn.textContent = "Sent! Check your inbox.";
      btn.disabled = true;
    });
  }

  /* ---------- Video modal ---------- */
  var videoModalOverlay = document.getElementById("video-modal-overlay");
  var videoModalTitle = document.getElementById("video-modal-title");
  var videoModalBody = document.getElementById("video-modal-body");
  var videoModalClose = document.getElementById("video-modal-close");

  function closeVideoModal() {
    closeModal(videoModalOverlay);
    if (videoModalBody) videoModalBody.innerHTML = "";
  }

  function openVideoModal(title, src) {
    if (!videoModalOverlay) return;
    videoModalTitle.textContent = title;
    videoModalBody.innerHTML = '<p class="listing-loading">Loading&hellip;</p>';
    openModal(videoModalOverlay);

    var video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.muted = true; // required by browser autoplay policy; these clips are silent aerial footage anyway
    video.loop = true;
    video.playsInline = true;
    video.className = "video-player";

    // Offer both formats via <source> — the browser tries each in order and
    // only fires `error` on the <video> itself once every source has failed.
    var webmSource = document.createElement("source");
    webmSource.src = src.replace(/\.mp4$/, ".webm");
    webmSource.type = "video/webm";
    var mp4Source = document.createElement("source");
    mp4Source.src = src;
    mp4Source.type = "video/mp4";
    video.appendChild(webmSource);
    video.appendChild(mp4Source);

    video.addEventListener("loadedmetadata", function () {
      videoModalBody.innerHTML = "";
      videoModalBody.appendChild(video);
    });
    video.addEventListener("error", function () {
      videoModalBody.innerHTML =
        '<div class="video-coming-soon">' +
          '<p><strong>Video coming soon.</strong></p>' +
          '<p>We&rsquo;re still producing this one &mdash; check back shortly or call us at (602) 910-2498.</p>' +
        "</div>";
    });
    video.load();
  }

  document.addEventListener("click", function (e) {
    var thumb = e.target.closest(".video-thumb");
    if (!thumb) return;
    var title = thumb.getAttribute("data-video-title") || "this video";
    var src = thumb.getAttribute("data-video-src");
    logLead({ type: "video_engagement", title: title });
    if (src) openVideoModal(title, src);
  });

  if (videoModalClose) videoModalClose.addEventListener("click", closeVideoModal);
  if (videoModalOverlay) {
    videoModalOverlay.addEventListener("click", function (e) {
      if (e.target === videoModalOverlay) closeVideoModal();
    });
  }

  /* ---------- Exit-intent popup ---------- */
  var exitOverlay = document.getElementById("exit-modal-overlay");
  var exitClose = document.getElementById("exit-modal-close");
  var exitShown = false;

  document.addEventListener("mouseout", function (e) {
    if (exitShown) return;
    if (e.clientY > 0) return;
    if (!e.relatedTarget && !e.toElement) {
      exitShown = true;
      openModal(exitOverlay);
    }
  });

  if (exitClose) exitClose.addEventListener("click", function () { closeModal(exitOverlay); });
  if (exitOverlay) {
    exitOverlay.addEventListener("click", function (e) {
      if (e.target === exitOverlay) closeModal(exitOverlay);
    });
    var exitCta = document.getElementById("exit-modal-cta");
    if (exitCta) exitCta.addEventListener("click", function () { closeModal(exitOverlay); });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeModal(exitOverlay);
      closeModal(gateOverlay);
      closeModal(listingModalOverlay);
      closeVideoModal();
    }
  });

  /* ---------- Community grid (homepage teaser cards) ---------- */
  function renderCommunityGrid() {
    var grid = document.getElementById("community-grid");
    if (!grid) return;
    fetch("/api/communities")
      .then(function (res) {
        if (!res.ok) throw new Error("Community list failed (" + res.status + ")");
        return res.json();
      })
      .then(function (communities) {
        grid.innerHTML = communities.map(function (c) {
          return (
            '<a class="community-card" href="/community/' + escapeHtml(c.slug) + '">' +
              '<span class="community-name">' + escapeHtml(c.name) + "</span>" +
              '<span class="community-meta">Median: ' + escapeHtml(c.median) + " &middot; " + escapeHtml(c.active) + " active listings</span>" +
            "</a>"
          );
        }).join("");
      })
      .catch(function (err) {
        console.error("[communities] fetch failed:", err);
        grid.innerHTML = '<p class="listing-error">Couldn&rsquo;t load neighborhoods right now.</p>';
      });
  }

  /* ---------- Video thumbnail posters ---------- */
  function loadVideoPosters() {
    document.querySelectorAll(".video-thumb[data-video-src]").forEach(function (thumb) {
      var src = thumb.getAttribute("data-video-src");
      var posterUrl = src.replace(/\.mp4$/, "-poster.jpg");
      var img = new Image();
      img.onload = function () {
        thumb.style.backgroundImage = "url('" + posterUrl + "')";
      };
      // no onerror handler needed: thumb keeps its CSS gradient background if the poster 404s
      img.src = posterUrl;
    });
  }

  /* ---------- Init ---------- */
  renderListings();
  renderCommunityGrid();
  loadVideoPosters();
})();
