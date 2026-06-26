const request = require('request-promise-native')

/**
 * Whether an asset name is a runnable plugin jar (not a sources/javadoc artifact).
 *
 * @param  {String} name  The asset file name
 * @return {Boolean}      Whether this asset is a runnable jar
 */
function isJar (name) {
  return name.endsWith('.jar') && !name.endsWith('-sources.jar') && !name.endsWith('-javadoc.jar')
}

/**
 * Extracts the first runnable jar asset from a release.
 *
 * @param  {Object} release  A GitHub release object
 * @return {Object|null}     { jarUrl, tag, sha } or null when the release has no runnable jar
 */
function pickAsset (release) {
  const asset = (release.assets || []).find(a => isJar(a.name))
  return asset ? { jarUrl: asset.browser_download_url, tag: release.tag_name, sha: release.target_commitish } : null
}

/**
 * Resolves the latest GitHub Release jar for a given branch.
 *
 * Prefers the newest release whose target_commitish matches the branch; falls back to
 * the newest release overall that carries a runnable jar (covers repos that publish
 * releases only from their primary branch). Any network/HTTP error resolves to null so
 * the caller can fall back to compiling from source.
 *
 * @param  {String} owner   Repository owner
 * @param  {String} repo    Repository name
 * @param  {String} branch  Branch name
 * @param  {String} token   GitHub API token (optional)
 * @return {Promise<Object|null>}  { jarUrl, tag, sha } or null
 */
async function findReleaseJar (owner, repo, branch, token) {
  try {
    const headers = { 'User-Agent': 'Slimefun5-builds' }
    if (token) {
      headers.Authorization = 'token ' + token
    }

    const body = await request({
      url: `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`,
      headers,
      json: false
    })

    const releases = JSON.parse(body)
    if (!Array.isArray(releases)) {
      return null
    }

    // Releases are returned newest-first; prefer one targeting this branch
    for (const release of releases) {
      if (release.target_commitish === branch) {
        const match = pickAsset(release)
        if (match) return match
      }
    }

    // Fall back to the newest release overall carrying a runnable jar
    for (const release of releases) {
      const match = pickAsset(release)
      if (match) return match
    }

    return null
  } catch (error) {
    return null
  }
}

module.exports = { findReleaseJar }
