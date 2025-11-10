// SimpleLightbox integration for expandable images
(function () {
  // Wait for both DOM and SimpleLightbox to be ready
  function initLightbox () {
    // Check if SimpleLightbox is loaded
    if (typeof SimpleLightbox === 'undefined') {
      console.error('SimpleLightbox not loaded')
      return
    }

    console.log('Initializing SimpleLightbox...')

    // Only process images with .expandable class
    const expandableImages = document.querySelectorAll('.imageblock.expandable')
    console.log('Found ' + expandableImages.length + ' expandable images')

    expandableImages.forEach(function (imageblock) {
      const img = imageblock.querySelector('img')
      if (!img) return

      // Wrap image in a link for SimpleLightbox
      const link = document.createElement('a')
      link.href = img.src
      link.classList.add('lightbox-gallery')
      link.setAttribute('title', img.alt || '')
      link.style.cssText = 'position:relative;display:block;cursor:pointer;'

      // Add expandable class for styling
      link.classList.add('lightbox-expandable')

      // Insert link wrapper
      img.parentNode.insertBefore(link, img)
      link.appendChild(img)

      // Add expand icon overlay INSIDE the link
      const icon = document.createElement('div')
      icon.innerHTML = '⤢' // Expand icon
      icon.className = 'lightbox-expand-icon'
      icon.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.7);' +
        'color:white;padding:0 8px;border-radius:4px;font-size:20px;' +
        'pointer-events:none;opacity:0.7;transition:opacity 0.2s;z-index:1;'
      link.appendChild(icon)
    })

    // Initialize SimpleLightbox with selector string
    console.log('About to initialize SimpleLightbox...')

    // eslint-disable-next-line no-undef
    var gallery = new SimpleLightbox('.lightbox-gallery', {
      // Enable scroll wheel zoom (default is true)
      scrollZoom: true,
      // Zoom factor for scroll wheel (default is 0.5)
      scrollZoomFactor: 0.5,
      // Enable keyboard navigation
      nav: true,
      // Enable captions
      captions: true,
      captionPosition: 'bottom',
      // Close on overlay click
      closeOnOverlayClick: true,
      // Enable history
      history: false,
      // Animation speed
      animationSpeed: 250,
      // Show counter
      showCounter: true,
      // Enable swipe on mobile
      swipeClose: true,
      // Disable right click
      disableRightClick: false,
    })

    console.log('SimpleLightbox initialized:', gallery)
    console.log('Gallery elements:', gallery.elements)

    // Manually add click handlers as backup
    document.querySelectorAll('.lightbox-gallery').forEach(function (link, index) {
      console.log('Adding click handler to link', index)
      link.onclick = function (e) {
        e.preventDefault()
        console.log('Link clicked!', this.href)
        gallery.open(this)
        return false
      }
    })
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox)
  } else {
    initLightbox()
  }
})()
