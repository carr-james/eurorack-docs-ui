/**
 * Collector Cache Extension for Antora
 *
 * Provides hash-based change detection for collector commands to skip
 * regeneration when source files haven't changed.
 *
 * @see https://docs.antora.org/antora/latest/extend/extension-tutorial/
 * @see https://docs.antora.org/collector-extension/latest/
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const EXTENSION_NAME = 'collector-cache-extension'
const DEFAULT_HASH_DIR = '.cache/antora/collector-cache'

/**
 * Register the collector cache extension
 */
module.exports.register = function () {
  const logger = this.getLogger(EXTENSION_NAME)

  // Track entries for hash cache updates after build
  const cacheEntries = []

  /**
   * Main event: Process collector-cache configuration before collector runs
   */
  this.once('contentAggregated', ({ contentAggregate, playbook }) => {
    logger.info('Processing collector-cache configuration')

    for (const { name: componentName, origins } of contentAggregate) {
      for (const origin of origins) {
        const cacheConfig = origin.descriptor.ext?.collectorCache

        if (!cacheConfig) {
          logger.debug(`No collector-cache configuration for ${componentName}`)
          continue
        }

        // Determine worktree path
        // For local builds: origin.worktree is the local path
        // For remote builds: need to construct the collector worktree path
        let worktree
        if (origin.worktree) {
          worktree = origin.worktree
        } else {
          // Construct collector worktree path: .cache/antora/collector/{name}@{refname}-{refhash}
          const collectorCacheDir = path.join(playbook.dir, playbook.runtime.cacheDir || '.cache/antora', 'collector')
          const refname = origin.branch || origin.tag || 'HEAD'
          const refhash = origin.refhash || ''
          worktree = path.join(collectorCacheDir, `${componentName}@${refname}-${refhash}`)
        }

        if (!worktree) {
          logger.warn(`Cannot determine worktree for ${componentName}`)
          continue
        }

        // Handle both array (direct entries) and object (with entries property) formats
        const entries = Array.isArray(cacheConfig) ? cacheConfig : cacheConfig.entries

        if (!entries || !Array.isArray(entries)) {
          logger.warn(`collector-cache configuration must be an array of entries`)
          continue
        }

        // Get hashDir from config if it's an object, otherwise use default
        const hashDir = (cacheConfig.hashDir || DEFAULT_HASH_DIR)
        const componentHashDir = path.join(playbook.dir, hashDir, componentName)

        logger.debug(`Processing ${entries.length} entries for ${componentName}`)

        // Initialize collector array if needed
        if (!origin.descriptor.ext.collector) {
          origin.descriptor.ext.collector = []
        }

        for (const entry of entries) {
          const { run, scan } = entry

          if (!run || !run.key || !run.sources || !run.cacheDir) {
            logger.warn(`Skipping invalid entry (missing run.key, run.sources, or run.cacheDir)`)
            continue
          }

          const { key, sources, cacheDir, command } = run

          try {
            // Compute current hashes
            const currentHashes = computeHashes(worktree, sources)

            // Load cached hashes
            const cachedHashes = loadHashCache(componentHashDir, key, logger)

            // Check if outputs exist
            const outputsExist = checkOutputsExist(worktree, cacheDir, logger)

            // Decide whether to skip execution
            const forceRun = process.env.FORCE_COLLECTOR === 'true'
            const shouldSkip = !forceRun &&
                              hashesMatch(currentHashes, cachedHashes) &&
                              outputsExist

            if (shouldSkip) {
              logger.info(`Cache HIT for ${componentName}/${key} - skipping execution`)
              // Register scan-only (collect existing files)
              if (scan) {
                origin.descriptor.ext.collector.push({ scan })
              }
            } else {
              const reason = forceRun ? 'FORCE_COLLECTOR=true' :
                           !outputsExist ? 'outputs missing' :
                           !cachedHashes ? 'no cache' : 'source files changed'
              logger.info(`Cache MISS for ${componentName}/${key} (${reason}) - will execute`)

              // Register full entry (run + scan)
              origin.descriptor.ext.collector.push({ run, scan })

              // Track for cache update after build
              cacheEntries.push({
                componentName,
                componentHashDir,
                key,
                sources,
                worktree,
                currentHashes
              })
            }
          } catch (error) {
            logger.error(`Error processing entry ${componentName}/${key}: ${error.message}`)
            logger.debug(error.stack)
            // On error, run the command to be safe
            origin.descriptor.ext.collector.push({ run, scan })
          }
        }
      }
    }
  })

  /**
   * After build: Update hash cache for entries that were executed
   */
  this.on('beforePublish', ({ playbook }) => {
    logger.info(`Updating hash cache for ${cacheEntries.length} entries`)

    for (const entry of cacheEntries) {
      try {
        updateHashCache(
          entry.componentHashDir,
          entry.key,
          entry.currentHashes,
          logger
        )
      } catch (error) {
        logger.error(`Failed to update cache for ${entry.componentName}/${entry.key}: ${error.message}`)
      }
    }
  })
}

/**
 * Compute SHA-256 hashes for source files
 * @param {string} worktree - Worktree directory path
 * @param {string[]} sources - Source file paths (relative to worktree)
 * @returns {Object} Hash map { filepath: hash }
 */
function computeHashes (worktree, sources) {
  const hashes = {}

  for (const source of sources) {
    const filePath = path.join(worktree, source)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Source file not found: ${source}`)
    }

    const content = fs.readFileSync(filePath)
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    hashes[source] = hash
  }

  return hashes
}

/**
 * Load cached hashes from disk
 * @param {string} componentHashDir - Component hash directory
 * @param {string} key - Cache key
 * @param {Object} logger - Logger instance
 * @returns {Object|null} Cached hash map or null if not found
 */
function loadHashCache (componentHashDir, key, logger) {
  const cacheFile = path.join(componentHashDir, `${key}.json`)

  if (!fs.existsSync(cacheFile)) {
    logger.debug(`No cache file found: ${cacheFile}`)
    return null
  }

  try {
    const content = fs.readFileSync(cacheFile, 'utf8')
    const cache = JSON.parse(content)
    return cache.sources || null
  } catch (error) {
    logger.warn(`Failed to read cache file ${cacheFile}: ${error.message}`)
    return null
  }
}

/**
 * Compare current hashes with cached hashes
 * @param {Object} current - Current hash map
 * @param {Object|null} cached - Cached hash map
 * @returns {boolean} True if hashes match
 */
function hashesMatch (current, cached) {
  if (!cached) return false

  const currentKeys = Object.keys(current).sort()
  const cachedKeys = Object.keys(cached).sort()

  // Check if same files are tracked
  if (currentKeys.length !== cachedKeys.length) return false
  if (!currentKeys.every((key, i) => key === cachedKeys[i])) return false

  // Check if hashes match
  return currentKeys.every(key => current[key] === cached[key])
}

/**
 * Check if output directory exists and contains files
 * @param {string} worktree - Worktree directory path
 * @param {string} cacheDir - Output directory path (relative to worktree)
 * @param {Object} logger - Logger instance
 * @returns {boolean} True if outputs exist
 */
function checkOutputsExist (worktree, cacheDir, logger) {
  const outputPath = path.join(worktree, cacheDir)

  if (!fs.existsSync(outputPath)) {
    logger.debug(`Output directory does not exist: ${cacheDir}`)
    return false
  }

  try {
    const stat = fs.statSync(outputPath)
    if (!stat.isDirectory()) {
      logger.debug(`Output path is not a directory: ${cacheDir}`)
      return false
    }

    // Check if directory contains files (recursive check)
    const hasFiles = checkDirectoryHasFiles(outputPath)
    if (!hasFiles) {
      logger.debug(`Output directory is empty: ${cacheDir}`)
      return false
    }

    return true
  } catch (error) {
    logger.debug(`Error checking output directory ${cacheDir}: ${error.message}`)
    return false
  }
}

/**
 * Recursively check if directory contains any files
 * @param {string} dirPath - Directory path
 * @returns {boolean} True if directory contains files
 */
function checkDirectoryHasFiles (dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isFile()) {
      return true
    }
    if (entry.isDirectory()) {
      const hasFiles = checkDirectoryHasFiles(path.join(dirPath, entry.name))
      if (hasFiles) return true
    }
  }

  return false
}

/**
 * Update hash cache on disk
 * @param {string} componentHashDir - Component hash directory
 * @param {string} key - Cache key
 * @param {Object} hashes - Hash map to save
 * @param {Object} logger - Logger instance
 */
function updateHashCache (componentHashDir, key, hashes, logger) {
  // Ensure directory exists
  fs.mkdirSync(componentHashDir, { recursive: true })

  const cacheFile = path.join(componentHashDir, `${key}.json`)
  const cacheData = {
    sources: hashes,
    timestamp: new Date().toISOString()
  }

  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8')
  logger.debug(`Updated cache file: ${cacheFile}`)
}
