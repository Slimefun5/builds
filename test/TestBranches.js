const Module = require('module');

const chai = require('chai');
const {assert} = chai;

const NOW = Date.parse("2026-06-26T00:00:00Z");
const day = 24 * 60 * 60 * 1000;
const iso = msAgoDays => new Date(NOW - msAgoDays * day).toISOString();

describe("Branch Selection Rule", () => {
    const {selectBranches} = require("../src/branches.js");

    it("lists only the default branch when there is nothing else", () => {
        const result = selectBranches({defaultBranch: "main", branches: ["main"], dates: {}}, NOW, 30);
        assert.deepStrictEqual(result, ["main"]);
    });

    it("lists main, development and the default branch", () => {
        const result = selectBranches({defaultBranch: "legacy", branches: ["legacy", "main", "development"], dates: {}}, NOW, 30);
        assert.deepStrictEqual(result, ["main", "development", "legacy"]);
    });

    it("does not duplicate the default branch when it is main", () => {
        const result = selectBranches({defaultBranch: "main", branches: ["main", "development"], dates: {}}, NOW, 30);
        assert.deepStrictEqual(result, ["main", "development"]);
    });

    it("includes a recently-committed other branch", () => {
        const result = selectBranches({defaultBranch: "main", branches: ["main", "feature"], dates: {feature: iso(5)}}, NOW, 30);
        assert.include(result, "feature");
    });

    it("excludes a stale other branch (no development to be ahead of)", () => {
        const result = selectBranches({defaultBranch: "main", branches: ["main", "feature"], dates: {feature: iso(200)}}, NOW, 30);
        assert.notInclude(result, "feature");
    });

    it("includes an other branch newer than development even if outside the window", () => {
        const info = {
            defaultBranch: "main",
            branches: ["main", "development", "feature"],
            // development committed 90d ago; feature 60d ago -> stale, but ahead of development
            dates: {development: iso(90), feature: iso(60)}
        };
        const result = selectBranches(info, NOW, 30);
        assert.include(result, "feature");
    });

    it("excludes an other branch older than both window and development", () => {
        const info = {
            defaultBranch: "main",
            branches: ["main", "development", "old"],
            dates: {development: iso(90), old: iso(200)}
        };
        const result = selectBranches(info, NOW, 30);
        assert.notInclude(result, "old");
    });
});

describe("Branch Discovery (stubbed API)", () => {
    const originalLoad = Module._load;
    let discoverBranches;

    const branchNames = ["main", "development", "feature-recent", "feature-ahead", "feature-old"];
    const dates = {
        development: iso(86),        // outside 30d window
        "feature-recent": iso(6),    // recent -> include
        "feature-ahead": iso(56),    // stale but newer than development -> include
        "feature-old": iso(117)      // older than both -> exclude
    };

    before(() => {
        Module._load = function (request, parent, isMain) {
            if (request === "request-promise-native") {
                return (opts) => {
                    const url = opts.url;
                    if (/\/commits\?/.test(url)) {
                        const sha = decodeURIComponent(url.match(/sha=([^&]+)/)[1]);
                        return Promise.resolve([{commit: {committer: {date: dates[sha]}}}]);
                    }
                    if (/\/branches/.test(url)) {
                        return Promise.resolve(branchNames.map(name => ({name})));
                    }
                    return Promise.resolve({default_branch: "main"});
                };
            }
            return originalLoad(request, parent, isMain);
        };

        delete require.cache[require.resolve("../src/branches.js")];
        discoverBranches = require("../src/branches.js").discoverBranches;
    });

    after(() => {
        Module._load = originalLoad;
        delete require.cache[require.resolve("../src/branches.js")];
    });

    it("discovers default + main + development + qualifying branches", async () => {
        const result = await discoverBranches("o", "r", {}, "token", NOW);
        assert.deepStrictEqual(result, ["main", "development", "feature-recent", "feature-ahead"]);
    });
});
