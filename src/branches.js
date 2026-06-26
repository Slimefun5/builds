const request = require('request-promise-native')

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Performs an authenticated GitHub API request that resolves with parsed JSON.
 *
 * @param  {String} url    The full API URL
 * @param  {String} token  GitHub API token (optional)
 * @return {Promise}       Resolves with the parsed response body
 */
function api (url, token) {
  const headers = {
    'User-Agent': 'Slimefun5-builds',
    Accept: 'application/vnd.github.v3+json'
  }

  if (token) {
    headers.Authorization = 'token ' + token
  }

  return request({ url, headers, json: true })
}

/**
 * Fetches a repository's metadata (used for its default branch).
 */
function getRepoInfo (owner, repo, token) {
  return api(`https://api.github.com/repos/${owner}/${repo}`, token)
}

/**
 * Lists a repository's branches.
 *
 * @return {Promise<Array>}  Resolves with [{ name, commit }]
 */
function listBranches (owner, repo, token) {
  return api(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, token)
}

/**
 * Returns the date of a branch's latest commit as an ISO string.
 */
async function getCommitDate (owner, repo, branch, token) {
  const commits = await api(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, token)
  return commits[0].commit.committer.date
}

/**
 * Pure branch-selection rule. Always keeps the default branch; keeps stable and
 * experimental when present; keeps any other branch whose latest commit is within
 * the recency window OR newer than experimental's latest commit.
 *
 * @param  {Object} info        { defaultBranch, branches: [name], dates: { name: ISO } }
 * @param  {Number} now         Current time in ms
 * @param  {Number} windowDays  Recency window in days
 * @return {Array<String>}      The branch names to build (deduplicated)
 */
function selectBranches (info, now, windowDays) {
  const window = windowDays || 30
  const branches = info.branches || []
  const dates = info.dates || {}
  const selected = []

  const keep = name => {
    if (name && branches.includes(name) && !selected.includes(name)) {
      selected.push(name)
    }
  }

  // Always-included branches, in a stable order
  keep('stable')
  keep('experimental')

  // The default branch is always built, even if it is none of the above
  if (info.defaultBranch && !selected.includes(info.defaultBranch)) {
    selected.push(info.defaultBranch)
  }

  const cutoff = now - window * DAY_MS
  const expDate = dates.experimental ? new Date(dates.experimental).getTime() : null

  for (const name of branches) {
    if (selected.includes(name) || name === 'stable' || name === 'experimental') {
      continue
    }

    if (!dates[name]) {
      continue
    }

    const date = new Date(dates[name]).getTime()
    const recent = date >= cutoff
    const aheadOfExperimental = expDate !== null && date > expDate

    if (recent || aheadOfExperimental) {
      selected.push(name)
    }
  }

  return selected
}

/**
 * Discovers which branches of a repository should be built.
 *
 * Fetches commit dates only for experimental and "other" branches (stable/default
 * are decided without a date), then applies selectBranches. Any API failure resolves
 * to an empty list so the caller can skip the repo without aborting the run.
 *
 * @param  {String} owner    Repository owner
 * @param  {String} repo     Repository name
 * @param  {Object} options  The repo's options (may carry windowDays)
 * @param  {String} token    GitHub API token
 * @param  {Number} now      Current time in ms (injectable for tests)
 * @return {Promise<Array<String>>}  Branch names to build
 */
async function discoverBranches (owner, repo, options, token, now) {
  try {
    const info = await getRepoInfo(owner, repo, token)
    const defaultBranch = info.default_branch
    const list = await listBranches(owner, repo, token)
    const names = list.map(branch => branch.name)

    // Only the branches whose dates actually influence the decision need a lookup
    const needDates = new Set()
    if (names.includes('experimental')) {
      needDates.add('experimental')
    }
    for (const name of names) {
      if (name !== 'stable' && name !== 'experimental' && name !== defaultBranch) {
        needDates.add(name)
      }
    }

    const dates = {}
    for (const name of needDates) {
      try {
        dates[name] = await getCommitDate(owner, repo, name, token)
      } catch (error) {
        // A missing date just means this branch cannot qualify on recency
      }
    }

    const window = (options && options.windowDays) || 30
    return selectBranches({ defaultBranch, branches: names, dates }, now || Date.now(), window)
  } catch (error) {
    return []
  }
}

module.exports = { selectBranches, discoverBranches, getRepoInfo, listBranches, getCommitDate }
