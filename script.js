const slides = [...document.querySelectorAll(".hero-slide")];
const dots = [...document.querySelectorAll(".hero-dots button")];
const current = document.querySelector("#slide-current");
let activeSlide = 0;
let carouselTimer;

function showSlide(index) {
  activeSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle("active", i === activeSlide));
  dots.forEach((dot, i) => dot.classList.toggle("active", i === activeSlide));
  current.textContent = String(activeSlide + 1).padStart(2, "0");
}

function restartCarousel() {
  clearInterval(carouselTimer);
  carouselTimer = setInterval(() => showSlide(activeSlide + 1), 5500);
}

document.querySelector("#hero-prev").addEventListener("click", () => {
  showSlide(activeSlide - 1);
  restartCarousel();
});

document.querySelector("#hero-next").addEventListener("click", () => {
  showSlide(activeSlide + 1);
  restartCarousel();
});

dots.forEach((dot) => dot.addEventListener("click", () => {
  showSlide(Number(dot.dataset.slide));
  restartCarousel();
}));

restartCarousel();
