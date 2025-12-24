(() => {
  const FOOTER_COPY_HTML = `© 2025 Cool Bits SRL · Iași, RO · powered by cbLM.ai <span class="footer-mobile-extra">· orchestrated by <a href="https://camarad.ai" target="_blank" rel="noopener">Camarad</a> · backed by <a href="https://stripe.com" target="_blank" rel="noopener">Stripe</a></span>`;

  const DEFAULT_NAV = [
    { href: "/", label: "Home" },
    { href: "/legal/privacy", label: "Privacy" },
    { href: "/legal/terms", label: "Terms" },
    { href: "/contact", label: "Contact" },
    { href: "/chat", label: "Go to Chat" },
  ];

  function buildNavHtml(links) {
    const safeLinks = Array.isArray(links) ? links : DEFAULT_NAV;
    const items = safeLinks
      .filter((item) => item && typeof item.href === "string" && typeof item.label === "string")
      .map((item) => ({
        href: item.href.trim(),
        label: item.label.trim(),
      }))
      .filter((item) => item.href && item.label);

    if (!items.length) return "";

    return items
      .map((item, idx) => {
        const sep = idx === 0 ? "" : ` <span aria-hidden="true">·</span> `;
        return `${sep}<a href="${item.href}">${item.label}</a>`;
      })
      .join("");
  }

  function injectFooter() {
    if (window.location?.pathname?.startsWith("/chat")) {
      return;
    }

    const hosts = Array.from(document.querySelectorAll("[data-cb-footer]"));
    if (!hosts.length) return;

    hosts.forEach((host) => {
      if (!host || host.dataset.cbFooterMounted === "true") return;
      host.classList.add("site-footer");
      host.innerHTML = `
        <nav class="footer-nav" aria-label="Site">
          ${buildNavHtml(DEFAULT_NAV)}
        </nav>
        <p>${FOOTER_COPY_HTML}</p>
      `.trim();
      host.dataset.cbFooterMounted = "true";
    });
  }

  window.injectFooter = injectFooter;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectFooter, { once: true });
  } else {
    injectFooter();
  }
})();

