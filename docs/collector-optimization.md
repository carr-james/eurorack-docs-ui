# Collector Optimization: Hash-Based Change Detection

## Why This Optimization

KiBot generation of PCB artifacts (schematics, iBOMs, 3D renders) takes 60-120 seconds per board. When working on documentation without touching PCB files, we're regenerating identical artifacts on every build. This optimization adds hash-based change detection to skip regeneration when source files haven't changed.

**Performance Impact:**
- Current: ~120-240s total build time (mostly KiBot)
- Optimized: ~10-20s when source files unchanged (5-10x faster)
- Hash overhead: ~500ms (negligible compared to savings)

**Why Both Local and CI:**
- **Local:** Speeds up documentation iteration during development
- **CI:** Reduces GitHub Actions minutes, faster deployments, lower costs

## How It Works

### Overview

The extension runs BEFORE `@antora/collector-extension` and uses programmatic registration to conditionally skip collector commands:

1. **Before collection:** Hash source files → check cache → verify outputs exist
2. **If match:** Remove `run` command (keeps `scan` to collect existing files)
3. **If mismatch:** Let collector execute normally
4. **After build:** Update hash cache

### Worktree Persistence

Antora creates persistent worktrees when using `keep_worktrees: true`:

```
.cache/antora/
└── collector/
    └── {component}@{ref}-{commit-hash}/    # Persisted worktree
        ├── docs/
        └── hardware/
            └── {board-name}/
                ├── {board}.kicad_pcb       # Source (from git)
                ├── {board}.kicad_sch       # Source (from git)
                └── kibot-output/           # Generated (persists!)
```

**Key insight:** With `keep_worktrees: true` (already configured), worktrees persist between builds. Generated `kibot-output/` directories remain available for subsequent builds.

### Hash Cache Location

Hash records stored separately from worktrees with automatic component isolation:

```
.cache/antora/
└── collector-cache/              # Configurable via hash-dir
    └── {component-name}/         # Auto-scoped by component
        └── {key}.json            # One file per entry
```

**Example:** `.cache/antora/collector-cache/cem3340-vco/control-board.json`

**Format:**
```json
{
  "sources": {
    "hardware/control-board/control-board.kicad_pcb": "sha256-hash",
    "hardware/control-board/control-board.kicad_sch": "sha256-hash"
  },
  "timestamp": "2025-11-06T22:50:44.175Z"
}
```

### Extension Configuration

Configuration in `antora.yml` under `ext.collector-cache` (mirrors collector extension structure):

```yaml
ext:
  collector-cache:
    hash-dir: .cache/antora/collector-cache  # Optional, this is the default
    entries:
      - run:
          key: control-board              # Unique cache key for this entry
          sources:                        # Files to hash (relative to worktree)
            - hardware/control-board/control-board.kicad_pcb
            - hardware/control-board/control-board.kicad_sch
          cache-dir: hardware/control-board/kibot-output  # Where outputs are generated
          command: >
            kibot
            -c .kibot/jlcpcb-2layer-enhanced.kibot.yaml
            -b hardware/control-board/control-board.kicad_pcb
            -e hardware/control-board/control-board.kicad_sch
            -d hardware/control-board/kibot-output
            schematic_pdf schematic_svg pcb_top_pdf board_dimensions
            render_top render_bottom render_perspective
            ibom step
        scan:
          - dir: hardware/control-board/kibot-output/docs/schematics
            files: '**/*.svg'
            into: modules/ROOT/images/generated/control-board/schematics
          # ... more scan entries
```

**Configuration details:**
- `hash-dir`: Global setting for where hash cache files are stored (defaults to `.cache/antora/collector-cache`)
- `entries`: Array of collector entries (same structure as `ext.collector`)
- `key`: Unique identifier for this entry's hash cache file (auto-scoped by component name)
- `sources`: Explicit list of files to hash (no command parsing needed)
- `cache-dir`: Directory where outputs are generated (checked for existence)
- `command`: The actual command to execute (same as collector extension)
- `scan`: How to collect outputs into Antora (same as collector extension)

**Important:** Entries configured in `ext.collector-cache` are programmatically registered with the collector extension. You do **not** need to duplicate these entries in `ext.collector`. The collector-cache extension handles registration automatically based on cache state (run+scan on cache miss, scan-only on cache hit).

**Mixed usage:** You can still use `ext.collector` directly for commands that don't need caching. Both configurations work together - the collector extension will process entries from both sources.

### Programmatic Registration API

The extension reads `ext.collector-cache` configuration and programmatically registers with `@antora/collector-extension`:

```javascript
module.exports.register = function () {
  this.once('contentAggregated', ({ contentAggregate, playbook }) => {
    for (const { name: componentName, origins } of contentAggregate) {
      for (const origin of origins) {
        const worktree = origin.collectorWorktree
        const cacheConfig = origin.descriptor.ext['collector-cache']

        if (!cacheConfig || !cacheConfig.entries) continue

        const hashDir = cacheConfig['hash-dir'] || '.cache/antora/collector-cache'
        const componentHashDir = path.join(playbook.dir, hashDir, componentName)

        // Initialize collector array if needed
        if (!origin.descriptor.ext.collector) {
          origin.descriptor.ext.collector = []
        }

        for (const entry of cacheConfig.entries) {
          const { key, sources, 'cache-dir': cacheDir, run, scan } = entry

          // Hash source files
          const currentHashes = computeHashes(worktree, sources)
          const cachedHashes = loadHashCache(componentHashDir, key)

          // Check if outputs exist
          const outputsExist = checkOutputsExist(worktree, cacheDir)

          // Decide whether to skip
          if (hashesMatch(currentHashes, cachedHashes) &&
              outputsExist &&
              !process.env.FORCE_COLLECTOR) {
            // Skip run, only register scan entries
            origin.descriptor.ext.collector.push({ scan })
          } else {
            // Register full entry with run + scan
            origin.descriptor.ext.collector.push({ run, scan })
          }
        }
      }
    }
  })

  // Update hash cache after successful collection
  this.on('beforePublish', ({ contentAggregate, playbook }) => {
    // ... update hash cache files ...
  })
}
```

### Safety Guarantees

- Always run if output directory missing
- Always run if source files missing/unreadable
- Always run if hash cache missing/corrupted
- Always run on any error during hash/check process
- Manual override: `FORCE_COLLECTOR=true` environment variable

## Cache Strategy

### Local Builds

**Component builds** (`cem3340-vco/docs/build-docs.sh`):
- Uses local worktree: `url: /work` (mounted from host)
- Outputs generated directly in host: `hardware/{board}/kibot-output/`
- Persists naturally on disk (gitignored but local)
- Hash cache at: `docs/.cache/antora/collector-cache/cem3340-vco/`

**Full site builds** (`eurorack-docs/build-docs.sh`):
- Uses Antora-managed worktrees: `.cache/antora/collector/`
- `keep_worktrees: true` ensures persistence between builds
- Outputs persist in worktree: `{worktree}/hardware/{board}/kibot-output/`
- Hash cache at: `.cache/antora/collector-cache/{component-name}/`

### CI Builds

**GitHub Actions cache configuration:**

```yaml
- name: Restore Collector Cache
  uses: actions/cache@v4
  with:
    path: |
      .cache/antora/collector
      .cache/antora/collector-cache
    key: collector-${{ hashFiles('**/hardware/**/*.kicad_*') }}
    restore-keys: |
      collector-

- name: Build Antora site
  run: npx antora --fetch antora-playbook.yml
```

**Cache behavior:**
- Cache key based on source file content → auto-invalidates when PCB/schematic changes
- Restores worktrees (~44MB) + hash records (~few KB)
- `restore-keys` allows partial matches (useful when only one component changes)
- Cache persists until source files change or manually cleared

## Implementation Stages

### Stage 1: Collector Cache Extension

Create `/eurorack-docs-ui/extensions/collector-cache-extension.js`:

**Extension name:** `collector-cache-extension`
**Config key:** `ext.collector-cache` (in antora.yml)

**Key functions:**
- `computeHashes(worktree, sources)` - SHA-256 hash of source files
- `loadHashCache(hashDir, key)` - Read cached hashes from `{hashDir}/{component}/{key}.json`
- `hashesMatch(current, cached)` - Compare hash objects
- `checkOutputsExist(worktree, cacheDir)` - Verify output directory exists and populated
- `updateHashCache(hashDir, component, key, hashes)` - Write new hashes after build

**Event hooks:**
- `contentAggregated` - Read `ext.collector-cache`, conditionally register with `ext.collector`
- `beforePublish` - Update hash cache files after successful collection

### Stage 2: Component Configuration

Add `ext.collector-cache` configuration to component `antora.yml` files:

**Files to update:**
- `/cem3340-vco/docs/antora.yml`
- `/quad-vca-mixer/docs/antora.yml`

**Migrate existing `ext.collector` entries to `ext.collector-cache` format:**
- Add `key` field (e.g., "control-board", "main-board")
- Add `sources` array with explicit file paths
- Rename `dir` in `run` to `cache-dir`
- Keep `scan` entries unchanged

### Stage 3: Playbook Registration

Register extension BEFORE collector in all playbooks:

```yaml
antora:
  extensions:
    - require: '@carr-james/eurorack-docs-ui/extensions/collector-cache-extension'
    - require: '@antora/collector-extension'
      keep_worktrees: true
    - '@carr-james/eurorack-docs-ui/extensions/ibom-processor'
```

**Critical:** Order matters - collector-cache-extension must run first to register with collector before collector executes.

**Files to update:**
- `/eurorack-docs/antora-playbook.yml`
- `/cem3340-vco/docs/local-site.yml`
- `/quad-vca-mixer/docs/local-site.yml`

### Stage 4: Package Updates

**Publish extension:**
- Export collector-cache-extension in `/eurorack-docs-ui/extensions/index.js`
- Bump version to 1.0.3 in `/eurorack-docs-ui/package.json`
- Publish to npm

**Update consumers:**
- `/cem3340-vco/docs/package.json`
- `/quad-vca-mixer/docs/package.json`
- `/eurorack-docs/package.json`

### Stage 5: CI Cache Integration

Add GitHub Actions cache to `/eurorack-docs/.github/workflows/build-docs.yml`:

**What gets cached:**
- `.cache/antora/collector/` - Worktrees with generated outputs (~44MB)
- `.cache/antora/collector-cache/` - Hash records (~few KB)

**Cache invalidation:**
- Automatic when any `.kicad_pcb` or `.kicad_sch` file changes
- Manual via workflow dispatch or cache clear

## Expected Outcomes

**Local Development:**
- Documentation changes: 5-10x faster builds
- PCB changes: Same speed (regeneration needed)
- Transparent - just works

**CI/CD:**
- Unchanged PCBs: 4-8x faster builds
- Changed PCBs: Same speed (regeneration needed)
- Lower GitHub Actions costs (~$0.02-0.05 per build saved)

**Developer Experience:**
- No manual cache management
- Clear logging shows what's being skipped and why
- Manual override available: `FORCE_COLLECTOR=true`
