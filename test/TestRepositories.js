const FileSystem = require('fs');
const fs = FileSystem.promises;
const path = require("path");

const chai = require('chai');
chai.use(require('chai-as-promised'));
const {assert} = chai;

const cfg = require('../src/config.js')(path.resolve(__dirname, "../resources/config.json"));
const github = require('../src/github.js')(cfg.github);
const projects = require('../src/projects.js');

fs.readFile(path.resolve(__dirname, "../resources/repos.json")).then((data) => {
    var json = JSON.parse(data);

    describe("Repository Integrity Test", () => {
        it("is valid JSON", () => {
            return assert.exists(json);
        });

        it("is a JSON Object", () => {
            return assert.isObject(json);
        });

        it("can transform into a Job Queue", function() {
            // Branch discovery performs live GitHub API calls
            this.timeout(180000);
            return projects.getProjects().then((jobs) => assert.isArray(jobs));
        });
    });

    describe("Repository Validator", () => {
        for (var repo in json) {
            validate(repo);
        }
    });
});

function validate(key) {
    describe(key, () => {
        // Keys are repo-level (owner/repo) or explicit (owner/repo:branch)
        it('follows the Pattern: owner/repo(:branch)', () => {
            return assert.match(key, /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/);
        });

        it('has a valid owner and repository', () => {
            var owner = key.split("/")[0];
            var repository = key.split("/")[1].split(":")[0];

            assert.isString(owner);
            assert.isNotEmpty(owner);
            assert.isString(repository);
            assert.isNotEmpty(repository);
        });

        it('exists on GitHub', function() {
            this.timeout(8000);

            var owner = key.split("/")[0];
            var rest = key.split("/")[1];

            var job = {
                author: owner,
                repo: rest.split(":")[0],
                branch: rest.split(":")[1] || "HEAD"
            };

            job.directory = job.author + "/" + job.repo + "/" + job.branch;

            return assert.isFulfilled(github.exists(job));
        });
    });
}
