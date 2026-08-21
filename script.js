const slides = [...document.querySelectorAll(".hero-slide")];
const dots = [...document.querySelectorAll(".hero-dots button")];
const current = document.querySelector("#slide-current");
let activeSlide = 0;
let carouselTimer;

// Keep non-visible carousel imagery out of the critical mobile loading path.
function loadDeferredSlides() {
  slides.slice(1).forEach((slide) => {
    if (slide.dataset.slideImage) slide.style.setProperty("--slide-image", `url('${slide.dataset.slideImage}')`);
  });
  if (slides.length) restartCarousel();
}
window.addEventListener("load", () => {
  if ("requestIdleCallback" in window) requestIdleCallback(loadDeferredSlides, { timeout: 2500 });
  else setTimeout(loadDeferredSlides, 1);
}, { once: true });

function showSlide(index) {
  activeSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle("active", i === activeSlide));
  dots.forEach((dot, i) => dot.classList.toggle("active", i === activeSlide));
  if (current) current.textContent = String(activeSlide + 1).padStart(2, "0");
}
function restartCarousel() {
  clearInterval(carouselTimer);
  carouselTimer = setInterval(() => showSlide(activeSlide + 1), 5500);
}
document.querySelector("#hero-prev")?.addEventListener("click", () => { showSlide(activeSlide - 1); restartCarousel(); });
document.querySelector("#hero-next")?.addEventListener("click", () => { showSlide(activeSlide + 1); restartCarousel(); });
dots.forEach((dot) => dot.addEventListener("click", () => { showSlide(Number(dot.dataset.slide)); restartCarousel(); }));

const mobileMenuButton = document.querySelector(".header .menu, .store-header .menu");
let mobileMenuPanel = document.querySelector(".mobile-menu-panel");
if (mobileMenuButton && !mobileMenuPanel) {
  const sourceNavigation = document.querySelector(".header nav, .store-header nav");
  mobileMenuPanel = document.createElement("nav");
  mobileMenuPanel.className = "mobile-menu-panel";
  mobileMenuPanel.setAttribute("aria-label", "Menu de navegação no celular");
  mobileMenuPanel.hidden = true;
  mobileMenuPanel.innerHTML = sourceNavigation?.innerHTML || "";
  mobileMenuButton.closest("header")?.insertAdjacentElement("afterend", mobileMenuPanel);
}
mobileMenuButton?.setAttribute("aria-expanded", "false");
mobileMenuButton?.addEventListener("click", () => {
  if (!mobileMenuPanel) return;
  const willOpen = mobileMenuPanel.hasAttribute("hidden");
  mobileMenuPanel.toggleAttribute("hidden", !willOpen);
  mobileMenuPanel.classList.toggle("open", willOpen);
  mobileMenuButton.setAttribute("aria-expanded", String(willOpen));
  mobileMenuButton.setAttribute("aria-label", willOpen ? "Fechar menu" : "Abrir menu");
});
mobileMenuPanel?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  mobileMenuPanel.setAttribute("hidden", "");
  mobileMenuButton.setAttribute("aria-expanded", "false");
}));

const money = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const getCart = () => JSON.parse(localStorage.getItem("elegance-cart") || "[]");
const saveCart = (cart) => {
  localStorage.setItem("elegance-cart", JSON.stringify(cart));
  document.querySelectorAll(".cart-count").forEach((el) => {
    el.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  });
};
saveCart(getCart());

document.querySelectorAll(".favorite").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  button.classList.toggle("active");
  button.textContent = button.classList.contains("active") ? "♥" : "♡";
}));
document.querySelector(".search-toggle")?.addEventListener("click", () => {
  document.querySelector(".search-panel")?.classList.toggle("open");
  document.querySelector("#product-search")?.focus();
});

const query = new URLSearchParams(location.search);
const category = query.get("categoria");
document.querySelectorAll(".store-header nav a, .category-tabs a").forEach((link) => {
  const linkUrl = new URL(link.getAttribute("href"), location.href);
  const linkCategory = linkUrl.searchParams.get("categoria");
  const isActive = category ? linkCategory === category : !linkCategory;
  link.classList.toggle("active", isActive);
  if (isActive) link.setAttribute("aria-current", "page");
});
if (category) {
  document.querySelectorAll(".catalog-grid article").forEach((card) => {
    card.hidden = !card.dataset.category.split(/\s+/).includes(category);
  });
}
document.querySelector("#product-search")?.addEventListener("input", (event) => {
  const term = event.target.value.toLowerCase();
  document.querySelectorAll(".catalog-grid article").forEach((card) => {
    card.hidden = !card.dataset.name.toLowerCase().includes(term);
  });
});

const products = {
  "brinco-aura": ["Brinco Geométrico Aura", 189.90, "assets/produto-brinco-aura.png"],
  "anel-lumiere": ["Anel Três Aros Lumière", 159.90, "assets/produto-anel-lumiere.png"],
  "colar-elise": ["Colar Ponto de Luz Élise", 219.90, "assets/produto-colar-elise.png"],
  "pulseira-essencia": ["Pulseira Essência", 179.90, "assets/produto-pulseira-essencia.png"]
};
const selected = products[query.get("produto")];
if (selected && document.querySelector("#detail-name")) {
  document.querySelector("#detail-name").textContent = selected[0];
  document.querySelector("#detail-price").textContent = money(selected[1]);
  document.querySelector("#detail-image").src = selected[2];
  const add = document.querySelector(".add-cart");
  add.dataset.product = selected[0];
  add.dataset.price = selected[1];
  add.dataset.image = selected[2];
}

document.querySelectorAll("[data-qty]").forEach((button) => button.addEventListener("click", () => {
  const value = button.parentElement.querySelector("span");
  value.textContent = Math.max(1, Number(value.textContent) + Number(button.dataset.qty));
}));
let personalizationUpload = null;
let personalizationObjectUrl = null;
const personalizationInput = document.querySelector("#engraving-image");
const engravingInput = document.querySelector("#engraving-text");
const personalizationMessage = document.querySelector(".personalization-message");
const personalizationPreview = document.querySelector(".personalization-preview");
const livePersonalization = document.querySelector(".live-personalization");
const liveEngravingText = document.querySelector(".live-engraving-text");
const liveEngravingImage = document.querySelector(".live-engraving-image");
function updateLivePersonalization() {
  if (!livePersonalization || !liveEngravingText || !liveEngravingImage) return;
  const text = engravingInput?.value.trim() || "";
  liveEngravingText.textContent = text;
  liveEngravingText.hidden = !text;
  livePersonalization.hidden = !text && !personalizationObjectUrl;
}
engravingInput?.addEventListener("input", updateLivePersonalization);
personalizationInput?.addEventListener("change", async () => {
  const file = personalizationInput.files?.[0];
  personalizationUpload = null;
  if (personalizationObjectUrl) URL.revokeObjectURL(personalizationObjectUrl);
  personalizationObjectUrl = null;
  liveEngravingImage.hidden = true;
  liveEngravingImage.removeAttribute("src");
  if (!file) { liveEngravingImage.hidden = true; liveEngravingImage.removeAttribute("src"); updateLivePersonalization(); return; }
  if (file.size > 5 * 1024 * 1024) { personalizationMessage.textContent = "A imagem deve ter no máximo 5 MB."; personalizationInput.value = ""; updateLivePersonalization(); return; }
  personalizationObjectUrl = URL.createObjectURL(file);
  liveEngravingImage.src = personalizationObjectUrl;
  liveEngravingImage.hidden = false;
  updateLivePersonalization();
  const add = document.querySelector(".add-cart");
  const data = new FormData(); data.append("product_id", add?.dataset.id || ""); data.append("image", file);
  personalizationMessage.textContent = "Enviando a imagem com segurança…";
  personalizationInput.disabled = true;
  try {
    const response = await fetch("/api/personalization/upload", { method: "POST", body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || "Não foi possível enviar a imagem.");
    personalizationUpload = result.upload;
    personalizationPreview.querySelector("img").src = personalizationObjectUrl;
    personalizationPreview.querySelector("b").textContent = file.name;
    personalizationPreview.hidden = false; personalizationMessage.textContent = "Imagem pronta para a fotogravação.";
  } catch (error) { personalizationMessage.textContent = error.message; personalizationInput.value = ""; }
  finally { personalizationInput.disabled = false; }
});
personalizationPreview?.querySelector("button")?.addEventListener("click", () => {
  personalizationUpload = null; personalizationInput.value = ""; personalizationPreview.hidden = true; personalizationMessage.textContent = "";
  if (personalizationObjectUrl) URL.revokeObjectURL(personalizationObjectUrl);
  personalizationObjectUrl = null; liveEngravingImage.hidden = true; liveEngravingImage.removeAttribute("src"); updateLivePersonalization();
});
document.querySelector(".add-cart")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const qty = Number(document.querySelector(".quantity span")?.textContent || 1);
  const engravingText = document.querySelector("#engraving-text")?.value.trim() || "";
  if (button.dataset.personalizable === "true" && personalizationInput?.files?.length && !personalizationUpload) {
    personalizationMessage.textContent = "Aguarde a conclusão do envio da imagem."; return;
  }
  const personalization = button.dataset.personalizable === "true" && (engravingText || personalizationUpload) ? {
    engraving_text: engravingText || undefined, image_upload_id: personalizationUpload?.id || undefined, image_name: personalizationUpload?.name || undefined,
  } : null;
  const cart = getCart();
  const personalizationKey = JSON.stringify(personalization || {});
  const existing = cart.find((item) => item.name === button.dataset.product && JSON.stringify(item.personalization || {}) === personalizationKey);
  if (existing) {
    existing.qty += qty;
    existing.product_id = Number(button.dataset.id) || existing.product_id || null;
    existing.variant_id = Number(button.dataset.variant) || existing.variant_id || null;
  }
  else cart.push({ name: button.dataset.product, price: Number(button.dataset.price) + (engravingText ? 29.90 : 0) + (personalizationUpload ? 49.90 : 0), image: button.dataset.image, qty,
    product_id: Number(button.dataset.id) || null, variant_id: Number(button.dataset.variant) || null, personalization });
  localStorage.removeItem("elegance-coupon");
  saveCart(cart);
  button.textContent = "Adicionado à sacola ✓";
  setTimeout(() => { button.textContent = "Adicionar à sacola"; }, 1800);
});

function renderCart() {
  const container = document.querySelector("#cart-items");
  if (!container) return;
  const cart = getCart();
  const safe = value => String(value || "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  container.innerHTML = cart.map((item, index) => `<article class="cart-item"><img src="${item.image}" alt="${item.name}"><div><h3>${item.name}</h3><p>Quantidade: ${item.qty}</p>${item.personalization?.engraving_text?`<p class="cart-personalization"><b>Gravação:</b> ${safe(item.personalization.engraving_text)}</p>`:""}${item.personalization?.image_name?`<p class="cart-personalization"><b>Foto:</b> ${safe(item.personalization.image_name)}</p>`:""}<button data-remove="${index}">Remover</button></div><strong>${money(item.price * item.qty)}</strong></article>`).join("");
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const subtotalCents = Math.round(subtotal * 100);
  const savedCoupon = JSON.parse(localStorage.getItem("elegance-coupon") || "null");
  const discountCents = savedCoupon?.subtotal_cents === subtotalCents ? Number(savedCoupon.discount_cents) || 0 : 0;
  document.querySelector("#cart-subtotal").textContent = money(subtotal);
  document.querySelector("#cart-total").textContent = money((subtotalCents - discountCents) / 100);
  const discountRow = document.querySelector(".coupon-discount");
  if (discountRow) { discountRow.hidden = !discountCents; document.querySelector("#cart-discount").textContent = `− ${money(discountCents / 100)}`; }
  const couponInput = document.querySelector("#cart-coupon"); if (couponInput && savedCoupon?.code) couponInput.value = savedCoupon.code;
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
    cart.splice(Number(button.dataset.remove), 1);
    localStorage.removeItem("elegance-coupon");
    saveCart(cart);
    renderCart();
  }));
}
renderCart();

document.querySelector("#apply-coupon")?.addEventListener("click", async () => {
  const button = document.querySelector("#apply-coupon"), input = document.querySelector("#cart-coupon"), feedback = document.querySelector(".coupon-message");
  const code = input.value.trim().toUpperCase(), cart = getCart();
  if (!code) { feedback.textContent = "Digite o código do cupom."; return; }
  button.disabled = true; button.textContent = "Validando…"; feedback.textContent = "";
  try {
    const items = cart.map(item => ({ product_id:Number(item.product_id), variant_id:Number(item.variant_id), quantity:Number(item.qty), personalization:item.personalization || undefined }));
    const response = await fetch("/api/coupons/validate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ code, items }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || "Cupom inválido.");
    localStorage.setItem("elegance-coupon", JSON.stringify({ code:result.coupon.code, discount_cents:result.coupon.discount_cents, subtotal_cents:result.subtotal_cents }));
    feedback.textContent = `Cupom aplicado: você economizou ${money(result.coupon.discount_cents / 100)}.`;
    renderCart();
  } catch (error) { localStorage.removeItem("elegance-coupon"); feedback.textContent = error.message; renderCart(); }
  finally { button.disabled = false; button.textContent = "Aplicar"; }
});

let checkoutStep = 1;
function updateCheckout() {
  document.querySelectorAll(".checkout-form>section").forEach((section) => {
    section.hidden = Number(section.dataset.step) !== checkoutStep;
  });
  document.querySelectorAll(".checkout-steps li").forEach((step, index) => {
    step.classList.toggle("active", index < checkoutStep);
  });
  const next = document.querySelector(".step-next");
  if (next) next.textContent = checkoutStep === 3 ? "Confirmar pedido" : "Continuar";
  document.querySelector(".checkout-actions")?.toggleAttribute("hidden", checkoutStep === 4);
}
window.eleganceCheckout = {
  get step() { return checkoutStep; },
  next() { checkoutStep = Math.min(4, checkoutStep + 1); updateCheckout(); },
  back() { checkoutStep = Math.max(1, checkoutStep - 1); updateCheckout(); },
};
updateCheckout();

document.querySelector(".review-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = event.currentTarget.querySelector(".review-feedback");
  feedback.textContent = "Obrigada! Sua avaliação foi registrada para esta apresentação.";
  event.currentTarget.reset();
});

document.querySelector(".tracking-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  event.currentTarget.querySelector(".tracking-feedback").textContent = "Código recebido. O acompanhamento real será ativado com a integração do back-end.";
});
