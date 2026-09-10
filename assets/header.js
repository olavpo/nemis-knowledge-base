// Toggles the two collapsed header panels (nav -> hamburger below 600px,
// search -> icon below 840px; see assets/style.css). Both toggles share the
// same below-the-bar slot, so opening one closes the other.
(() => {
  const navBtn = document.getElementById("nav-toggle");
  const searchBtn = document.getElementById("search-toggle");
  const nav = document.getElementById("site-nav");
  const search = document.getElementById("search");
  if (!navBtn || !searchBtn || !nav || !search) return;

  const isOpen = (panel) => panel.classList.contains("is-open");

  function close(panel, btn) {
    panel.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }

  function toggle(panel, btn, other, otherBtn) {
    if (isOpen(panel)) {
      close(panel, btn);
      btn.focus();
      return;
    }
    close(other, otherBtn);
    panel.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    if (panel === search) {
      const input = search.querySelector("input");
      if (input) input.focus();
    }
  }

  navBtn.addEventListener("click", () => toggle(nav, navBtn, search, searchBtn));
  searchBtn.addEventListener("click", () => toggle(search, searchBtn, nav, navBtn));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isOpen(nav)) { close(nav, navBtn); navBtn.focus(); }
    else if (isOpen(search)) { close(search, searchBtn); searchBtn.focus(); }
  });
})();
