const testJobs = require('../test/TestJobs.js');

module.exports = (assert, github) => {
    return function() {
        this.timeout(8000);

        testJobs(false, (job) => github.getLicense(job));

        it("should resolve for 'Slimefun5/builds'", () => {
            var job = {
                author: "Slimefun5",
                repo: "builds",
                branch: "gh-pages",
				directory: "Slimefun5/builds/gh-pages"
            }

            return github.getLicense(job).then((license) => Promise.all([
                assert.exists(license),
                assert.isObject(license),

                assert.notExists(license.documentation_url),

                assert.exists(license.name),
                assert.exists(license.path),
                assert.exists(license.license.spdx_id)
            ]));
        });

        it("should reject for 'Slimefun5/____' (Not-existing Repository)", () => {
            var job = {
                author: "Slimefun5",
                repo: "____",
                branch: "master"
            }

            return assert.isRejected(github.getLicense(job));
        });

        it("should reject for 'Slimefun5/Slimecraft' (No License)", () => {
            var job = {
                author: "Slimefun5",
                repo: "Slimecraft",
                branch: "master"
            }

            return assert.isRejected(github.getLicense(job));
        });
    }
}

