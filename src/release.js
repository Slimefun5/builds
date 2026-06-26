const request = require('request-promise-native')

function authHeaders (token) {
  const headers = { 'User-Agent': 'Slimefun5-builds' }

  if (token) {
    headers.Authorization = 'token ' + token
  }

  return headers
}

/**
 * Whether an asset name is a runnable plugin jar (not a sources/javadoc artifact).
 */
function isJar (name) {
  return name.endsWith('.jar') && !name.endsWith('-sources.jar') && !name.endsWith('-javadoc.jar')
}

/**
 * Extracts the first runnable jar asset URL from a release.
 */
function pickJarUrl (release) {
  const asset = (release.assets || []).find(a => isJar(a.name))
  return asset ? asset.browser_download_url : null
}

/**
 * Resolves a release tag to the commit SHA it points at, so the caller can tell
 * whether the release was built from a branch's current HEAD.
 */
async function resolveTagCommit (owner, repo, tag, token) {
  const body = await request({
    url: `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(tag)}`,
    headers: authHeaders(token),
    json: false
  })

  return JSON.parse(body).sha
}

/**
 * Resolves the latest GitHub Release jar published *for this exact branch*.
 *
 * Only releases whose target_commitish equals the branch are considered (there is
 * deliberately no cross-branch fallback - a feature branch must never reuse another
 * branch's release jar). The returned sha is the release's actual commit, so the
 * caller can require it to match the branch HEAD before reusing it. Any network/HTTP
 * error resolves to null, in which case the caller compiles from source.
 *
 * @return {Promise<Object|null>}  { jarUrl, tag, sha } or null
 */
async function findReleaseJar (owner, repo, branch, token) {
  try {
    const body = await request({
      url: `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`,
      headers: authHeaders(token),
      json: false
    })

    const releases = JSON.parse(body)
    if (!Array.isArray(releases)) {
      return null
    }

    // Releases are returned newest-first; only ones targeting this branch qualify
    for (const release of releases) {
      if (release.target_commitish !== branch) {
        continue
      }

      const jarUrl = pickJarUrl(release)
      if (!jarUrl) {
        continue
      }

      const sha = await resolveTagCommit(owner, repo, release.tag_name, token)
      return { jarUrl, tag: release.tag_name, sha }
    }

    return null
  } catch (error) {
    return null
  }
}

module.exports = { findReleaseJar }
