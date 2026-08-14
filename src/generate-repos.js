const request = require('request-promise-native')
const fs = require('fs')
const path = require('path')

const log = require('../src/logger.js')

const MANIFEST_URL = 'https://raw.githubusercontent.com/Slimefun5/manifest/main/addons.json'
const REPOS_FILE = path.resolve(__dirname, '../resources/repos.json')

module.exports = { generate }

if (require.main === module) {
  generate(true).then(() => process.exit(0))
}

/**
 * Regenerates resources/repos.json from the shared addon manifest, replacing the
 * old hand-maintained file. Existing options objects are always carried through by
 * repo key, so a future hand-tuned entry is never silently wiped.
 *
 * This runs before every scheduled build, so a manifest fetch or parse failure must
 * never blank the project list or fail the workflow: on any error, repos.json is
 * simply left as-is and the promise still resolves.
 *
 * @param  {Boolean} logging Whether progress should be logged
 * @return {Promise}         Resolves once repos.json has been written, or left untouched
 */
async function generate (logging) {
  let manifest

  try {
    manifest = await fetchManifest()
  } catch (err) {
    log(logging, 'Failed to fetch addon manifest, leaving repos.json untouched: ' + (err && err.message))
    return
  }

  try {
    const existing = readExisting()
    const entries = [manifest.core, ...manifest.libraries, ...manifest.addons]
    const keys = Array.from(new Set(entries.map(entry => entry.repo))).sort()

    const next = {}
    for (const key of keys) {
      next[key] = { options: (existing[key] && existing[key].options) || {} }
    }

    fs.writeFileSync(REPOS_FILE, JSON.stringify(next, null, 4))
    log(logging, '-> Wrote repos.json with ' + keys.length + ' repositories')
  } catch (err) {
    log(logging, 'Failed to regenerate repos.json, leaving it untouched: ' + (err && err.message))
  }
}

function fetchManifest () {
  return request({
    url: MANIFEST_URL,
    json: true,
    timeout: 15000,
    headers: { 'User-Agent': "The Busy Biscuit's Repository Compiler" }
  })
}

function readExisting () {
  try {
    return JSON.parse(fs.readFileSync(REPOS_FILE, 'utf8'))
  } catch (err) {
    return {}
  }
}
