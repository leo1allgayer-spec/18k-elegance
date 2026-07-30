const slides = [...document.querySelectorAll(".hero-slide")];
const dots = [...document.querySelectorAll(".hero-dots button")];
const current = document.querySelector("#slide-current");
let activeSlide = 0;
let carouselTimer;

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
if (slides.length) restartCarousel();

const mobileMenuButton = document.querySelector(".header .menu");
const mobileMenuPanel = document.querySelector(".mobile-menu-panel");
mobileMenuButton?.setAttribute("aria-expanded", "false");
mobileMenuButton?.addEventListener("click", () => {
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
    card.hidden = card.dataset.category !== category;
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
document.querySelector(".add-cart")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const qty = Number(document.querySelector(".quantity span")?.textContent || 1);
  const cart = getCart();
  const existing = cart.find((item) => item.name === button.dataset.product);
  if (existing) existing.qty += qty;
  else cart.push({ name: button.dataset.product, price: Number(button.dataset.price), image: button.dataset.image, qty });
  saveCart(cart);
  button.textContent = "Adicionado à sacola ✓";
  setTimeout(() => { button.textContent = "Adicionar à sacola"; }, 1800);
});

function renderCart() {
  const container = document.querySelector("#cart-items");
  if (!container) return;
  const cart = getCart();
  container.innerHTML = cart.map((item, index) => `<article class="cart-item"><img src="${item.image}" alt="${item.name}"><div><h3>${item.name}</h3><p>Quantidade: ${item.qty}</p><button data-remove="${index}">Remover</button></div><strong>${money(item.price * item.qty)}</strong></article>`).join("");
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.querySelector("#cart-subtotal").textContent = money(total);
  document.querySelector("#cart-total").textContent = money(total);
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
    cart.splice(Number(button.dataset.remove), 1);
    saveCart(cart);
    renderCart();
  }));
}
renderCart();

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
document.querySelector(".step-next")?.addEventListener("click", () => {
  checkoutStep = Math.min(4, checkoutStep + 1);
  updateCheckout();
});
document.querySelector(".text-back")?.addEventListener("click", () => {
  checkoutStep = Math.max(1, checkoutStep - 1);
  updateCheckout();
});
updateCheckout();
