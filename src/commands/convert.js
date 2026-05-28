const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('csv-parse/sync')
const { Edge } = require('edge.js')
const JSON5 = require('json5')
const { parseRepositoryFullName } = require('../utils/repository')
const {
  applyFwdsecMarkdownDescriptions,
  decorateRowsWithFwdsecMarkdown
} = require('../utils/fwdsec/markdown_builder')

const DEFAULT_ASVS_VERSION = '4.0.3'

const getFirstNonEmptyColumnValue = (rows, columnName) => {
  for (const row of rows) {
    const value = row?.[columnName]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

const resolveRepositoryFields = (args, rows) => {
  const repositoryValue = args.REPOSITORY || getFirstNonEmptyColumnValue(rows, 'Repository')
  if (!repositoryValue) {
    throw new Error('Please specify REPOSITORY in "owner/name" or "owner/path/name" format or provide a non-empty "Repository" CSV column')
  }

  const parsedRepository = parseRepositoryFullName(repositoryValue)

  return {
    parsedRepository,
    repoUrl: args.REPO_URL || getFirstNonEmptyColumnValue(rows, 'RepositoryURL') || ''
  }
}

const normalizeAsvsLevel = (value) => {
  if (typeof value !== 'string') return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  const match = trimmed.match(/^L([123])$/i)
  if (match) return `ASVS Level ${match[1]}`

  const levelMatch = trimmed.match(/^ASVS Level ([123])$/i)
  if (levelMatch) return `ASVS Level ${levelMatch[1]}`

  return trimmed
}

const buildAsvsMapping = (row) => {
  const requirementId = typeof row?.['ASVS ID'] === 'string' ? row['ASVS ID'].trim() : ''
  if (!requirementId) return null

  const categories = [
    typeof row?.CATEGORY === 'string' ? row.CATEGORY.trim() : ''
  ].filter(Boolean)

  const complianceLevels = [
    normalizeAsvsLevel(row?.['ASVS LEVEL'])
  ].filter(Boolean)

  return {
    standard: {
      id: 'ASVS',
      version: DEFAULT_ASVS_VERSION
    },
    requirements: [
      {
        id: requirementId,
        categories,
        compliance_levels: complianceLevels
      }
    ]
  }
}

const applyFwdsecResultMetadata = (output, rows) => {
  const run = output?.runs?.[0]
  if (!run || !Array.isArray(run.results)) return

  const failedRows = rows.filter(row => row?.STATUS === 'FAILED')
  run.results.forEach((result, index) => {
    const mapping = buildAsvsMapping(failedRows[index])
    if (!mapping) return

    result.properties = {
      ...(result.properties || {}),
      EUREKA_ASVS_MAPPING: mapping
    }
  })
}

const isFwdsecProfile = (profile) => profile === 'fwdsec' || profile === 'FWDSEC'

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
    { name: 'REPOSITORY', short: 'r', long: 'repository', type: 'string', description: 'repository name in owner/name or owner/path/name format' },
    { name: 'REPO_URL', short: 'u', long: 'repo-url', type: 'string', description: 'repository HTTPS URL' },
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
    '$ csv2sarif convert my.csv -p FWDSEC -r acme/widget ' + '(include repository name)'.grey,
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
    if (isFwdsecProfile(args.PROFILE)) rows = decorateRowsWithFwdsecMarkdown(rows)
    const { parsedRepository, repoUrl } = resolveRepositoryFields(args, rows)

    // Prep the templating engine.
    const edge = Edge.create()
    if (args.PROFILE) edge.mount(new URL('./profiles', `file://${profiles}`))
    if (args.TEMPLATE) edge.mount(new URL('./', `file://${process.cwd()}/`))

    // Convert the CSV.
    const repositoryOwner = parsedRepository.owner
    const repositoryName = parsedRepository.name
    const repositoryPath = parsedRepository.path

    const text = await edge.render(args.PROFILE || args.TEMPLATE, {
      rows,
      repositoryOwner,
      repositoryPath,
      repositoryName,
      repositoryFullName: parsedRepository.fullName,
      repoUrl
    })
    const output = JSON5.parse(text)
    if (isFwdsecProfile(args.PROFILE)) {
      applyFwdsecMarkdownDescriptions(output, rows)
      applyFwdsecResultMetadata(output, rows)
    }

    // Display, or write, the output.
    if (args.OUTPUT) fs.writeFileSync(args.OUTPUT, JSON.stringify(output))
    if (!args.OUTPUT) log(JSON.stringify(output))
  }
}
