// Core iBOM block macro implementation
// Shared between Antora and preview builds

module.exports = function createIbomMacro () {
  this.blockMacro(function () {
    const self = this
    self.named('ibom')
    self.process(function (parent, target) {
      const html = `<div class="ibom-container">
    <iframe src="${target}" class="ibom-viewer" title="Interactive BOM"></iframe>
  </div>`
      return this.createBlock(parent, 'pass', html)
    })
  })
}
