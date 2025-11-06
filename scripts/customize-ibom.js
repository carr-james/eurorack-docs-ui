#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Custom Eurorack theme CSS to inject
const customTheme = `
/* Eurorack Docs UI Theme Overrides - Applied by customize-ibom.js */
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
/*
.dark .bom td {
  background-color: #1a1a1a;
  color: #e8e8e8;
}
*/

.dark .bom tr:nth-child(even) {
  background-color: #242424;
}

.dark .bom tr.highlighted:nth-child(n) {
  background-color: #ffd760
  color: #151515
}
`;

const MARKER = '/* Eurorack Copper Theme Overrides';

function findIbomFiles(startPath) {
  const results = [];

  function walk(dir) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);

        if (stat.isDirectory()) {
          // Recurse into subdirectories
          walk(filepath);
        } else if (file.endsWith('-ibom.html')) {
          // Found an iBOM file
          results.push(filepath);
        }
      }
    } catch (err) {
      // Skip directories we can't read
      if (err.code !== 'EACCES' && err.code !== 'ENOENT') {
        console.error(`Error reading directory ${dir}: ${err.message}`);
      }
    }
  }

  walk(startPath);
  return results;
}

function customizeIbomFile(filepath) {
  try {
    let html = fs.readFileSync(filepath, 'utf8');

    // Check if already customized
    if (html.includes(MARKER)) {
      console.log(`⏭️  Skipping ${path.basename(filepath)} - already customized`);
      return false;
    }

    // Check if file has the expected structure
    if (!html.includes('</style>')) {
      console.log(`⚠️  Warning: ${path.basename(filepath)} doesn't have a </style> tag`);
      return false;
    }

    // Inject custom CSS before closing style tag
    html = html.replace('</style>', customTheme + '\n</style>');

    // Write modified HTML back to file
    fs.writeFileSync(filepath, html, 'utf8');
    console.log(`✅ Customized ${path.basename(filepath)}`);
    return true;
  } catch (err) {
    console.error(`❌ Error customizing ${filepath}: ${err.message}`);
    return false;
  }
}

function main() {
  console.log('🎨 Eurorack iBOM Customization Tool\n');

  // Determine search path
  const searchPath = process.argv[2] || process.cwd();
  console.log(`Searching for iBOM files in: ${searchPath}\n`);

  // Find all iBOM HTML files
  const ibomFiles = findIbomFiles(searchPath);

  if (ibomFiles.length === 0) {
    console.log('No iBOM files found.');
    return;
  }

  console.log(`Found ${ibomFiles.length} iBOM file(s):\n`);

  // Process each file
  let customizedCount = 0;
  for (const file of ibomFiles) {
    if (customizeIbomFile(file)) {
      customizedCount++;
    }
  }

  console.log(`\n✨ Done! Customized ${customizedCount} of ${ibomFiles.length} file(s).`);
}

// Run the script
main();
