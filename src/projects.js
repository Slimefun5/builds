const FileSystem = require('fs')
const fs = FileSystem.promises
const path = require('path')

const log = require('../src/logger.js')
const lodash = require('lodash/lang')
const branches = require('../src/branches.js')

module.exports = {
  getProjects,
  writeIndex,
  addBuild,
  generateHTML,
  generateBadge,
  clearWorkspace,
  clearFolder,
  isValid,
  prefixFor
}

/**
 * Writes resources/index.json, the generated manifest the landing page reads to
 * learn which plugins and branches exist. Grouped one entry per plugin (owner/repo).
 *
 * @param  {Array}   jobs     The expanded jobs for this run
 * @param  {Boolean} logging  Whether the internal activity should be logged
 * @return {Promise}          Resolves when the file has been written
 */
function writeIndex (jobs, logging) {
  const index = {}

  for (const job of jobs) {
    const key = job.author + '/' + job.repo

    if (!index[key]) {
      index[key] = {
        owner: job.author,
        repository: job.repo,
        abandoned: !!(job.options && job.options.abandoned),
        branches: []
      }
    }

    index[key].branches.push({
      branch: job.branch,
      directory: job.directory,
      prefix: (job.options && job.options.prefix) || job.branch.toUpperCase()
    })
  }

  log(logging, "-> Writing 'index.json'...")
  return fs.writeFile(path.resolve(__dirname, '../resources/index.json'), JSON.stringify(index, null, 2), 'utf8')
}

/**
 * Derives a build-name prefix for a branch. stable/experimental keep their
 * conventional labels; any other branch uses an explicit fallback or its own name.
 *
 * @param  {String} branch    The branch name
 * @param  {String} fallback  An optional configured prefix
 * @return {String}           The prefix to use
 */
function prefixFor (branch, fallback) {
  if (branch === 'stable') return 'STABLE'
  if (branch === 'experimental') return 'EXP'
  return fallback || branch.toUpperCase()
}

/**
 * This will return a Promise that resolves to an Array of Jobs
 *
 * @param  {Boolean} logging Whether the internal activity should be logged
 * @return {Promise}         A Promise that resolves to an Array of Jobs
 */
async function getProjects (logging) {
  const data = await fs.readFile(path.resolve(__dirname, '../resources/repos.json'))
  const json = JSON.parse(data)
  const token = process.env.ACCESS_TOKEN
  const jobs = []

  for (const key in json) {
    const entry = json[key]
    const owner = key.split('/')[0]
    const rest = key.split('/')[1]
    const repo = rest.split(':')[0]
    const explicitBranch = rest.split(':')[1]

    let branchNames
    if (explicitBranch) {
      // Backward-compatible explicit single branch
      log(logging, '-> Found Project "' + key + '"')
      branchNames = [explicitBranch]
    } else {
      // Repo-level entry: discover which branches to build
      log(logging, '-> Discovering branches for "' + key + '"')
      branchNames = await branches.discoverBranches(owner, repo, entry.options, token)
      log(logging, '-> ' + key + ' -> [' + branchNames.join(', ') + ']')
    }

    const baseOptions = entry.options || {}

    for (const branch of branchNames) {
      const job = { author: owner, repo, branch }
      job.directory = owner + '/' + repo + '/' + branch
      job.options = Object.assign({}, baseOptions, { prefix: prefixFor(branch, baseOptions.prefix) })

      // A custom directory only makes sense for an explicit single-branch entry
      if (explicitBranch && baseOptions.custom_directory) {
        job.directory = baseOptions.custom_directory
      }

      if (entry.sonar && entry.sonar.enabled) {
        job.sonar = entry.sonar
      }

      jobs.push(job)
    }
  }

  return jobs
}

/**
 * This method adds the current job to the builds.json file and applies any Tags
 *
 * @param  {[type]}  job     The job to add
 * @param  {Boolean} logging Whether the internal activity should be logged
 * @return {Promise}         A Promise that resolves to an Array of Jobs
 */
function addBuild (job, logging) {
  return new Promise((resolve, reject) => {
    if (!isValid(job, true)) {
      reject(new Error('Invalid Job'))
      return
    }

    const file = path.resolve(__dirname, '../' + job.directory + '/builds.json')
    let builds = {}

    const append = () => {
      log(logging, '-> Adding Build #' + job.id)

      builds[job.id] = {
        id: job.id,
        sha: job.commit.sha,
        date: job.commit.date,
        timestamp: job.commit.timestamp,
        message: job.commit.message,
        author: job.commit.author,
        avatar: job.commit.avatar,
        license: job.license,
        candidate: 'DEVELOPMENT',
        status: (job.success ? 'SUCCESS' : 'FAILURE')
      }

      if (job.options && job.options.createJar === false) {
        builds[job.id].status = 'COMPILE_ONLY'
      }

      // A build reusing a published release links directly to that release asset
      if (job.source === 'release' && job.release) {
        builds[job.id].candidate = 'RELEASE'
        builds[job.id].tag = job.release.tag
        builds[job.id].jarUrl = job.release.jarUrl
      }

      if (job.success) {
        builds.last_successful = job.id
      }

      builds.latest = job.id

      if (!job.options || !job.options.ignoreTags) {
        // Apply any Tags
        for (const build in builds) {
          for (const tag in job.tags) {
            if (job.tags[tag] === builds[build].sha) {
              builds[build].candidate = 'RELEASE'
              builds[build].tag = tag
              break
            }
          }
        }
      }

      log(logging, "-> Saving 'builds.json'...")
      // Ensure the branch directory exists (release-reuse skips the clone that would
      // otherwise create it, and branch names may contain '/')
      fs.mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.writeFile(file, JSON.stringify(builds), 'utf8'))
        .then(resolve, reject)
    }

    log(logging, "-> Reading 'builds.json'...")

    if (FileSystem.existsSync(file)) {
      fs.readFile(file, 'utf8').then((data) => {
        builds = JSON.parse(data)
        append()
      }, append)
    } else append()
  })
}

/**
 * This method will generate an index.html page for the specified project.
 * It will use '/resources/template.html' as a template.
 *
 * @param  {Object} job      The currently handled Job Object
 * @param  {Boolean} logging Whether the internal activity should be logged
 * @return {Promise}         A promise that resolves when this activity finished
 */
function generateHTML (job, logging) {
  log(logging, "-> Generating 'index.html'...")

  return new Promise((resolve, reject) => {
    if (!isValid(job)) {
      reject(new Error('Invalid Job'))
      return
    }

    fs.readFile(path.resolve(__dirname, '../resources/template.html'), 'utf8').then((html) => {
      html = html.replace(/\${owner}/g, job.author)
      html = html.replace(/\${repository}/g, job.repo)
      html = html.replace(/\${branch}/g, job.branch)

      log(logging, "-> Saving 'index.html'...")

      const file = path.resolve(__dirname, '../' + job.directory + '/index.html')
      fs.mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.writeFile(file, html, 'utf8'))
        .then(resolve, reject)
    }, reject)
  })
}

/**
 * This method will generate a new badge for the specified project.
 * It will use '/resources/badge.svg' as a template.
 *
 * @param  {Object} job      The currently handled Job Object
 * @param  {Boolean} logging Whether the internal activity should be logged
 * @return {Promise}         A promise that resolves when this activity finished
 */
function generateBadge (job, logging) {
  log(logging, "-> Generating 'badge.svg'...")

  return new Promise((resolve, reject) => {
    if (!isValid(job)) {
      reject(new Error('Invalid Job'))
      return
    }

    fs.readFile(path.resolve(__dirname, '../resources/badge.svg'), 'utf8').then((svg) => {
      svg = svg.replace(/\${status}/g, job.success ? 'SUCCESS' : 'FAILURE')
      svg = svg.replace(/\${color}/g, job.success ? 'rgb(30, 220, 30)' : 'rgb(220, 30, 30)')

      log(logging, "-> Saving 'badge.svg'...")

      const file = path.resolve(__dirname, '../' + job.directory + '/badge.svg')
      fs.mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.writeFile(file, svg, 'utf8'))
        .then(resolve, reject)
    }, reject)
  })
}

/**
 * This method will delete a project's working directory and source files
 *
 * @param  {Object} job      The currently handled Job Object
 * @param  {Boolean} logging Whether the internal activity should be logged
 * @return {Promise}         A promise that resolves when this activity finished
 */
function clearWorkspace (job, logging) {
  if (!isValid(job, false)) {
    return Promise.reject(new Error('Invalid Job!'))
  }

  if (!FileSystem.existsSync(path.resolve(__dirname, '../' + job.directory + '/files'))) {
    return Promise.resolve()
  } else {
    return clearFolder(path.resolve(__dirname, '../' + job.directory + '/files'), logging)
  }
}

/**
 * This method will delete a directory recursively.
 *
 * @param  {String} file      The directory to be deleted
 * @param  {Boolean} logging  Whether the internal activity should be logged
 * @return {Promise}          A promise that resolves when this activity finished
 */
async function clearFolder (file, logging) {
  log(logging, "-> Deleting '" + path + "'")

  const stats = await fs.stat(file)

  if (stats.isDirectory()) {
    const files = await fs.readdir(file)
    const length = files.length
    let index = 0

    return new Promise((resolve, reject) => {
      const check = () => {
        if (length === index) {
          fs.rmdir(file).then(resolve, reject)
          return true
        } else {
          return false
        }
      }

      if (!check()) {
        let i

        const next = () => {
          index++
          check()
        }

        const cancel = (e) => {
          reject(e)
          i = length
        }

        for (i = 0; i < length; i++) {
          clearFolder(file + '/' + files[i], logging).then(next, cancel)
        }
      }
    })
  } else {
    return fs.unlink(file)
  }
}

/**
 * This method will check if a Job is valid.
 * null / undefined or incomplete Job Objects will fail.
 *
 * @param  {Object}  job        The job object to be tested
 * @param  {Boolean} compiled   Whether to check if the job has an ID and success-value
 * @return {Boolean}            Whether the job is a valid Job
 */
function isValid (job, compiled) {
  if (!lodash.isObject(job)) return false
  if (!lodash.isString(job.author)) return false
  if (!lodash.isString(job.repo)) return false
  if (!lodash.isString(job.branch)) return false
  if (!lodash.isString(job.directory)) return false

  if (compiled) {
    if (!lodash.isInteger(job.id)) return false
    if (!lodash.isBoolean(job.success)) return false
  }

  return true
}
