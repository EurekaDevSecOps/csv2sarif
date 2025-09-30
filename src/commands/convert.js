const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('csv-parse/sync')
const { Edge } = require('edge.js')
const JSON5 = require('json5')
module.exports = {
  summary: 'convert CSV to SARIF',
  args: {
    INPUT: {
      description: 'input CSV file',
      validate: INPUT => {
        if (!fs.existsSync(path.normalize(INPUT))) throw new Error(`path doesn't exist: ${INPUT}`)
      }
    }
  },
  options: [
    { name: 'OUTPUT', short: 'o', long: 'output', type: 'string', description: 'output file name' },
    { name: 'PROFILE', short: 'p', long: 'profile', type: 'string', description: 'built-in profile to use for the conversion' },
    { name: 'TEMPLATE', short: 't', long: 'template', type: 'string', description: 'custom template to use for the conversion' },
    { name: 'QUIET', short: 'q', long: 'quiet', type: 'boolean', description: 'suppress stdout logging' }
  ],
  description: `
    Converts the input CSV file into a SARIF report.

    Either PROFILE or TEMPLATE is required. There is only one built-in profile: FWDSEC.
    If you don't want to use that one, you must provide a TEMPLATE.
  `,
  examples: [
    '$ csv2sarif convert my.csv -p FWDSEC ' + '(output goes to stdout)'.grey,
    '$ csv2sarif convert my.csv -p FWDSEC -o report.sarif ' + '(output goes to file)'.grey,
    '$ csv2sarif convert my.csv -t template.json ' + '(use custom template)'.grey
  ],
  run: async (toolbox, args) => {
    const { log } = toolbox
    const profiles = path.join(__dirname, '..', '..', 'profiles')

    // Normalize and/or rewrite args and options.
    args.INPUT = path.resolve(path.normalize(args.INPUT))

    // Validate args and options.
    if (!args.PROFILE && !args.TEMPLATE) throw new Error('Please specify PROFILE or TEMPLATE to use')
    if (args.PROFILE && args.TEMPLATE) throw new Error('Please specify PROFILE or TEMPLATE to use')
    if (args.PROFILE && !fs.existsSync(path.join(profiles, `${args.PROFILE}.edge`))) throw new Error(`Profile not found: ${args.PROFILE}`)
    if (args.TEMPLATE && !fs.existsSync(args.TEMPLATE)) throw new Error(`Template not found: ${args.TEMPLATE}`)

    // Read and parse the input CSV file.
    const input = fs.readFileSync(args.INPUT, 'utf8')
    let rows = parse(input, { columns: true, skip_empty_lines: true })

    // Prep the templating engine.
    const edge = Edge.create()
    if (args.PROFILE) edge.mount(new URL('./profiles', `file://${profiles}`))
    if (args.TEMPLATE) edge.mount(new URL('./', `file://${process.cwd()}/`))

    // Convert the CSV.
    const text = await edge.render(args.PROFILE || args.TEMPLATE, { rows })
    const output = JSON5.parse(text)

    // Display, or write, the output.
    if (args.OUTPUT) fs.writeFileSync(args.OUTPUT, JSON.stringify(output))
    if (!args.OUTPUT) log(JSON.stringify(output))
  }
}
