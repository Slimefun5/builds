const process = require('child-process-promise')
const lodash = require('lodash/lang')

const FileSystem = require('fs')
const fs = FileSystem.promises
const path = require('path')

const log = require('../src/logger.js')
const projects = require('../src/projects.js')

module.exports = {
  setVersion,
  compile,
  relocate,
  isValid
}

/**
 * This method changes the project's version in your build.gradle.kts file.
 * It also returns a Promise that resolves when it's done.
 *
 * @param {Object} job      The currently handled Job Object
 * @param {String} version  The Version that shall be set
 * @param {Boolean} compact Unused for Gradle, kept for API compatibility
 */
function setVersion (job, version, compact) {
  return new Promise((resolve, reject) => {
    if (!isValid(job)) {
      reject(new Error('Invalid Job'))
      return
    }

    const ktsFile = path.resolve(__dirname, '../' + job.directory + '/files/build.gradle.kts')
    const groovyFile = path.resolve(__dirname, '../' + job.directory + '/files/build.gradle')

    const file = FileSystem.existsSync(ktsFile) ? ktsFile : (FileSystem.existsSync(groovyFile) ? groovyFile : null)

    // Multi-module projects may define no version at the root; skip injection gracefully
    if (!file) {
      resolve()
      return
    }

    fs.readFile(file, 'utf8').then((data) => {
      const updated = data.replace(/^version\s*=\s*"[^"]*"/m, 'version = "' + version + '"')
      fs.writeFile(file, updated, 'utf8').then(resolve, reject)
    }, reject)
  })
}

/**
 * This method will compile a project using Gradle.
 * It runs './gradlew build --no-daemon -x test'
 *
 * @param  {Object} job      The currently handled Job Object
 * @param  {Object} cfg      Our config.js Object
 * @param  {Boolean} logging Whether the internal activity should be logged
 * @return {Promise}         A promise that resolves when this activity finished
 */
function compile (job, cfg, logging) {
  return new Promise((resolve, reject) => {
    if (!isValid(job)) {
      reject(new Error('Invalid Job'))
      return
    }

    const cwd = path.resolve(__dirname, '../' + job.directory + '/files')

    log(logging, "-> Executing 'chmod +x gradlew'")

    const chmod = process.spawn('chmod', ['+x', 'gradlew'], {
      cwd: cwd,
      shell: true
    })

    chmod.then(() => {
      log(logging, "-> Executing 'gradlew build'")

      // Hand the access token to Gradle as GH_TOKEN/GITHUB_TOKEN so the github-gradle plugin can
      // authenticate its GitHub API calls (resolving dependency release assets, e.g. Slimefun5/dough).
      // Unauthenticated, those calls hit HTTP 500 / the 60-req/hour limit and the compile fails.
      //
      // NB: `process` here is child-process-promise (required at the top of this file), NOT Node's
      // global, so its `.env` is undefined - read the real environment via globalThis.process.
      const nodeEnv = globalThis.process.env
      const tokenEnv = nodeEnv.ACCESS_TOKEN
        ? { GH_TOKEN: nodeEnv.ACCESS_TOKEN, GITHUB_TOKEN: nodeEnv.ACCESS_TOKEN }
        : {}

      const compiler = process.spawn('./gradlew', ['build', '--no-daemon', '-x', 'test'], {
        cwd: cwd,
        shell: true,
        env: { ...nodeEnv, ...tokenEnv }
      })

      const logger = (data) => {
        log(logging, data, true)
        fs.appendFile(path.resolve(__dirname, '../' + job.directory + '/' + job.repo + '-' + job.id + '.log'), data, 'UTF-8').catch(err => console.log(err))
      }

      compiler.childProcess.stdout.on('data', logger)
      compiler.childProcess.stderr.on('data', logger)

      compiler.then(resolve, reject)
    }, reject)
  })
}

/**
 * This method will relocate a project's compiled jar file
 * from build/libs/ to the appropriate directory.
 *
 * @param  {Object} job      The currently handled Job Object
 * @return {Promise}         A promise that resolves when this activity finished
 */
function isPluginJar (name) {
  return name.endsWith('.jar') &&
    !name.endsWith('-sources.jar') &&
    !name.endsWith('-javadoc.jar') &&
    !name.endsWith('-slim.jar')
}

/**
 * Recursively collects plugin jars found under any build/libs directory. Used as a
 * fallback for multi-module projects whose jar is emitted in a submodule rather than
 * the project root. Skips large irrelevant trees (.git, .gradle, caches).
 */
function collectJars (dir) {
  let results = []
  let entries

  try {
    entries = FileSystem.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    return results
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === '.gradle' || entry.name === 'node_modules') {
        continue
      }
      results = results.concat(collectJars(path.join(dir, entry.name)))
    } else if (isPluginJar(entry.name) && path.join(dir, entry.name).replace(/\\/g, '/').includes('/build/libs/')) {
      results.push(path.join(dir, entry.name))
    }
  }

  return results
}

function relocate (job) {
  if (!job.success) {
    return Promise.resolve()
  }

  const filesDir = path.resolve(__dirname, '../' + job.directory + '/files')
  const rootLibs = path.resolve(filesDir, 'build/libs')
  const dest = path.resolve(__dirname, '../' + job.directory + '/' + job.repo + '-' + job.id + '.jar')

  return new Promise((resolve, reject) => {
    let candidates = []

    // Single-module projects (the common case) emit their jar in the root build/libs
    if (FileSystem.existsSync(rootLibs)) {
      candidates = FileSystem.readdirSync(rootLibs).filter(isPluginJar).map(f => path.resolve(rootLibs, f))
    }

    // Multi-module projects emit their jar in a submodule's build/libs
    if (candidates.length === 0) {
      candidates = collectJars(filesDir)
    }

    if (candidates.length === 0) {
      reject(new Error('No jar file found in build/libs/'))
      return
    }

    // Prefer the largest jar (the shaded/plugin jar)
    candidates.sort((a, b) => FileSystem.statSync(b).size - FileSystem.statSync(a).size)
    fs.rename(candidates[0], dest).then(resolve, reject)
  })
}

/**
 * This method will check if a Job is valid.
 * null / undefined or incomplete Job Objects will fail.
 *
 * @param  {Object}  job The job object to be tested
 * @return {Boolean}     Whether the job is a valid Job
 */
function isValid (job) {
  if (!projects.isValid(job)) return false
  if (!lodash.isInteger(job.id)) return false

  return true
}
