const testJobs = require('../test/TestJobs.js');

module.exports = (assert, github) => {
    return function() {
        this.timeout(8000);

        testJobs(false, (job) => github.getTags(job));

        it("should resolve for 'Slimefun5/GitHubWebAPI4Java'", () => {
            var job = {
                author: "Slimefun5",
                repo: "GitHubWebAPI4Java",
                branch: "master",
                directory: "Slimefun5/GitHubWebAPI4Java/master"
            }

            return github.getTags(job).then((tags) => Promise.all([
                assert.exists(tags),
                assert.notExists(tags.documentation_url),
                assert.isArray(tags),

                assert.exists(tags[0]),
                assert.exists(tags[0].name)
            ]));
        });

        it("should resolve with an empty Array for 'Slimefun5/Slimefun5:main' (No Tags)", () => {
            var job = {
                author: "Slimefun5",
                repo: "Slimefun5",
                branch: "main",
                directory: "Slimefun5/Slimefun5/main"
            }

            return github.getTags(job).then((tags) => {
                assert.exists(tags);
                assert.notExists(tags.documentation_url);
                assert.isArray(tags);
                assert.isEmpty(tags);
            });
        });

        it("should reject for 'Slimefun5/____' (Not-existing Repository)", () => {
            var job = {
                author: "Slimefun5",
                repo: "____",
                branch: "master",
                directory: "Slimefun5/____/master"
            }

            return assert.isRejected(github.getTags(job));
        });
    }
}

