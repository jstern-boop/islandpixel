/* =====================================================================
   ISLAND PIXEL STUDIOS — site script
   Automation-ready: every form on any page that has a data-form="name"
   attribute is sent to EVERY destination listed in CONFIG.destinations.
   Add, remove or swap destinations here; no page needs to change.
   ===================================================================== */
var CONFIG = {
  destinations: [
    /* 0) Google Sheet + thank-you email (built in, free): the "Website form"
          Apps Script attached to the "Island Pixel Studios – Leads" Sheet. */
    { name: "google-sheet", url: "https://script.google.com/macros/s/AKfycbwZ14bp3SFkZRvLg2LXpEiLcB6lXENAKc6pCb89sYHJKJQ9zoh5Qg0RR4pGuAxb2EJM_g/exec", format: "google" },

    /* 1) Email via Web3Forms (free). Paste your access key to turn it on.
          { name: "email", url: "https://api.web3forms.com/submit", format: "form",
            extra: { access_key: "PASTE-KEY-HERE" } }, */

    /* 2) Any webhook that accepts JSON. Works with Make.com, n8n, a Google
          Apps Script web app, a Cloudflare Worker, or a Zapier Catch Hook.
          { name: "automation", url: "https://hook.us1.make.com/xxxxxxxx", format: "json" }, */
  ],
  // Shown when a form is submitted but no destination is set up yet.
  notConnectedMessage: "This form isn't connected yet, so nothing was sent. Please check back soon."
};

(function () {
  "use strict";

  /* ---------- Small helpers ---------- */
  function qs(sel, el) { return (el || document).querySelector(sel); }
  function qsa(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  // Remember where a visitor came from (ad campaign tags, referring site) for this visit.
  var TRACK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
  function visitInfo() {
    var info = {};
    try {
      var params = new URLSearchParams(location.search);
      TRACK_KEYS.forEach(function (k) { if (params.get(k)) sessionStorage.setItem("ips_" + k, params.get(k)); });
      if (!sessionStorage.getItem("ips_landing")) {
        sessionStorage.setItem("ips_landing", location.pathname);
        sessionStorage.setItem("ips_referrer", document.referrer || "");
      }
      TRACK_KEYS.forEach(function (k) { var v = sessionStorage.getItem("ips_" + k); if (v) info[k] = v; });
      info.landing_page = sessionStorage.getItem("ips_landing") || "";
      info.referrer = sessionStorage.getItem("ips_referrer") || "";
    } catch (e) { /* storage blocked: send without visit info */ }
    return info;
  }
  var VISIT = visitInfo();

  // Every meaningful action is announced on the page as an "ips:event".
  // Analytics tags (Google Analytics, Meta Pixel) or a future chat widget can listen for it.
  window.dataLayer = window.dataLayer || [];
  function announce(name, detail) {
    detail = detail || {};
    window.dataLayer.push(Object.assign({ event: name }, detail));
    try { document.dispatchEvent(new CustomEvent("ips:event", { detail: Object.assign({ name: name }, detail) })); } catch (e) {}
  }

  /* ---------- Menu and footer year ---------- */
  var btn = qs(".menu-btn"), nav = qs("#site-nav");
  if (btn && nav) btn.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  var y = qs("#year"); if (y) y.textContent = new Date().getFullYear();

  /* ---------- Clicks worth knowing about ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0) announce("call_click", { number: href.slice(4) });
    else if (href.indexOf("sms:") === 0) announce("text_click", { number: href.slice(4) });
    else if (href.indexOf("mailto:") === 0) announce("email_click", { address: href.slice(7) });
    else if (a.classList.contains("btn")) announce("button_click", { label: a.textContent.trim(), to: href });
  });

  /* ---------- Forms ---------- */
  function collect(form) {
    var data = { form: form.getAttribute("data-form") };
    new FormData(form).forEach(function (v, k) {
      if (k === "botcheck") return;
      data[k] = typeof v === "string" ? v.trim() : v;
    });
    data.page = location.pathname;
    data.page_title = document.title;
    data.submitted_at = new Date().toISOString();
    return Object.assign(data, VISIT);
  }

  function send(dest, data) {
    var body, headers = { Accept: "application/json" };
    var payload = Object.assign({}, dest.extra || {}, data);
    if (dest.format === "google") {
      // Google Apps Script web app: plain-text JSON avoids the browser's extra
      // permission check, which Apps Script can't answer.
      return fetch(dest.url, { method: "POST", body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error(dest.name + " " + (j && j.error));
          return dest.name;
        });
    }
    if (dest.format === "json") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(payload);
    } else {
      body = new FormData();
      Object.keys(payload).forEach(function (k) { body.append(k, payload[k]); });
      if (!payload.subject) body.append("subject", "New " + data.form + " request: " + (data.business || data.name || ""));
    }
    return fetch(dest.url, { method: "POST", headers: headers, body: body }).then(function (r) {
      if (!r.ok) throw new Error(dest.name + " " + r.status);
      return dest.name;
    });
  }

  qsa("form[data-form]").forEach(function (form) {
    var status = qs("[role=status]", form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var trap = form.elements.botcheck;
      if (trap && trap.value) return;

      var missing = qsa("[required]", form).filter(function (el) { return !String(el.value).trim(); });
      var badEmail = qsa("input[type=email]", form).filter(function (el) {
        return el.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      });
      if (!missing.length && badEmail.length) {
        status.textContent = "Please enter an email address like name@example.com.";
        badEmail[0].focus();
        return;
      }
      if (missing.length) {
        status.textContent = "Please fill in: " + missing.map(function (el) {
          return (el.closest("label") ? el.closest("label").firstChild.textContent : el.name).trim();
        }).join(", ") + ".";
        missing[0].focus();
        return;
      }

      var data = collect(form);
      var first = String(data.name || "").split(" ")[0] || "there";
      announce("form_submit", { form: data.form });

      if (!CONFIG.destinations.length) {
        status.textContent = "Thanks, " + first + ". " + CONFIG.notConnectedMessage;
        return;
      }
      status.textContent = "Sending…";
      var tries = CONFIG.destinations.map(function (d) {
        return send(d, data).then(function (n) { return { ok: true, name: n }; }, function () { return { ok: false, name: d.name }; });
      });
      Promise.all(tries).then(function (results) {
        if (results.some(function (r) { return r.ok; })) {
          form.reset();
          status.textContent = "Thanks, " + first + ". Your request is in. Expect to hear from us within a few days.";
          announce("form_sent", { form: data.form });
        } else {
          status.textContent = "That didn't go through. Please try again in a minute.";
        }
      });
    });
  });
})();
