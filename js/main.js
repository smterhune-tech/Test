(function () {
  "use strict";

  /* ---------- Mock IDX listing data ---------- */
  var LISTINGS = [
    { price: 725000, address: "1420 Rio Grande St, Austin, TX", beds: 3, baths: 2, sqft: 1850, community: "downtown-austin", badge: "New" },
    { price: 549900, address: "2208 Toro Grande Dr, Cedar Park, TX", beds: 4, baths: 3, sqft: 2410, community: "cedar-park", badge: null },
    { price: 1650000, address: "3312 Redbud Trail, Austin, TX", beds: 5, baths: 4, sqft: 4120, community: "westlake-hills", badge: "Price Reduced" },
    { price: 615000, address: "908 Elizabeth St, Austin, TX", beds: 2, baths: 2, sqft: 1420, community: "south-congress", badge: "New" },
    { price: 489000, address: "1104 Sunset Ridge Dr, Cedar Park, TX", beds: 3, baths: 2, sqft: 2010, community: "cedar-park", badge: null },
    { price: 899000, address: "610 W 6th St #802, Austin, TX", beds: 2, baths: 2, sqft: 1580, community: "downtown-austin", badge: null }
  ];

  function formatPrice(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function renderListings() {
    var grids = document.querySelectorAll(".listing-grid");
    grids.forEach(function (grid) {
      var community = grid.getAttribute("data-community");
      var items = community ? LISTINGS.filter(function (l) { return l.community === community; }) : LISTINGS;
      if (!items.length) items = LISTINGS.slice(0, 3);

      grid.innerHTML = items.map(function (l) {
        return (
          '<article class="listing-card" data-address="' + l.address + '">' +
            '<div class="listing-photo">' + (l.badge ? '<span class="listing-badge">' + l.badge + "</span>" : "") + "Photo</div>" +
            '<div class="listing-body">' +
              '<div class="listing-price">' + formatPrice(l.price) + "</div>" +
              '<div class="listing-address">' + l.address + "</div>" +
              '<div class="listing-meta">' + l.beds + " bd &middot; " + l.baths + " ba &middot; " + l.sqft.toLocaleString() + " sqft</div>" +
              '<span class="listing-cta">View Details &rarr;</span>' +
            "</div>" +
          "</article>"
        );
      }).join("");
    });
  }

  /* ---------- Lead capture / mock CRM sync ---------- */
  var LEADS_KEY = "terhune_leads";

  function logLead(lead) {
    lead.capturedAt = new Date().toISOString();
    try {
      var existing = JSON.parse(localStorage.getItem(LEADS_KEY) || "[]");
      existing.push(lead);
      localStorage.setItem(LEADS_KEY, JSON.stringify(existing));
    } catch (e) {
      /* localStorage unavailable (e.g. private browsing) - lead still captured in-session */
    }
    console.log("[CRM sync] New lead captured, auto-response queued:", lead);
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
  var gateShown = false;

  function openModal(overlay) {
    if (overlay) overlay.classList.remove("is-hidden");
  }
  function closeModal(overlay) {
    if (overlay) overlay.classList.add("is-hidden");
  }

  if (idxForm) {
    idxForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var query = document.getElementById("idx-search-input").value.trim();
      logLead({ type: "idx_search", query: query || "(all homes)" });
      document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
    });
  }

  document.addEventListener("click", function (e) {
    var card = e.target.closest(".listing-card");
    if (!card) return;
    listingViewCount += 1;
    if (listingViewCount >= GATE_THRESHOLD && !gateShown) {
      gateShown = true;
      openModal(gateOverlay);
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

      logLead({ type: "valuation_complete", address: address, name: name, email: email, phone: phone });

      var estimate = estimateValue(address);
      var low = Math.round((estimate * 0.95) / 1000) * 1000;
      var high = Math.round((estimate * 1.05) / 1000) * 1000;
      document.getElementById("valuation-result-text").textContent =
        "Estimated value for " + address + ": " + formatPrice(low) + " – " + formatPrice(high) + ".";

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

  /* ---------- Video card click (placeholder) ---------- */
  document.addEventListener("click", function (e) {
    var thumb = e.target.closest(".video-thumb");
    if (!thumb) return;
    var title = thumb.getAttribute("data-video-title") || "this video";
    logLead({ type: "video_engagement", title: title });
  });

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
    }
  });

  /* ---------- Init ---------- */
  renderListings();
})();
