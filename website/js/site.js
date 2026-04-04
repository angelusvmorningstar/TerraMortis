/**
 * site.js — scroll reveal, nav active state, expression-of-interest form.
 */

// Scroll reveal
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  });
}, { threshold: 0.07 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Nav active state on scroll
const navLinks = document.querySelectorAll('.nav-a');
const secs = ['pitch', 'portal', 'cta'].map(id => document.getElementById(id));
window.addEventListener('scroll', () => {
  let cur = '';
  secs.forEach(s => { if (s && window.scrollY >= s.offsetTop - 130) cur = s.id; });
  navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
}, { passive: true });

