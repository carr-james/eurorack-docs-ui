;(function () {
  'use strict'
  /* global localStorage */

  var navCollapseBtn = document.querySelector('.nav-collapse')
  if (!navCollapseBtn) return

  var body = document.querySelector('.body')

  // Check localStorage for saved state
  var isCollapsed = localStorage.getItem('nav-collapsed') === 'true'
  if (isCollapsed) {
    body.classList.add('nav-is-collapsed')
  }

  navCollapseBtn.addEventListener('click', function (e) {
    e.stopPropagation()
    body.classList.toggle('nav-is-collapsed')
    var collapsed = body.classList.contains('nav-is-collapsed')
    localStorage.setItem('nav-collapsed', collapsed)
  })
})()
