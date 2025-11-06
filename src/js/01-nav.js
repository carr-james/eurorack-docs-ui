;(function () {
  'use strict'
  /* global localStorage */

  var SECT_CLASS_RX = /^sect(\d)$/

  var navContainer = document.querySelector('.nav-container')
  var navToggle = document.querySelector('.nav-toggle')
  if (!navContainer && (!navToggle || (navToggle.hidden = true))) return
  var nav = navContainer.querySelector('.nav')
  var navMenuToggle = navContainer.querySelector('.nav-menu-toggle')

  navToggle.addEventListener('click', showNav)
  navContainer.addEventListener('click', trapEvent)

  var menuPanel = navContainer.querySelector('[data-panel=menu]')
  if (!menuPanel) return
  var explorePanel = navContainer.querySelector('[data-panel=explore]')

  // Add unique IDs to all nav items
  var navItemCounter = 0
  find(menuPanel, '.nav-item').forEach(function (item) {
    item.setAttribute('data-nav-id', 'nav-item-' + navItemCounter++)
  })

  var currentPageItem = menuPanel.querySelector('.is-current-page')
  var originalPageItem = currentPageItem

  if (currentPageItem) {
    activateCurrentPath(currentPageItem)
    scrollItemToMidpoint(menuPanel, currentPageItem.querySelector('.nav-link'))
  } else {
    menuPanel.scrollTop = 0
  }

  // Restore expanded state from localStorage (after activateCurrentPath and adding IDs)
  try {
    var expandedState = JSON.parse(localStorage.getItem('nav-expanded-items') || '[]')
    expandedState.forEach(function (navId) {
      var navItem = menuPanel.querySelector('[data-nav-id="' + navId + '"]')
      if (navItem && navItem.classList.contains('nav-item')) {
        navItem.classList.add('is-active')
      }
    })
  } catch (e) {
    console.error('Error restoring nav state:', e)
  }

  find(menuPanel, '.nav-item-toggle').forEach(function (btn) {
    var li = btn.parentElement
    btn.addEventListener('click', toggleActive.bind(li))
    var navItemSpan = findNextElement(btn, '.nav-text')
    if (navItemSpan) {
      navItemSpan.style.cursor = 'pointer'
      navItemSpan.addEventListener('click', toggleActive.bind(li))
    }
  })

  if (navMenuToggle && menuPanel.querySelector('.nav-item-toggle')) {
    navMenuToggle.style.display = ''

    // Set navMenuToggle state based on whether any items are expanded (use setTimeout to run after restore)
    setTimeout(function () {
      var hasExpandedItems = menuPanel.querySelector('.nav-item.is-active')
      if (hasExpandedItems) {
        navMenuToggle.classList.add('is-active')
      }
    }, 0)

    navMenuToggle.addEventListener('click', function () {
      var collapse = !this.classList.toggle('is-active')
      find(menuPanel, '.nav-item > .nav-item-toggle').forEach(function (btn) {
        collapse ? btn.parentElement.classList.remove('is-active') : btn.parentElement.classList.add('is-active')
      })
      if (currentPageItem) {
        if (collapse) activateCurrentPath(currentPageItem)
        scrollItemToMidpoint(menuPanel, currentPageItem.querySelector('.nav-link'))
      } else {
        menuPanel.scrollTop = 0
      }
      saveExpandedState()
    })
  }

  if (explorePanel) {
    explorePanel.querySelector('.context').addEventListener('click', function () {
      // NOTE logic assumes there are only two panels
      find(nav, '[data-panel]').forEach(function (panel) {
        panel.classList.toggle('is-active')
      })
    })
  }

  // NOTE prevent text from being selected by double click
  menuPanel.addEventListener('mousedown', function (e) {
    if (e.detail > 1) e.preventDefault()
  })

  var userClickedNavLink = false

  function onHashChange () {
    var navLink
    var hash = window.location.hash
    if (hash) {
      if (hash.indexOf('%')) hash = decodeURIComponent(hash)
      navLink = menuPanel.querySelector('.nav-link[href="' + hash + '"]')
      if (!navLink) {
        var targetNode = document.getElementById(hash.slice(1))
        if (targetNode) {
          var current = targetNode
          var ceiling = document.querySelector('article.doc')
          while ((current = current.parentNode) && current !== ceiling) {
            var id = current.id
            // NOTE: look for section heading
            if (!id && (id = SECT_CLASS_RX.test(current.className))) id = (current.firstElementChild || {}).id
            if (id && (navLink = menuPanel.querySelector('.nav-link[href="#' + id + '"]'))) break
          }
        }
      }
    }
    var navItem
    if (navLink) {
      navItem = navLink.parentNode
    } else if (originalPageItem) {
      navLink = (navItem = originalPageItem).querySelector('.nav-link')
    } else {
      return
    }
    if (navItem === currentPageItem) return
    find(menuPanel, '.nav-item.is-current-page, .nav-item.is-current-path').forEach(function (el) {
      el.classList.remove('is-current-path', 'is-current-page')
    })
    navItem.classList.add('is-current-page')
    currentPageItem = navItem
    activateCurrentPath(navItem)
    // Only scroll nav-panel to midpoint if user didn't click a nav-link
    if (!userClickedNavLink) {
      scrollItemToMidpoint(menuPanel, navLink)
    }
    userClickedNavLink = false
  }

  if (menuPanel.querySelector('.nav-link[href^="#"]')) {
    // Add click listeners to nav-links to prevent nav-panel autoscroll
    find(menuPanel, '.nav-link[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function () {
        userClickedNavLink = true
      })
    })
    if (window.location.hash) onHashChange()
    window.addEventListener('hashchange', onHashChange)
  }

  function activateCurrentPath (navItem) {
    var ancestorClasses
    var ancestor = navItem.parentNode
    while (!(ancestorClasses = ancestor.classList).contains('nav-menu')) {
      if (ancestor.tagName === 'LI' && ancestorClasses.contains('nav-item')) {
        ancestorClasses.add('is-active', 'is-current-path')
      }
      ancestor = ancestor.parentNode
    }
    navItem.classList.add('is-active')
  }

  function saveExpandedState () {
    var expanded = find(menuPanel, '.nav-item.is-active')
      .map(function (item) {
        return item.getAttribute('data-nav-id')
      })
      .filter(function (id) { return id })
    localStorage.setItem('nav-expanded-items', JSON.stringify(expanded))
  }

  function toggleActive () {
    if (this.classList.toggle('is-active')) {
      var padding = parseFloat(window.getComputedStyle(this).marginTop)
      var rect = this.getBoundingClientRect()
      var menuPanelRect = menuPanel.getBoundingClientRect()
      var overflowY = (rect.bottom - menuPanelRect.top - menuPanelRect.height + padding).toFixed()
      if (overflowY > 0) menuPanel.scrollTop += Math.min((rect.top - menuPanelRect.top - padding).toFixed(), overflowY)
    }
    saveExpandedState()
  }

  function showNav (e) {
    if (navToggle.classList.contains('is-active')) return hideNav(e)
    trapEvent(e)
    var html = document.documentElement
    html.classList.add('is-clipped--nav')
    navToggle.classList.add('is-active')
    navContainer.classList.add('is-active')
    var bounds = nav.getBoundingClientRect()
    var expectedHeight = window.innerHeight - Math.round(bounds.top)
    if (Math.round(bounds.height) !== expectedHeight) nav.style.height = expectedHeight + 'px'
    html.addEventListener('click', hideNav)
  }

  function hideNav (e) {
    trapEvent(e)
    var html = document.documentElement
    html.classList.remove('is-clipped--nav')
    navToggle.classList.remove('is-active')
    navContainer.classList.remove('is-active')
    html.removeEventListener('click', hideNav)
  }

  function trapEvent (e) {
    e.stopPropagation()
  }

  function scrollItemToMidpoint (panel, el) {
    var rect = panel.getBoundingClientRect()
    var effectiveHeight = rect.height
    var navStyle = window.getComputedStyle(nav)
    if (navStyle.position === 'sticky') effectiveHeight -= rect.top - parseFloat(navStyle.top)
    panel.scrollTop = Math.max(0, (el.getBoundingClientRect().height - effectiveHeight) * 0.5 + el.offsetTop)
  }

  function find (from, selector) {
    return [].slice.call(from.querySelectorAll(selector))
  }

  function findNextElement (from, selector) {
    var el = from.nextElementSibling
    return el && selector ? el[el.matches ? 'matches' : 'msMatchesSelector'](selector) && el : el
  }
})()
