// Main entry point for @carr-james/eurorack-docs-ui npm package
// Exports all Antora extensions

module.exports = {
  // Asciidoctor extension for iBOM block macro (Antora builds)
  ibomBlockAntora: require('./ibom-block-antora'),

  // Asciidoctor extension for iBOM block macro (Gulp preview)
  ibomBlock: require('./ibom-block'),

  // Antora extension for processing iBOM files
  ibomProcessor: require('./ibom-processor'),

  // Antora extension for collector hash-based caching
  collectorCacheExtension: require('./collector-cache-extension')
}
