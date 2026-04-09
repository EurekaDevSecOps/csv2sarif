const REPO_SEGMENT = '[A-Za-z0-9_.-]+'
const REPO_PATTERN = new RegExp(`^${REPO_SEGMENT}(?:\\/${REPO_SEGMENT})+$`)

const parseRepositoryFullName = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Repository must be a non-empty string')
  }

  const trimmed = value.trim()
  if (!REPO_PATTERN.test(trimmed)) {
    throw new Error('Repository must be in "owner/name" or "owner/path/name" format')
  }

  const parts = trimmed.split('/')
  const owner = parts[0]
  const name = parts[parts.length - 1]
  const path = parts.length > 2 ? parts.slice(1, -1).join('/') : ''

  return {
    owner,
    path,
    name,
    fullName: trimmed
  }
}

module.exports = {
  parseRepositoryFullName
}
