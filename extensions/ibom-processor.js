'use strict'

const CUSTOM_THEME = `
/* Eurorack Docs UI Theme Overrides - Applied by ibom-processor extension */
.dark.topmostdiv {
  background-color: #1a1a1a;
  color: #e8e8e8;
}

/* Font customization - JetBrains Mono matching Antora UI */
html, body, .topmostdiv {
  font-family: 'JetBrains Mono', 'Consolas', 'DejaVu Sans Mono', monospace;
}

.bom, .fileinfo {
  font-family: 'JetBrains Mono', 'Consolas', 'DejaVu Sans Mono', monospace;
}

.menu-content {
  min-width: 350px;
}

.menu-label {
  font-size: 10pt !important;
}

.fileinfo .title {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  letter-spacing: -0.02em;
}

/* Dark mode table styling */
.dark .bom th {
  background-color: #2a2a2a;
  border-bottom: 2px solid #b87333;
  color: #d4a574;
}

.dark .bom tr:nth-child(even) {
  background-color: #242424;
}

.dark .bom tr.highlighted:nth-child(n) {
  background-color: #ffd760;
  color: #151515;
}
`

const MARKER = '/* Eurorack Docs UI Theme Overrides'

module.exports.register = function ({ config }) {
  const logger = this.getLogger('ibom-processor')

  this.on('contentClassified', ({ contentCatalog }) => {
    logger.info('Processing iBOM files...')

    let processedCount = 0
    let skippedCount = 0

    // Find all attachments with ibom in the path and .html extension
    contentCatalog.findBy({ family: 'attachment' }).forEach((attachment) => {
      // Check if this is an iBOM HTML file
      if (!attachment.src.path.includes('/ibom/') || !attachment.src.basename.endsWith('.html')) {
        return
      }

      // Convert contents to string
      let html = attachment.contents.toString()

      // Check if already customized
      if (html.includes(MARKER)) {
        logger.debug(`Skipping ${attachment.src.basename} - already customized`)
        skippedCount++
        return
      }

      // Check if file has expected structure
      if (!html.includes('</style>')) {
        logger.warn(`Skipping ${attachment.src.basename} - no </style> tag found`)
        skippedCount++
        return
      }

      // Inject custom CSS before closing style tag
      html = html.replace('</style>', CUSTOM_THEME + '\n</style>')

      // Update attachment contents
      attachment.contents = Buffer.from(html)

      logger.info(`Customized ${attachment.src.basename}`)
      processedCount++
    })

    if (processedCount > 0 || skippedCount > 0) {
      logger.info(`Processed ${processedCount} iBOM file(s), skipped ${skippedCount}`)
    } else {
      logger.info('No iBOM files found to process')
    }
  })
}
