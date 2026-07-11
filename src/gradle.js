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

    const file = FileSystem.existsSync(ktsFile) ? ktsFile : groovyFile

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
function relocate (job) {
  if (!job.success) {
    return Promise.resolve()
  }

  const libsDir = path.resolve(__dirname, '../' + job.directory + '/files/build/libs')
  const dest = path.resolve(__dirname, '../' + job.directory + '/' + job.repo + '-' + job.id + '.jar')

  return new Promise((resolve, reject) => {
    fs.readdir(libsDir).then((files) => {
      const jars = files.filter(f =>
        f.endsWith('.jar') &&
        !f.endsWith('-sources.jar') &&
        !f.endsWith('-javadoc.jar') &&
        !f.endsWith('-slim.jar')
      )

      if (jars.length === 0) {
        reject(new Error('No jar file found in build/libs/'))
        return
      }

      // Pick the first matching jar (shadow jar)
      const jarFile = path.resolve(libsDir, jars[0])
      fs.rename(jarFile, dest).then(resolve, reject)
    }, reject)
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
