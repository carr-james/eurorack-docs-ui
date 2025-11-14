#!/usr/bin/env node

/**
 * Flexible Antora Build Tool with Docker
 *
 * A simple wrapper around Docker to run Antora builds. The user controls
 * all configuration via command-line arguments and the playbook file.
 *
 * @see https://docs.antora.org
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  playbook: null,         // Required: playbook file to use
  cwd: process.cwd(),     // Working directory
  mounts: [],             // Additional volume mounts (src:dest)
  clean: false,           // Clean before build
  forceCollector: false,  // Force collector execution
  dryRun: false,          // Dry run (cache check only)
  skipPull: false,        // Skip docker pull
  verbose: false,         // Verbose output
  dockerImage: 'ghcr.io/carr-james/eurorack-docker:latest'  // Docker image to use
}

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--playbook' && args[i + 1]) {
    options.playbook = args[++i]
  } else if (arg === '--cwd' && args[i + 1]) {
    options.cwd = path.resolve(process.cwd(), args[++i])
  } else if (arg === '--mount' && args[i + 1]) {
    options.mounts.push(args[++i])
  } else if (arg === '--clean') {
    options.clean = true
  } else if (arg === '--force-collector') {
    options.forceCollector = true
  } else if (arg === '--dry-run') {
    options.dryRun = true
  } else if (arg === '--skip-pull') {
    options.skipPull = true
  } else if (arg === '--docker-image' && args[i + 1]) {
    options.dockerImage = args[++i]
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true
  } else if (arg === '--help' || arg === '-h') {
    showHelp()
    process.exit(0)
  } else {
    console.error(`Unknown option: ${arg}`)
    console.error('Use --help for usage information')
    process.exit(1)
  }
}

// Require playbook
if (!options.playbook) {
  console.error('Error: --playbook is required')
  console.error('Usage: eurorack-build --playbook <file> [options]')
  console.error('Use --help for more information')
  process.exit(1)
}

// Change to working directory
process.chdir(options.cwd)

// Find git repository root
const gitRoot = findGitRoot(options.cwd)
if (!gitRoot) {
  console.error('Error: Not in a git repository')
  console.error('Antora requires a git repository for local builds')
  process.exit(1)
}

// Build context
const context = {
  playbook: options.playbook,
  gitRoot,
  workDir: path.relative(gitRoot, options.cwd) || '.',
  buildDir: 'build'
}

if (options.verbose) {
  console.log('Build context:', JSON.stringify(context, null, 2))
  console.log('Options:', JSON.stringify(options, null, 2))
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
 * Run Docker build
 */
function runBuild(context, options) {
  const { playbook, gitRoot, workDir, buildDir } = context

  console.log('==================================')
  console.log('Building Antora Documentation')
  console.log('==================================')
  console.log()
  console.log(`Playbook: ${playbook}`)
  console.log(`Git root: ${gitRoot}`)
  console.log(`Work dir: ${workDir}`)
  console.log()

  // Check playbook exists
  const playbookPath = workDir !== '.'
    ? path.join(gitRoot, workDir, playbook)
    : path.join(gitRoot, playbook)

  if (!fs.existsSync(playbookPath)) {
    throw new Error(`Playbook not found: ${playbookPath}`)
  }

  // Clean if requested
  if (options.clean) {
    console.log('Cleaning build artifacts...')
    const cachePath = workDir !== '.'
      ? path.join(gitRoot, workDir, '.cache')
      : path.join(gitRoot, '.cache')
    const buildPath = workDir !== '.'
      ? path.join(gitRoot, workDir, buildDir)
      : path.join(gitRoot, buildDir)

    if (fs.existsSync(cachePath)) {
      execSync(`rm -rf "${cachePath}"`, { stdio: 'inherit' })
    }
    if (fs.existsSync(buildPath)) {
      execSync(`rm -rf "${buildPath}"`, { stdio: 'inherit' })
    }
    console.log()
  }

  // Pull Docker image
  if (!options.skipPull) {
    console.log(`Pulling Docker image: ${options.dockerImage}`)
    execSync(`docker pull ${options.dockerImage}`, { stdio: 'inherit' })
    console.log()
  }

  // Build volume mounts
  // Always mount git root to /work
  const volumes = [`"${gitRoot}:/work"`]

  // Add user-specified mounts
  if (options.mounts.length > 0) {
    console.log('Additional mounts:')
    for (const mount of options.mounts) {
      const [src, dest] = mount.split(':')
      if (!src || !dest) {
        throw new Error(`Invalid mount format: ${mount} (expected src:dest)`)
      }
      const absoluteSrc = path.resolve(src)
      if (!fs.existsSync(absoluteSrc)) {
        console.warn(`Warning: Mount source does not exist: ${absoluteSrc}`)
      }
      volumes.push(`"${absoluteSrc}:${dest}"`)
      console.log(`  ${absoluteSrc} → ${dest}`)
    }
    console.log()
  }

  console.log('Building site in Docker container...')

  // Build environment variables
  const envVars = [
    `LOCAL_USER_ID=$(id -u)`,
    `LOCAL_GROUP_ID=$(id -g)`
  ]

  if (options.forceCollector) {
    envVars.push('FORCE_COLLECTOR=true')
  }

  if (options.dryRun) {
    envVars.push('DRY_RUN=true')
  }

  // Build docker command
  const volumeArgs = volumes.map(v => `-v ${v}`).join(' \\\n    ')
  const envArgs = envVars.map(e => `-e ${e}`).join(' \\\n    ')

  // Docker working directory
  const dockerWorkDir = workDir !== '.' ? `/work/${workDir}` : '/work'

  const dockerCmd = `docker run --rm \\
    ${volumeArgs} \\
    -w ${dockerWorkDir} \\
    ${envArgs} \\
    ${options.dockerImage} \\
    bash -c "
        set -e

        echo 'Installing dependencies as root...'
        if [ ! -d node_modules ]; then
            npm install --no-package-lock
        else
            echo 'Dependencies already installed'
        fi

        echo 'Switching to user \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID...'

        # Create a user with the same UID/GID as the host user if it doesn't exist
        # This ensures file ownership matches the host
        if ! getent passwd \\$LOCAL_USER_ID >/dev/null 2>&1; then
            groupadd -g \\$LOCAL_GROUP_ID builduser 2>/dev/null || true
            useradd -u \\$LOCAL_USER_ID -g \\$LOCAL_GROUP_ID -m -s /bin/bash builduser 2>/dev/null || true
        fi

        echo 'Running Antora as host user...'
        su-exec \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID npx antora ${playbook} || \\
        gosu \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID npx antora ${playbook} || \\
        runuser -u builduser -- npx antora ${playbook}

        echo 'Fixing ownership of installed dependencies...'
        chown -R \\$LOCAL_USER_ID:\\$LOCAL_GROUP_ID node_modules .cache 2>/dev/null || true
    "`

  if (options.verbose) {
    console.log()
    console.log('Docker command:')
    console.log(dockerCmd)
    console.log()
  }

  // Execute build
  execSync(dockerCmd, { stdio: 'inherit', shell: '/bin/bash' })

  // Check if build succeeded
  const sitePath = workDir !== '.'
    ? path.join(gitRoot, workDir, buildDir, 'site')
    : path.join(gitRoot, buildDir, 'site')

  if (fs.existsSync(sitePath)) {
    console.log()
    console.log('==================================')
    console.log('✓ Build successful!')
    console.log('==================================')
    console.log()
    console.log('To view the documentation:')
    console.log(`  cd ${buildDir}/site && python3 -m http.server 8000`)
    console.log('  Then open: http://localhost:8000')
    console.log()
  } else {
    throw new Error('Build directory not created - build may have failed')
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Antora Build Tool with Docker

A simple wrapper to run Antora in Docker.

Usage: eurorack-build --playbook <file> [options]

Required:
  --playbook <file>         Playbook file to use (e.g., antora-playbook.yml)

Options:
  --cwd <path>              Working directory (default: current directory)

  --mount <src>:<dest>      Additional volume mount (can be used multiple times)
                            Example: --mount ../ui:/ui --mount ../comp:/comp

  --clean                   Clean .cache and build directories before building

  --force-collector         Set FORCE_COLLECTOR=true environment variable

  --dry-run                 Set DRY_RUN=true environment variable

  --skip-pull               Skip docker pull step

  --docker-image <image>    Docker image to use (default: ghcr.io/carr-james/eurorack-docker:latest)

  --verbose, -v             Show verbose output including docker command

  --help, -h                Show this help message

Examples:
  # Basic build
  eurorack-build --playbook antora-playbook.yml

  # Local development with UI bundle from sibling directory
  eurorack-build --playbook local-playbook.yml \\
    --mount ../eurorack-docs-ui:/eurorack-docs-ui

  # Unified docs with component repos mounted
  eurorack-build --playbook local-playbook.yml \\
    --mount ../eurorack-docs-ui:/eurorack-docs-ui \\
    --mount ../cem3340-vco:/cem3340-vco \\
    --mount ../quad-vca-mixer:/quad-vca-mixer

  # Clean build with collector cache disabled
  eurorack-build --playbook antora-playbook.yml \\
    --clean \\
    --force-collector

  # Dry run to check collector cache status
  eurorack-build --playbook antora-playbook.yml --dry-run

Notes:
  - The git repository root is always mounted to /work in the container
  - Working directory is relative to git root
  - Use your playbook to configure Antora behavior (not this script)
  - Additional mounts should use absolute paths (or paths relative to cwd)
`)
}
