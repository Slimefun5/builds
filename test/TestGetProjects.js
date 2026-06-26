const FileSystem = require('fs');

const chai = require('chai');
const {assert} = chai;

const branches = require('../src/branches.js');
const projects = require('../src/projects.js');

describe("getProjects branch expansion", () => {
    const originalReadFile = FileSystem.promises.readFile;
    const originalDiscover = branches.discoverBranches;

    before(() => {
        FileSystem.promises.readFile = () => Promise.resolve(JSON.stringify({
            "Slimefun5/DynaTech": {options: {}},
            "Other/Addon": {options: {abandoned: true}},
            "Legacy/Repo:stable": {options: {prefix: "STABLE"}}
        }));

        branches.discoverBranches = async (owner, repo) => {
            if (repo === "DynaTech") return ["stable", "experimental", "main"];
            if (repo === "Addon") return ["master"];
            return [];
        };
    });

    after(() => {
        FileSystem.promises.readFile = originalReadFile;
        branches.discoverBranches = originalDiscover;
    });

    it("expands repo-level entries into one job per discovered branch", async () => {
        const jobs = await projects.getProjects(false);
        const ids = jobs.map(job => `${job.author}/${job.repo}:${job.branch}`);
        assert.include(ids, "Slimefun5/DynaTech:stable");
        assert.include(ids, "Slimefun5/DynaTech:experimental");
        assert.include(ids, "Slimefun5/DynaTech:main");
        assert.include(ids, "Other/Addon:master");
    });

    it("keeps explicit owner/repo:branch entries as a single job", async () => {
        const jobs = await projects.getProjects(false);
        const legacy = jobs.filter(job => job.repo === "Repo");
        assert.strictEqual(legacy.length, 1);
        assert.strictEqual(legacy[0].branch, "stable");
        assert.strictEqual(legacy[0].options.prefix, "STABLE");
    });

    it("assigns per-branch prefixes and directories", async () => {
        const jobs = await projects.getProjects(false);

        const main = jobs.find(job => job.repo === "DynaTech" && job.branch === "main");
        assert.strictEqual(main.options.prefix, "MAIN");
        assert.strictEqual(main.directory, "Slimefun5/DynaTech/main");

        const experimental = jobs.find(job => job.repo === "DynaTech" && job.branch === "experimental");
        assert.strictEqual(experimental.options.prefix, "EXP");

        const addon = jobs.find(job => job.repo === "Addon");
        assert.strictEqual(addon.options.prefix, "MASTER");
        assert.strictEqual(addon.options.abandoned, true);
    });
});
