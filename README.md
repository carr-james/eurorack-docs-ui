# Eurorack Docs UI

Custom Antora UI bundle for Eurorack hardware documentation with a dark theme inspired by black PCB front panels.

## Features

- **Dark Theme**: Black backgrounds with high-contrast white text
- **JetBrains Mono**: Technical monospace font for code blocks
- **Copper Accents**: #B87333 copper color for interactive elements (like jack pads)
- **45° Angled Graphics**: White silkscreen-style dividers and accents
- **Module Navigation**: Dropdown menu for navigating between documentation modules
- **Clean & Technical**: Minimalist design inspired by Eurorack front panel aesthetics

## Design Philosophy

This UI is inspired by the aesthetic of Eurorack synthesizer front panels created in KiCad:
- Black PCB base color
- White silkscreen for labels and graphics (KiBuzzard text style)
- Exposed copper traces and square pads
- 45° and 75° angled design elements
- High contrast, functional appearance

## Usage

### In Antora Playbook

```yaml
ui:
  bundle:
    url: https://github.com/carr-james/eurorack-docs-ui/releases/latest/download/ui-bundle.zip
    snapshot: false
```

### For Local Development

```yaml
ui:
  bundle:
    url: ../eurorack-docs-ui/build/ui-bundle.zip
    snapshot: true
```

## Development

### Prerequisites

- Node.js 18+
- npm

### Build the UI

```bash
npm install
npx gulp bundle
```

The bundle will be output to `build/ui-bundle.zip`.

### Preview the UI

```bash
npx gulp preview
```

Then open http://localhost:5252 in your browser.

## Customization

### Colors

Edit `src/css/vars.css` to modify:
- Background colors
- Text colors
- Copper accent color
- Border colors

### Panel Aesthetic

Edit `src/css/eurorack.css` to modify:
- 45° angled graphics
- Copper element styling
- Section dividers
- Sidebar accents

### Navigation

Edit `src/partials/header-content.hbs` to modify the top navigation bar.

## License

Based on the [Antora Default UI](https://gitlab.com/antora/antora-ui-default), licensed under MPL-2.0.

## Credits

- Antora UI Default by the Antora team
- JetBrains Mono font by JetBrains
- Custom theme by carr-james
