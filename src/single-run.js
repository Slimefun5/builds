global.status = {
  task: {},
  running: true
}

require('./main.js').start(true).then(() => {
  console.log('Run completed.')

  // I don't yet know why but for some reason GitHub Actions does not terminate itself at the moment.
  process.exit()
}, (error) => {
  // Never fail the workflow run: a fatal builder error is logged but the process exits
  // cleanly so a single bad run cannot spam maintainers with failed-workflow emails.
  console.error('Run failed:', error && error.stack ? error.stack : error)
  process.exit(0)
})
