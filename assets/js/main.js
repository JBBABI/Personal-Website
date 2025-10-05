// main.js

// update footer year
function updateYear() {
    const el = document.getElementById("year");
    if (el) el.textContent = new Date().getFullYear();
  }
  
  // show one language and hide the other
  function setLang(lang) {
    const enNodes = document.querySelectorAll(".lang-en");
    const frNodes = document.querySelectorAll(".lang-fr");
    const btnEN = document.getElementById("btnEN");
    const btnFR = document.getElementById("btnFR");
  
  if (lang === "fr") {
      enNodes.forEach(n => n.style.display = "none");
      frNodes.forEach(n => n.style.display = "inline");
      if (btnEN && btnFR) {
        btnEN.setAttribute("aria-pressed", "false");
        btnFR.setAttribute("aria-pressed", "true");
      }
      localStorage.setItem("siteLang", "fr");
  } else {
      enNodes.forEach(n => n.style.display = "inline");
      frNodes.forEach(n => n.style.display = "none");
      if (btnEN && btnFR) {
        btnEN.setAttribute("aria-pressed", "true");
        btnFR.setAttribute("aria-pressed", "false");
      }
      localStorage.setItem("siteLang", "en");
    }
  }
  
  // detect user's country for language preference
  async function detectCountry() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      return data.country_code;
    } catch (error) {
      console.log('Geolocation detection failed, using browser language');
      return null;
    }
  }

  // guess language on first load
  async function initLang() {
    const stored = localStorage.getItem("siteLang");
    if (stored) {
      setLang(stored);
      return;
    }

    // Try geolocation first
    const country = await detectCountry();
    if (country === 'FR') {
      setLang("fr");
      return;
    }

    // Fallback to browser language
    const browserIsFr = (navigator.language || "en").toLowerCase().startsWith("fr");
    const startLang = browserIsFr ? "fr" : "en";
    setLang(startLang);
  }
  
  // add active state to current page link
  function markActiveNav() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".navbar .nav-link").forEach(link => {
      try {
        const href = link.getAttribute("href");
        if (!href) return;
        const file = href.split("/").pop();
        if (file === path) {
          link.setAttribute("aria-current", "page");
        }
      } catch (e) {}
    });
  }
  
  document.addEventListener("DOMContentLoaded", async () => {
    updateYear();
    await initLang();
    markActiveNav();
  
    const btnEN = document.getElementById("btnEN");
    const btnFR = document.getElementById("btnFR");
    if (btnEN) btnEN.addEventListener("click", () => setLang("en"));
    if (btnFR) btnFR.addEventListener("click", () => setLang("fr"));
  });
  