# Eurorack Docs UI - Antora Extensions

This directory contains Antora and Asciidoctor extensions for the Eurorack documentation system.

## Extensions

### ibom-block-antora.js

Asciidoctor block macro extension for embedding Interactive BOM (iBOM) viewers in Antora builds.

**Usage in Antora playbook:**

```yaml
asciidoc:
  extensions:
    - '@carr-james/eurorack-docs-ui/extensions/ibom-block-antora'
```

**Usage in AsciiDoc:**

```asciidoc
ibom::_attachments/path/to/ibom.html[]
```

### ibom-block.js

Asciidoctor block macro extension for Gulp preview builds. Same usage as ibom-block-antora but with different export pattern for preview compatibility.

### ibom-processor.js

Antora extension that processes iBOM HTML files during the build to inject custom theme styling.

**Usage in Antora playbook:**

```yaml
antora:
  extensions:
    - '@antora/collector-extension'
    - '@carr-james/eurorack-docs-ui/extensions/ibom-processor'
```

## Installation

```bash
npm install @carr-james/eurorack-docs-ui
```

## Complete Antora Playbook Example

```yaml
ui:
  bundle:
    url: https://github.com/carr-james/eurorack-docs-ui/releases/download/latest/ui-bundle.zip
    snapshot: true

asciidoc:
  extensions:
    - '@carr-james/eurorack-docs-ui/extensions/ibom-block-antora'

antora:
  extensions:
    - '@antora/collector-extension'
    - '@carr-james/eurorack-docs-ui/extensions/ibom-processor'
```
