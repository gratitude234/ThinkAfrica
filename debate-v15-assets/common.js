(function () {
  const toast = document.querySelector("[data-toast]");
  let toastTimer = null;

  window.showDebateToast = function (message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  };

  document.querySelectorAll("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        window.showDebateToast("Debate link copied.");
      } catch {
        window.showDebateToast("Copy unavailable. Use the browser address bar.");
      }
    });
  });

  document.querySelectorAll("[data-mobile-menu]").forEach((button) => {
    button.addEventListener("click", () => {
      const menu = document.querySelector("[data-mobile-nav]");
      if (!menu) return;
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      menu.classList.toggle("is-open", !open);
    });
  });

  document.querySelectorAll("[data-upvote]").forEach((button) => {
    button.addEventListener("click", () => {
      const active = button.getAttribute("aria-pressed") === "true";
      const count = Number(button.dataset.count || "0") + (active ? -1 : 1);
      button.setAttribute("aria-pressed", String(!active));
      button.dataset.count = String(Math.max(0, count));
      button.querySelector("span").textContent = String(Math.max(0, count));
    });
  });

  document.querySelectorAll("[data-deadline]").forEach((node) => {
    const minutes = Number(node.dataset.deadline || "0");
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    let remaining = minutes * 60;
    const draw = () => {
      const hours = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      const secs = remaining % 60;
      node.textContent = hours > 0
        ? `${hours}h ${String(mins).padStart(2, "0")}m left`
        : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")} left`;
      remaining = Math.max(0, remaining - 1);
    };
    draw();
    window.setInterval(draw, 1000);
  });

  document.querySelectorAll("[data-dialog-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.dialogOpen);
      if (!dialog) return;
      dialog.classList.add("is-open");
      dialog.setAttribute("aria-hidden", "false");
      dialog.querySelector("button, input, textarea")?.focus();
    });
  });

  document.querySelectorAll("[data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = button.closest(".modal-backdrop");
      if (!dialog) return;
      dialog.classList.remove("is-open");
      dialog.setAttribute("aria-hidden", "true");
    });
  });
})();
