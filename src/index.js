const { build } = require('@persistr/clif')
const pkg = require('../package.json')
const commands = require('./commands')
const path = require('node:path')

// Plugins.
const plugins = {
}

module.exports = {
  build: (options) => {
    // Configure the Radar CLI.
    return build(pkg.name, 'csv2sarif', pkg.repository.url.replace(/\.git$/, ''))
      .plugins(Object.values({ ...plugins, ...options?.plugins }))
      .toolbox(options?.toolbox)
      .version(pkg.version, '-v, --version')
      .description(`${pkg.description}\n${pkg.homepage}`)
      .commands(commands)
      .done()
  }
}
