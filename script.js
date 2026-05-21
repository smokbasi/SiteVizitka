(function () {
  const telegramUrl = `https://t.me/${TELEGRAM_USERNAME.replace(/^@/, "")}`;

  document.querySelectorAll("#btn-telegram, #btn-telegram-2").forEach((el) => {
    el.href = telegramUrl;
  });

  document.querySelectorAll(".contact-phone").forEach((el) => {
    el.href = `tel:${PHONE_TEL}`;
    el.textContent = PHONE_DISPLAY;
  });

  document.getElementById("year").textContent = new Date().getFullYear();

  // ── Scroll reveal ──
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const delay = entry.target.dataset.delay || 0;
          setTimeout(() => entry.target.classList.add("visible"), delay);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

  // ── Hero parallax ──
  const heroPhoto = document.querySelector(".hero__photo");
  if (heroPhoto && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      if (y < window.innerHeight) {
        heroPhoto.style.transform = `translateY(${y * 0.28}px)`;
      }
    }, { passive: true });
  }

  // ── Modal ──
  const modal = document.getElementById("beta-modal");
  const form = document.getElementById("beta-form");
  const formError = document.getElementById("form-error");

  function openModal() {
    modal.classList.add("modal--open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    const firstInput = form.querySelector("input");
    if (firstInput) setTimeout(() => firstInput.focus(), 300);
  }

  function closeModal() {
    modal.classList.remove("modal--open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    formError.hidden = true;
  }

  document.querySelectorAll("#btn-beta, #btn-beta-2").forEach((btn) => {
    btn.addEventListener("click", openModal);
  });

  modal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("modal--open")) {
      closeModal();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = (data.get("name") || "").toString().trim();
    const company = (data.get("company") || "").toString().trim();
    const contact = (data.get("contact") || "").toString().trim();

    if (!name || !company || !contact) {
      formError.hidden = false;
      return;
    }

    formError.hidden = true;

    const text = [
      "Заявка на бета DoubleMark",
      "",
      `Имя: ${name}`,
      `Компания: ${company}`,
      `Контакт: ${contact}`,
    ].join("\n");

    const url = `${telegramUrl}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    form.reset();
    closeModal();
  });
})();
