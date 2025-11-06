// Asciidoctor extension for iBOM block macro (Gulp preview version)
// Usage: ibom::path/to/ibom.html[]
//
// This file is used by the gulp preview (ui-model.yml)
// For Antora builds, use ibom-block-antora.js

const createIbomMacro = require('./ibom-block-core')

module.exports.register = function () {
  this.register(createIbomMacro)
}
