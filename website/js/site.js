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
const secs = ['pitch', 'factions', 'onboard', 'tools', 'cta'].map(id => document.getElementById(id));
window.addEventListener('scroll', () => {
  let cur = '';
  secs.forEach(s => { if (s && window.scrollY >= s.offsetTop - 130) cur = s.id; });
  navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
}, { passive: true });

// Expression of interest form (Formspree AJAX)
const form = document.getElementById('interest-form');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = form.querySelector('button[type=submit]');
  btn.textContent = 'Sending\u2026';
  btn.disabled = true;
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      form.querySelector('.cta-fields').style.display = 'none';
      form.querySelector('.cta-form-footer').style.display = 'none';
      document.getElementById('cf-success').style.display = 'block';
    } else {
      btn.textContent = 'Send Expression of Interest';
      btn.disabled = false;
      alert('Something went wrong. Please try again or email us directly.');
    }
  } catch {
    btn.textContent = 'Send Expression of Interest';
    btn.disabled = false;
    alert('Could not send. Please check your connection and try again.');
  }
});
