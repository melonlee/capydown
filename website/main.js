// Slothdown landing page — progressive enhancement only; the page works without it.
(function () {
  'use strict'

  // Hairline under the nav once the page has scrolled.
  var nav = document.querySelector('.nav')
  function onScroll() {
    if (nav) nav.classList.toggle('is-stuck', window.scrollY > 8)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  // Gentle reveal on scroll. Without IntersectionObserver everything is shown at once.
  var items = document.querySelectorAll('.reveal')
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    items.forEach(function (el) { io.observe(el) })
  }
  else {
    items.forEach(function (el) { el.classList.add('is-in') })
  }

  // Editor theme switcher (GitHub / Newsprint / Night).
  document.querySelectorAll('[data-switcher]').forEach(function (root) {
    var tabs = root.querySelectorAll('[role="tab"]')
    var shots = root.querySelectorAll('.stack > img')
    function select(i) {
      tabs.forEach(function (t, j) {
        t.setAttribute('aria-selected', String(i === j))
        t.tabIndex = i === j ? 0 : -1
      })
      shots.forEach(function (s, j) {
        s.classList.toggle('is-on', i === j)
        s.setAttribute('aria-hidden', String(i !== j))
      })
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i) })
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!d) return
        var n = (i + d + tabs.length) % tabs.length
        select(n)
        tabs[n].focus()
      })
    })
  })
})()
