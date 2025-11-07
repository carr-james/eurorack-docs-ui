#!/usr/bin/env node

/**
 * Universal Antora Build Tool for Eurorack Documentation
 *
 * Handles both component and unified documentation builds with automatic
 * detection of build context and smart volume mounting for local development.
 *
 * @see https://docs.antora.org
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  mode: 'prod',           // 'local' or 'prod'
  type: 'auto',           // 'component', 'unified', or 'auto'
  cwd: process.cwd(),     // Working directory
  clean: false,           // Clean before build
  noCache: false,         // Skip Docker cache
  forceCollector: false,  // Force collector execution
  skipPull: false,        // Skip docker pull
  verbose: false          // Verbose output
}

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--mode' && args[i + 1]) {
    options.mode = args[++i]
  } else if (arg === '--type' && args[i + 1]) {
    options.type = args[++i]
  } else if (arg === '--cwd' && args[i + 1]) {
    options.cwd = path.resolve(process.cwd(), args[++i])
  } else if (arg === '--clean') {
    options.clean = true
  } else if (arg === '--no-cache') {
    options.noCache = true
  } else if (arg === '--force-collector') {
    options.forceCollector = true
  } else if (arg === '--skip-pull') {
    options.skipPull = true
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true
  } else if (arg === '--help' || arg === '-h') {
    showHelp()
    process.exit(0)
  }
}

// Change to working directory
process.chdir(options.cwd)

// Detect build context
const context = detectContext(options)
if (options.verbose) {
  console.log('Build context:', JSON.stringify(context, null, 2))
}

// Run build
try {
  runBuild(context, options)
} catch (error) {
  console.error('Build failed:', error.message)
  process.exit(1)
}

/**
 * Find git repository root by walking up directory tree
 */
function findGitRoot(startPath) {
  let currentPath = startPath
  while (currentPath !== path.parse(currentPath).root) {
    if (fs.existsSync(path.join(currentPath, '.git'))) {
      return currentPath
    }
    currentPath = path.dirname(currentPath)
  }
  return null
}

/**
 * Detect build context based on directory structure
 */
function detectContext(options) {
  const cwd = process.cwd()

  // Find git repository root
  const gitRoot = findGitRoot(cwd)
  if (!gitRoot) {
    throw new Error('Not in a git repository. Antora requires a git repository for local builds.')
  }

  // Auto-detect type if not specified
  let type = options.type
  if (type === 'auto') {
    // Unified repo has antora-playbook.yml at root
    // Component repos have docs/ subdirectory
    if (fs.existsSync(path.join(cwd, 'antora-playbook.yml'))) {
      type = 'unified'
    } else if (fs.existsSync(path.join(cwd, 'local-site.yml'))) {
      type = 'component'
    } else {
      throw new Error('Cannot detect build type. Use --type component or --type unified')
    }
  }

  // Determine playbook and paths
  let playbook, buildDir, workDir, dockerWorkDir, componentName

  if (type === 'component') {
    playbook = options.mode === 'local' ? 'local-site.yml' : 'local-site.yml'
    buildDir = 'build'
    // Mount git root, but work from subdirectory if needed
    workDir = gitRoot
    // Relative path from git root to cwd for Docker working directory
    dockerWorkDir = path.relative(gitRoot, cwd) || '.'

    // Try to detect component name from antora.yml
    const antoraYml = path.join(cwd, 'antora.yml')
    if (fs.existsSync(antoraYml)) {
      const content = fs.readFileSync(antoraYml, 'utf8')
      const match = content.match(/^name:\s*(.+)$/m)
      if (match) {
        componentName = match[1].trim()
      }
    }
  } else {
    // Unified
    playbook = options.mode === 'local' ? 'local-playbook.yml' : 'antora-playbook.yml'
    buildDir = 'build'
    workDir = gitRoot
    dockerWorkDir = path.relative(gitRoot, cwd) || '.'
  }

  // Find eurorack-docs-ui path (sibling directory)
  const uiPath = path.resolve(cwd, '..', 'eurorack-docs-ui')
  const hasLocalUI = fs.existsSync(uiPath)

  // Find component paths for unified local builds
  const componentPaths = {}
  if (type === 'unified' && options.mode === 'local') {
    const cem3340Path = path.resolve(cwd, '..', 'cem3340-vco')
    const quadVcaPath = path.resolve(cwd, '..', 'quad-vca-mixer')

    if (fs.existsSync(cem3340Path)) {
      componentPaths.cem3340 = cem3340Path
    }
    if (fs.existsSync(quadVcaPath)) {
      componentPaths.quadVca = quadVcaPath
    }
  }

  return {
    type,
    mode: options.mode,
    playbook,
    buildDir,
    workDir,
    dockerWorkDir,
    componentName,
    hasLocalUI: hasLocalUI && options.mode === 'local',
    uiPath: hasLocalUI ? uiPath : null,
    componentPaths
  }
}

/**
 * Run Docker build
 */
function runBuild(context, options) {
  const { type, mode, playbook, buildDir, workDir, dockerWorkDir, hasLocalUI, uiPath, componentPaths, componentName } = context

  console.log('==================================')
  console.log(`Building ${type === 'unified' ? 'Unified' : 'Component'} Documentation (${mode})`)
  console.log('==================================')
  console.log()

  // Check playbook exists (in the appropriate subdirectory)
  const playbookPath = dockerWorkDir !== '.' ? path.join(workDir, dockerWorkDir, playbook) : path.join(workDir, playbook)
  if (!fs.existsSync(playbookPath)) {
    throw new Error(`Playbook not found: ${playbookPath}`)
  }

  // Clean if requested
  if (options.clean) {
    console.log('Cleaning build artifacts...')
    const cacheDir = path.join(workDir, '.cache')
    const buildPath = path.join(workDir, buildDir)

    if (fs.existsSync(cacheDir)) {
      execSync(`rm -rf "${cacheDir}"`, { stdio: 'inherit' })
    }
    if (fs.existsSync(buildPath)) {
      execSync(`rm -rf "${buildPath}"`, { stdio: 'inherit' })
    }
    console.log()
  }

  // Pull Docker image
  if (!options.skipPull) {
    console.log('Pulling Docker container...')
    execSync('docker pull ghcr.io/carr-james/eurorack-docker:latest', { stdio: 'inherit' })
    console.log()
  }

  // Build volume mounts
  const volumes = [`"${workDir}:/work"`]

  if (hasLocalUI) {
    volumes.push(`"${uiPath}:/eurorack-docs-ui"`)
    console.log('Mounting local eurorack-docs-ui for development')
  }

  if (type === 'unified' && mode === 'local') {
    if (componentPaths.cem3340) {
      volumes.push(`"${componentPaths.cem3340}:/cem3340-vco"`)
      console.log('Mounting local cem3340-vco')
    }
    if (componentPaths.quadVca) {
      volumes.push(`"${componentPaths.quadVca}:/quad-vca-mixer"`)
      console.log('Mounting local quad-vca-mixer')
    }
  }

  console.log()
  console.log('Building site in Docker container...')

  // Build environment variables
  const envVars = [
    `LOCAL_USER_ID=$(id -u)`,
    `LOCAL_GROUP_ID=$(id -g)`
  ]

  if (options.forceCollector) {
    envVars.push('FORCE_COLLECTOR=true')
  }

  // Build docker command
  const volumeArgs = volumes.map(v => `-v ${v}`).join(' \\\n    ')
  const envArgs = envVars.map(e => `-e ${e}`).join(' \\\n    ')

  // Determine working directory path for Docker (-w flag)
  const workPath = dockerWorkDir !== '.' ? `/work/${dockerWorkDir}` : '/work'

  const dockerCmd = `docker run --rm \\
    ${volumeArgs} \\
    -w ${workPath} \\
    ${envArgs} \\
    ghcr.io/carr-james/eurorack-docker:latest \\
    bash -c "
        set -e

        echo 'Installing Antora dependencies...'
        if [ ! -d node_modules ]; then
            npm install --no-package-lock
        else
            echo 'Antora dependencies already installed.'
        fi

        echo 'Building Antora site...'
        if npx antora ${playbook}; then
            echo 'Antora build completed successfully'
        else
            echo 'ERROR: Antora build failed'
            exit 1
        fi

        echo 'Fixing file ownership...'
        chown -R \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID ${buildDir} node_modules .cache 2>/dev/null || true
        ${type === 'component' ? 'chown -R \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID /work/hardware/**/kibot-output 2>/dev/null || true' : ''}
        ${type === 'unified' && mode === 'local' ? 'chown -R \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID /cem3340-vco/hardware/**/kibot-output 2>/dev/null || true' : ''}
        ${type === 'unified' && mode === 'local' ? 'chown -R \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID /quad-vca-mixer/hardware/**/kibot-output 2>/dev/null || true' : ''}
    "`

  if (options.verbose) {
    console.log('Docker command:')
    console.log(dockerCmd)
    console.log()
  }

  // Execute build
  execSync(dockerCmd, { stdio: 'inherit', shell: '/bin/bash' })

  // Check if build succeeded
  const sitePath = dockerWorkDir !== '.'
    ? path.join(workDir, dockerWorkDir, buildDir, 'site')
    : path.join(workDir, buildDir, 'site')
  if (fs.existsSync(sitePath)) {
    console.log()
    console.log('==================================')
    console.log('✓ Build successful!')
    console.log('==================================')
    console.log()
    console.log('To view the documentation:')
    console.log(`  cd ${buildDir}/site && python3 -m http.server 8000`)

    if (type === 'component' && componentName) {
      console.log(`  Then open: http://localhost:8000/${componentName}/stable/`)
    } else if (type === 'unified') {
      console.log('  Then open: http://localhost:8000/eurorack-docs/stable/')
    }
    console.log()

    if (mode === 'local') {
      console.log('NOTE: This is a local preview.')
      if (type === 'component') {
        console.log('For the full unified site, see: https://carr-james.github.io/eurorack-docs')
      } else {
        console.log('For production builds, use: npm run docs:prod')
      }
      console.log()
    }
  } else {
    throw new Error('Build directory not created - build may have failed')
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Universal Antora Build Tool for Eurorack Documentation

Usage: eurorack-build [options]

Options:
  --mode <local|prod>       Build mode (default: prod)
                            - local: Use local-playbook.yml, mount local UI
                            - prod: Use production playbook, npm packages

  --type <component|unified|auto>
                            Build type (default: auto)
                            - component: Single component docs
                            - unified: Multi-component unified docs
                            - auto: Detect based on directory structure

  --cwd <path>              Working directory (default: current directory)

  --clean                   Clean build artifacts before building

  --no-cache                Skip Docker cache

  --force-collector         Force collector to run (skip cache)

  --skip-pull               Skip docker pull step

  --verbose, -v             Verbose output

  --help, -h                Show this help message

Examples:
  # Component repo - local development
  npm run docs:local

  # Component repo - production build
  npm run docs:prod

  # Unified repo - local with all components
  npm run docs:local

  # Clean build
  npm run docs:local -- --clean

  # Force collector regeneration
  npm run docs:local -- --force-collector
`)
}
