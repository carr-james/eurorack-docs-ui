/**
 * Collector Cache Extension for Antora - Content-Addressable Storage
 *
 * Provides content-addressable caching for collector commands using source file hashes.
 * Automatically deduplicates outputs across different versions when source files match.
 *
 * @see https://docs.antora.org/antora/latest/extend/extension-tutorial/
 * @see https://docs.antora.org/collector-extension/latest/
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const EXTENSION_NAME = 'collector-cache-extension'
const DEFAULT_CACHE_DIR = '.cache/antora/collector-cache'

/**
 * Register the collector cache extension
 */
module.exports.register = function () {
  const logger = this.getLogger(EXTENSION_NAME)

  // Track entries for cache updates after build
  const cacheEntries = []

  /**
   * Main event: Process collector-cache configuration before collector runs
   */
  this.once('contentAggregated', async ({ contentAggregate, playbook }) => {
    const dryRun = process.env.DRY_RUN === 'true'
    logger.info('Processing collector-cache configuration')
    if (dryRun) {
      logger.info('DRY RUN MODE - will exit after cache check')
    }

    // Get git module for updating worktrees
    const git = this.require('@antora/content-aggregator/git')

    for (const { name: componentName, origins } of contentAggregate) {
      for (const origin of origins) {
        const cacheConfig = origin.descriptor.ext?.collectorCache

        if (!cacheConfig) {
          logger.debug(`No collector-cache configuration for ${componentName}`)
          continue
        }

        // Determine worktree path
        let worktree = origin.worktree

        if (!worktree) {
          // For remote builds: find collector worktree directory
          const collectorCacheDir = path.join(playbook.dir, playbook.runtime.cacheDir || '.cache/antora', 'collector')
          const refname = origin.refname || origin.branch || origin.tag || 'HEAD'

          // Extract repository name from URL for worktree prefix
          const url = origin.url || ''
          const repoName = path.basename(url, '.git')
          const worktreePrefix = `${repoName}@${refname}-`

          if (fs.existsSync(collectorCacheDir)) {
            const entries = fs.readdirSync(collectorCacheDir)
            const matchingEntries = entries.filter(e => e.startsWith(worktreePrefix))

            if (matchingEntries.length > 0) {
              const worktreeDirName = matchingEntries[matchingEntries.length - 1]
              worktree = path.join(collectorCacheDir, worktreeDirName)
              logger.debug(`Found worktree: ${worktree}`)
            }
          }
        }

        // Initialize collector array if needed
        if (!origin.descriptor.ext.collector) {
          origin.descriptor.ext.collector = []
        }

        // If no worktree, run all collectors and track for caching (first build)
        if (!worktree) {
          logger.info(`No worktree found for ${componentName} - will run all collectors`)
          const entries = Array.isArray(cacheConfig) ? cacheConfig : cacheConfig.entries
          if (entries && Array.isArray(entries)) {
            logger.info(`Adding ${entries.length} collector entries for ${componentName}`)

            // Determine cache directory and worktree location
            const cacheDir = (cacheConfig.cacheDir || DEFAULT_CACHE_DIR)
            const componentHashDir = path.join(playbook.dir, cacheDir, 'hashes', componentName)
            const collectorCacheDir = path.join(playbook.dir, playbook.runtime.cacheDir || '.cache/antora', 'collector')
            const refname = origin.refname || origin.branch || origin.tag || 'HEAD'

            // Extract repository name from URL for worktree prefix
            const url = origin.url || ''
            const repoName = path.basename(url, '.git')
            const worktreePrefix = `${repoName}@${refname}-`

            for (const entry of entries) {
              const { run, scan } = entry

              // Note: Antora normalizes YAML keys to lowercase, so cacheDir becomes cachedir
              const cachedir = run?.cachedir || run?.cacheDir
              if (!run || !run.key || !run.sources || !cachedir) {
                logger.warn(`Skipping invalid entry (missing run.key, run.sources, or run.cachedir)`)
                logger.debug(`Entry structure: ${JSON.stringify(entry)}`)
                continue
              }

              // Add to collector to run
              origin.descriptor.ext.collector.push(entry)

              // Track for caching after build
              cacheEntries.push({
                componentName,
                componentHashDir,
                key: run.key,
                sources: run.sources,
                collectorCacheDir,
                worktreePrefix,
                outputDir: cachedir,
                sourceHashes: null,
                contentHash: null
              })
            }
          } else {
            logger.warn(`No entries found in cacheConfig for ${componentName}`)
          }
          continue
        }

        // Handle both array and object formats
        const entries = Array.isArray(cacheConfig) ? cacheConfig : cacheConfig.entries

        if (!entries || !Array.isArray(entries)) {
          logger.warn(`collector-cache configuration must be an array of entries`)
          continue
        }

        // Get cache directory
        const cacheDir = (cacheConfig.cacheDir || DEFAULT_CACHE_DIR)
        const componentHashDir = path.join(playbook.dir, cacheDir, 'hashes', componentName)

        logger.debug(`Processing ${entries.length} entries for ${componentName}`)

        for (const entry of entries) {
          const { run, scan } = entry

          // Note: Antora normalizes YAML keys to lowercase, so cacheDir becomes cachedir
          const cachedir = run?.cachedir || run?.cacheDir
          if (!run || !run.key || !run.sources || !cachedir) {
            logger.warn(`Skipping invalid entry (missing run.key, run.sources, or run.cachedir)`)
            continue
          }

          const { key, sources } = run
          const outputDir = cachedir

          try {
            // Check if worktree exists
            if (!fs.existsSync(worktree)) {
              logger.debug(`Worktree does not exist yet for ${componentName}/${key} - cache MISS`)
              origin.descriptor.ext.collector.push(entry)
              cacheEntries.push({
                componentName,
                componentHashDir,
                key,
                sources,
                worktree,
                outputDir,
                sourceHashes: null,
                contentHash: null
              })
              continue
            }

            // Update worktree to current commit before checking files
            if (origin.gitdir && origin.refname && origin.reftype) {
              try {
                // Match collector extension's ref construction (line 128)
                const ref = `refs/${origin.reftype === 'branch' ? 'head' : origin.reftype}s/${origin.refname}`
                const remote = origin.remote || 'origin'
                const bare = false // worktree exists from cache
                const cache = {} // Empty cache object

                logger.debug(`Updating worktree to ${origin.reftype}:${origin.refname}`)

                // Build repo object matching collector extension's prepareWorktree call (line 130)
                const repo = { fs, cache, dir: worktree, gitdir: origin.gitdir, ref, remote, bare }

                // Fetch remote refs first to get latest commits
                logger.debug(`Fetching remote refs for ${remote}`)
                await git.fetch({ ...repo, url: origin.url, remote, singleBranch: false, tags: false })

                // Match prepareWorktree logic for existing worktrees
                let head
                if (ref.startsWith('refs/heads/')) {
                  head = `ref: ${ref}`
                  const branchName = ref.slice(11)
                  if (!(await git.listBranches(repo)).includes(branchName)) {
                    await git.branch({ ...repo, ref: branchName, object: `refs/remotes/${remote}/${branchName}`, force: true })
                  }
                } else {
                  head = await git.resolveRef(repo)
                }

                await git.checkout({ ...repo, force: true, noUpdateHead: true, track: false })
              } catch (err) {
                logger.warn(`Failed to update worktree for ${componentName}/${key}: ${err.message}`)
              }
            }

            // Compute source file hashes
            const sourceHashes = computeHashes(worktree, sources, logger, componentName, key)

            if (sourceHashes === null) {
              logger.debug(`Source files not found for ${componentName}/${key} - cache MISS`)
              origin.descriptor.ext.collector.push(entry)
              cacheEntries.push({
                componentName,
                componentHashDir,
                key,
                sources,
                worktree,
                outputDir,
                sourceHashes: null,
                contentHash: null
              })
              continue
            }

            // Compute content hash from source hashes
            const contentHash = computeContentHash(sourceHashes)

            // Look up pointer file
            const pointerPath = path.join(componentHashDir, key, `${contentHash}.json`)
            const pointer = loadPointerFile(pointerPath, logger)

            // Check if cached outputs exist
            const forceRun = process.env.FORCE_COLLECTOR === 'true'
            let cachedOutputsExist = false

            if (pointer) {
              const cachedOutputPath = path.join(playbook.dir, cacheDir, 'outputs', pointer.outputDir, outputDir)
              cachedOutputsExist = checkOutputsExist(cachedOutputPath, logger)
            }

            const shouldSkip = !forceRun && pointer && cachedOutputsExist

            if (shouldSkip) {
              logger.info(`Cache HIT for ${componentName}/${key} (content: ${contentHash.substring(0, 12)}...)`)

              // Scan from cached outputs
              if (scan) {
                // Handle scan as array or single object
                const scanEntries = Array.isArray(scan) ? scan : [scan]
                const scanConfigs = scanEntries.map(scanEntry => ({
                  dir: path.join(playbook.dir, cacheDir, 'outputs', pointer.outputDir, scanEntry.dir),
                  files: scanEntry.files,
                  into: scanEntry.into
                }))

                origin.descriptor.ext.collector.push({
                  run: {
                    command: 'true'  // No-op
                  },
                  scan: scanConfigs
                })
              }
            } else {
              const reason = forceRun ? 'FORCE_COLLECTOR=true' :
                           !pointer ? 'no cache entry' : 'cached outputs missing'
              logger.info(`Cache MISS for ${componentName}/${key} (${reason})`)

              // Run collector
              origin.descriptor.ext.collector.push({ run, scan })

              // Track for cache update
              cacheEntries.push({
                componentName,
                componentHashDir,
                key,
                sources,
                worktree,
                outputDir,
                sourceHashes,
                contentHash
              })
            }
          } catch (error) {
            logger.error(`Error processing entry ${componentName}/${key}: ${error.message}`)
            logger.debug(error.stack)
            origin.descriptor.ext.collector.push({ run, scan })
          }
        }
      }
    }

    if (dryRun) {
      logger.info('DRY RUN complete - exiting')
      process.exit(0)
    }
  })

  /**
   * After build: Update cache with new outputs
   */
  this.on('beforePublish', ({ playbook }) => {
    logger.info(`Updating cache for ${cacheEntries.length} entries`)

    const cacheDir = DEFAULT_CACHE_DIR

    for (const entry of cacheEntries) {
      try {
        // Determine worktree path if not set
        let worktree = entry.worktree
        if (!worktree && entry.collectorCacheDir && entry.worktreePrefix) {
          // Find the worktree created by collector
          if (fs.existsSync(entry.collectorCacheDir)) {
            const entries = fs.readdirSync(entry.collectorCacheDir)
            const matchingEntries = entries.filter(e => e.startsWith(entry.worktreePrefix))

            if (matchingEntries.length > 0) {
              const worktreeDirName = matchingEntries[matchingEntries.length - 1]
              worktree = path.join(entry.collectorCacheDir, worktreeDirName)
              logger.debug(`Found worktree for caching: ${worktree}`)
            }
          }

          if (!worktree) {
            logger.warn(`Worktree not found for ${entry.componentName}/${entry.key}`)
            continue
          }
        }

        // Compute hashes if not done yet
        let sourceHashes = entry.sourceHashes
        let contentHash = entry.contentHash

        if (!sourceHashes) {
          sourceHashes = computeHashes(worktree, entry.sources, logger, entry.componentName, entry.key)
          if (!sourceHashes) {
            logger.warn(`Source files still not found for ${entry.componentName}/${entry.key}`)
            continue
          }
          contentHash = computeContentHash(sourceHashes)
        }

        // Create pointer file
        const pointerDir = path.join(entry.componentHashDir, entry.key)
        fs.mkdirSync(pointerDir, { recursive: true })

        const pointer = {
          outputDir: contentHash,
          scanDir: entry.outputDir,
          sources: sourceHashes,
          timestamp: new Date().toISOString()
        }

        const pointerPath = path.join(pointerDir, `${contentHash}.json`)
        fs.writeFileSync(pointerPath, JSON.stringify(pointer, null, 2), 'utf8')
        logger.debug(`Created pointer: ${pointerPath}`)

        // Copy outputs to content-addressed directory
        const sourceOutputPath = path.join(worktree, entry.outputDir)
        const cachedOutputPath = path.join(playbook.dir, cacheDir, 'outputs', contentHash, entry.outputDir)

        if (fs.existsSync(sourceOutputPath)) {
          copyDirectory(sourceOutputPath, cachedOutputPath, logger)
          logger.info(`Cached outputs for ${entry.componentName}/${entry.key} → ${contentHash.substring(0, 12)}...`)
        } else {
          logger.warn(`Output directory not found: ${sourceOutputPath}`)
        }
      } catch (error) {
        logger.error(`Failed to update cache for ${entry.componentName}/${entry.key}: ${error.message}`)
      }
    }
  })
}

/**
 * Compute SHA-256 hashes for source files
 */
function computeHashes (worktree, sources, logger, componentName, key) {
  const hashes = {}

  if (logger && componentName && key) {
    logger.debug(`Checking source files for ${componentName}/${key} in worktree: ${worktree}`)
  }

  for (const source of sources) {
    const filePath = path.join(worktree, source)

    if (!fs.existsSync(filePath)) {
      if (logger && componentName && key) {
        logger.debug(`  ✗ Missing: ${source}`)
        // List what's actually in the worktree
        try {
          const worktreeContents = fs.readdirSync(worktree, { withFileTypes: true })
          const files = worktreeContents.filter(e => e.isFile()).map(e => e.name)
          const dirs = worktreeContents.filter(e => e.isDirectory()).map(e => e.name + '/')
          logger.debug(`  Worktree contains: ${[...dirs, ...files].join(', ') || '(empty)'}`)
        } catch (err) {
          logger.debug(`  Failed to list worktree contents: ${err.message}`)
        }
      }
      return null
    }

    const content = fs.readFileSync(filePath)
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    hashes[source] = hash

    if (logger && componentName && key) {
      logger.debug(`  ✓ Found: ${source} (${hash.substring(0, 12)}...)`)
    }
  }

  return hashes
}

/**
 * Compute content hash from source file hashes
 */
function computeContentHash (sourceHashes) {
  // Sort keys for consistent ordering
  const sortedKeys = Object.keys(sourceHashes).sort()

  // Concatenate hashes in sorted order
  const combined = sortedKeys.map(key => sourceHashes[key]).join('')

  // Hash the combined string
  return crypto.createHash('sha256').update(combined).digest('hex')
}

/**
 * Load pointer file from disk
 */
function loadPointerFile (pointerPath, logger) {
  if (!fs.existsSync(pointerPath)) {
    logger.debug(`No pointer file: ${pointerPath}`)
    return null
  }

  try {
    const content = fs.readFileSync(pointerPath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    logger.warn(`Failed to read pointer file ${pointerPath}: ${error.message}`)
    return null
  }
}

/**
 * Check if output directory exists and contains files
 */
function checkOutputsExist (outputPath, logger) {
  if (!fs.existsSync(outputPath)) {
    logger.debug(`Output directory does not exist: ${outputPath}`)
    return false
  }

  try {
    const stat = fs.statSync(outputPath)
    if (!stat.isDirectory()) {
      logger.debug(`Output path is not a directory: ${outputPath}`)
      return false
    }

    const hasFiles = checkDirectoryHasFiles(outputPath)
    if (!hasFiles) {
      logger.debug(`Output directory is empty: ${outputPath}`)
      return false
    }

    return true
  } catch (error) {
    logger.debug(`Error checking output directory ${outputPath}: ${error.message}`)
    return false
  }
}

/**
 * Recursively check if directory contains files
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
 * Recursively copy directory contents
 */
function copyDirectory (source, destination, logger) {
  // Remove destination if it exists
  if (fs.existsSync(destination)) {
    fs.rmSync(destination, { recursive: true, force: true })
  }

  // Create destination directory
  fs.mkdirSync(destination, { recursive: true })

  // Copy contents
  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const destPath = path.join(destination, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destPath, logger)
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destPath)
    }
  }

  logger.debug(`Copied directory from ${source} to ${destination}`)
}
