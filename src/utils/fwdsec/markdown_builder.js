const normalizeFwdsecMarkdownInlineText = (value) => {
  if (typeof value !== 'string') return ''

  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
}

const buildFwdsecMarkdownDescription = (row) => {
  const asvsId = normalizeFwdsecMarkdownInlineText(row?.['ASVS ID'])
  const verificationRequirement = normalizeFwdsecMarkdownInlineText(row?.['VERIFICATION REQUIREMENT'])
  const testResults = normalizeFwdsecMarkdownInlineText(row?.['TEST RESULTS'])
  const stepsToReproduce = normalizeFwdsecMarkdownInlineText(row?.['STEPS TO REPRODUCE'])

  const sections = [
    '',
    `**FAILED ASVS ${asvsId}**`,
    '#### Verification Requirement',
    verificationRequirement || 'N/A',
    '#### Test Results',
    testResults || 'N/A'
  ]

  if (stepsToReproduce) {
    sections.push('#### Steps To Reproduce', stepsToReproduce)
  }

  return sections.join('\n')
}

const decorateRowsWithFwdsecMarkdown = (rows) => rows.map(row => ({
  ...row,
  __ruleId: `${row['CATEGORY'] || ''} ${row['ASVS ID'] || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-\s\.]/g, '')
    .replaceAll(/(\s)+/g, '-'),
  __shortDescription: normalizeFwdsecMarkdownInlineText(row['TEST RESULTS']),
  __markdownDescription: buildFwdsecMarkdownDescription(row)
}))

const applyFwdsecMarkdownDescriptions = (output, rows) => {
  const run = output?.runs?.[0]
  const rules = run?.tool?.driver?.rules
  if (!run || !Array.isArray(run.results) || !Array.isArray(rules)) return

  const failedRows = rows.filter(row => row?.STATUS === 'FAILED')
  failedRows.forEach((row, index) => {
    const markdownDescription = row.__markdownDescription
    const shortDescription = row.__shortDescription
    const rule = rules[index]
    const result = run.results[index]

    if (rule) {
      if (rule.shortDescription) rule.shortDescription.text = shortDescription
      if (rule.fullDescription) rule.fullDescription.text = markdownDescription
    }

    if (result) {
      if (result.message) result.message.text = markdownDescription
      if (Array.isArray(result.locations)) {
        result.locations.forEach(location => {
          if (location?.message) location.message.text = markdownDescription
        })
      }
    }
  })
}

module.exports = {
  applyFwdsecMarkdownDescriptions,
  buildFwdsecMarkdownDescription,
  decorateRowsWithFwdsecMarkdown,
  normalizeFwdsecMarkdownInlineText
}
