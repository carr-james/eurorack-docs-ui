;(function () {
  'use strict'

  var article = document.querySelector('article.doc')
  if (!article) return
  var toolbar = document.querySelector('.toolbar')
  var main = document.querySelector('main.article')
  var supportsScrollToOptions = 'scrollTo' in document.documentElement

  function decodeFragment (hash) {
    return hash && (~hash.indexOf('%') ? decodeURIComponent(hash) : hash).slice(1)
  }

  function computePosition (el, sum) {
    return article.contains(el) ? computePosition(el.offsetParent, el.offsetTop + sum) : sum
  }

  function jumpToAnchor (e) {
    if (e) {
      if (e.altKey || e.ctrlKey) return
      e.preventDefault()
    }

    var y = computePosition(this, 0) - toolbar.getBoundingClientRect().bottom
    var instant = e === false && supportsScrollToOptions

    // On desktop, main.article is the scroll container (has overflow-y: auto)
    // On mobile, window is the scroll container
    if (main && window.getComputedStyle(main).overflowY === 'auto') {
      // Desktop: scroll the article container
      if (instant && 'scrollTo' in main) {
        main.scrollTo({ left: 0, top: y, behavior: 'instant' })
      } else {
        main.scrollTop = y
      }
    } else {
      // Mobile: scroll the window
      instant ? window.scrollTo({ left: 0, top: y, behavior: 'instant' }) : window.scrollTo(0, y)
    }

    // Update hash using replaceState to avoid triggering browser scroll
    if (e && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + this.id)
    }
  }

  window.addEventListener('load', function jumpOnLoad (e) {
    var fragment, target
    if ((fragment = decodeFragment(window.location.hash)) && (target = document.getElementById(fragment))) {
      jumpToAnchor.call(target, false)
      setTimeout(jumpToAnchor.bind(target, false), 250)
    }
    window.removeEventListener('load', jumpOnLoad)
  })

  Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]')).forEach(function (el) {
    var fragment, target
    if ((fragment = decodeFragment(el.hash)) && (target = document.getElementById(fragment))) {
      el.addEventListener('click', jumpToAnchor.bind(target))
    }
  })
})()
