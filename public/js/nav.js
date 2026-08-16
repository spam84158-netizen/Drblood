// ==================== Theme (partagé entre toutes les pages) ====================
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeToggleUI(next);
}
function updateThemeToggleUI(theme) {
  const icon = document.getElementById("navThemeIcon");
  if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
}
initTheme();

// ==================== Icônes sociales (SVG génériques, pas les logos officiels) ====================
const SOCIAL_ICONS = {
  telegram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 3 2 11l6 2.5M22 3 15 21l-7-7.5M22 3 8 13.5"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21l1.7-4.9A8.5 8.5 0 1 1 8.4 20L3 21Z"/><path d="M8.5 9.5c0 3.5 2.5 6 6 6"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5.5" width="19" height="13" rx="3"/><path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none"/></svg>`,
};

function socialLinksHTML() {
  const s = window.APP_CONFIG.social;
  return `
    <a class="social-icon" href="${s.telegram}" target="_blank" rel="noopener noreferrer" aria-label="Telegram" title="Telegram">${SOCIAL_ICONS.telegram}</a>
    <a class="social-icon" href="${s.whatsapp}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" title="WhatsApp">${SOCIAL_ICONS.whatsapp}</a>
    <a class="social-icon" href="${s.youtube}" target="_blank" rel="noopener noreferrer" aria-label="YouTube" title="YouTube">${SOCIAL_ICONS.youtube}</a>
  `;
}

// ==================== Navbar ====================
function renderNavbar() {
  const root = document.getElementById("nav-root");
  if (!root) return;

  const page = document.body.dataset.page || "";
  const cfg = window.APP_CONFIG;
  const theme = document.documentElement.getAttribute("data-theme");

  const navLink = (href, label, key) =>
    `<a href="${href}" class="nav-link ${page === key ? "active" : ""}">${label}</a>`;

  root.innerHTML = `
    <nav class="navbar">
      <a href="/" class="navbar-brand">
        <span class="brand-mark">${cfg.brandName}</span>
      </a>
      <div class="navbar-links">
        ${navLink("/chat.html", "Chat", "chat")}
        ${navLink("/stats.html", "Statistiques", "stats")}
        ${navLink("/settings.html", "Paramètres", "settings")}
      </div>
      <div class="navbar-right">
        <div class="social-icons">${socialLinksHTML()}</div>
        <button id="navThemeToggle" class="btn-icon" aria-label="Changer de thème" title="Changer de thème">
          <span id="navThemeIcon">${theme === "dark" ? "☀️" : "🌙"}</span>
        </button>
      </div>
    </nav>
  `;

  document.getElementById("navThemeToggle").addEventListener("click", toggleTheme);
}

// ==================== Footer ====================
function renderFooter() {
  const root = document.getElementById("footer-root");
  if (!root) return;

  const cfg = window.APP_CONFIG;
  const year = new Date().getFullYear();

  root.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="brand-mark small">${cfg.brandName}</span>
          <p>Créé par <strong>${cfg.creator}</strong> — © ${year} ${cfg.company}</p>
        </div>
        <div class="footer-links">
          <a href="/chat.html">Chat</a>
          <a href="/stats.html">Statistiques</a>
          <a href="/settings.html">Paramètres</a>
          <a href="/terms.html">Conditions d'utilisation</a>
        </div>
        <div class="social-icons">${socialLinksHTML()}</div>
      </div>
    </footer>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  renderNavbar();
  renderFooter();
});
