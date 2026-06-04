// js/loader.js — Loads shared header & footer HTML components into the page

(function () {
  const BASE = (function () {
    const scripts = document.querySelectorAll('script[src*="loader.js"]');
    if (scripts.length) {
      const src = scripts[scripts.length - 1].getAttribute('src');
      const parts = src.split('/');
      parts.pop(); // remove loader.js
      const isPages = window.location.pathname.includes('/pages/');
      return isPages ? '../' : './';
    }
    return './';
  })();

  function loadComponent(id, path, callback) {
    const el = document.getElementById(id);
    if (!el) return callback && callback();
    fetch(BASE + path)
      .then(r => r.text())
      .then(html => {
        el.innerHTML = html;
        // Execute any scripts inside loaded HTML
        el.querySelectorAll('script').forEach(oldScript => {
          const newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(a => newScript.setAttribute(a.name, a.value));
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode.replaceChild(newScript, oldScript);
        });
        callback && callback();
      })
      .catch(err => {
        console.warn('Component load failed:', path, err);
        callback && callback();
      });
  }

  // Load header first, then footer
  loadComponent('header', 'components/header.html', function () {
    // Mark active nav link
    const page = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    document.querySelectorAll('[data-page]').forEach(link => {
      if (link.getAttribute('data-page') === page) {
        link.classList.add('active');
      }
    });

    // Wire theme toggle
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      const saved = localStorage.getItem('cd-theme');
      if (saved === 'light') {
        document.body.classList.add('light-mode');
        toggleBtn.textContent = '☀️';
      }
      toggleBtn.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-mode');
        toggleBtn.textContent = isLight ? '☀️' : '🌙';
        localStorage.setItem('cd-theme', isLight ? 'light' : 'dark');
      });
    }

    // Mobile menu
    const menuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (menuBtn && mobileMenu) {
      menuBtn.addEventListener('click', () => {
        const open = mobileMenu.style.display === 'block';
        mobileMenu.style.display = open ? 'none' : 'block';
        menuBtn.textContent = open ? '☰' : '✕';
      });
    }
  });

  loadComponent('footer', 'components/footer.html', null);
})();
