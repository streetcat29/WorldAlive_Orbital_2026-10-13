/* Local theme preference only. Article text and exercises do not depend on JS. */
(function () {
  'use strict';
  var root = document.documentElement;
  var theme = 'dark';
  try { theme = localStorage.getItem('wp_theme') === 'light' ? 'light' : 'dark'; } catch (_) {}
  root.setAttribute('data-theme', theme);
  function label() {
    var button = document.getElementById('learn-theme');
    if (!button) return;
    button.textContent = root.getAttribute('data-theme') === 'light' ? 'Use night theme' : 'Use day theme';
  }
  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('learn-theme');
    if (!button) return;
    button.hidden = false;
    label();
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('wp_theme', next); } catch (_) {}
      label();
    });
  });
  window.addEventListener('storage', function (event) {
    if (event.key !== 'wp_theme') return;
    root.setAttribute('data-theme', event.newValue === 'light' ? 'light' : 'dark');
    label();
  });
}());
