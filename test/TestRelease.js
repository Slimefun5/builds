const Module = require('module');

const chai = require('chai');
const {assert} = chai;

// Stubbed GitHub /releases payload (newest-first, as the API returns it)
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

describe("Release Jar Resolver", () => {
    const originalLoad = Module._load;
    let findReleaseJar;

    before(() => {
        // Replace request-promise-native with a stub that returns our fixture
        Module._load = function (request, parent, isMain) {
            if (request === "request-promise-native") {
                return () => Promise.resolve(JSON.stringify(releases));
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

    it("resolves the release that targets the branch", async () => {
        const result = await findReleaseJar("o", "r", "stable", "token");
        assert.strictEqual(result.jarUrl, "http://x/stable.jar");
        assert.strictEqual(result.tag, "v1");
        assert.strictEqual(result.sha, "stable");
    });

    it("resolves a different branch independently", async () => {
        const result = await findReleaseJar("o", "r", "experimental", "token");
        assert.strictEqual(result.jarUrl, "http://x/exp.jar");
        assert.strictEqual(result.tag, "v2");
    });

    it("falls back to the newest jar for an unknown branch", async () => {
        const result = await findReleaseJar("o", "r", "does-not-exist", "token");
        assert.strictEqual(result.jarUrl, "http://x/exp.jar");
    });

    it("ignores -sources.jar assets", async () => {
        const result = await findReleaseJar("o", "r", "stable", "token");
        assert.notStrictEqual(result.jarUrl, "http://x/sources.jar");
    });
});
