const Module = require('module');

const chai = require('chai');
const {assert} = chai;

// Stubbed GitHub payloads (releases newest-first; tags resolve to commit SHAs)
const releases = [
    {
        tag_name: "v2",
        target_commitish: "experimental",
        assets: [{name: "X-EXP.jar", browser_download_url: "http://x/exp.jar"}]
    },
    {
        tag_name: "v1",
        target_commitish: "stable",
        assets: [
            {name: "X.jar", browser_download_url: "http://x/stable.jar"},
            {name: "X-sources.jar", browser_download_url: "http://x/sources.jar"}
        ]
    }
];
const tagCommits = {v1: "sha-stable-commit", v2: "sha-exp-commit"};

describe("Release Jar Resolver", () => {
    const originalLoad = Module._load;
    let findReleaseJar;

    before(() => {
        Module._load = function (request, parent, isMain) {
            if (request === "request-promise-native") {
                return (opts) => {
                    const url = opts.url;
                    if (/\/releases\?/.test(url)) {
                        return Promise.resolve(JSON.stringify(releases));
                    }
                    const match = url.match(/\/commits\/([^?]+)$/);
                    if (match) {
                        return Promise.resolve(JSON.stringify({sha: tagCommits[decodeURIComponent(match[1])]}));
                    }
                    return Promise.resolve("null");
                };
            }
            return originalLoad(request, parent, isMain);
        };

        delete require.cache[require.resolve("../src/release.js")];
        findReleaseJar = require("../src/release.js").findReleaseJar;
    });

    after(() => {
        Module._load = originalLoad;
        delete require.cache[require.resolve("../src/release.js")];
    });

    it("resolves the release targeting the branch, with its commit SHA", async () => {
        const result = await findReleaseJar("o", "r", "stable", "token");
        assert.strictEqual(result.jarUrl, "http://x/stable.jar");
        assert.strictEqual(result.tag, "v1");
        assert.strictEqual(result.sha, "sha-stable-commit");
    });

    it("resolves a different branch independently", async () => {
        const result = await findReleaseJar("o", "r", "experimental", "token");
        assert.strictEqual(result.jarUrl, "http://x/exp.jar");
        assert.strictEqual(result.sha, "sha-exp-commit");
    });

    it("returns null for a branch with no matching release (no cross-branch fallback)", async () => {
        const result = await findReleaseJar("o", "r", "feature/anything", "token");
        assert.isNull(result);
    });

    it("ignores -sources.jar assets", async () => {
        const result = await findReleaseJar("o", "r", "stable", "token");
        assert.notStrictEqual(result.jarUrl, "http://x/sources.jar");
    });
});
