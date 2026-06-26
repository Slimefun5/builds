const FileSystem = require('fs');
const path = require("path");

const chai = require('chai');
const {assert} = chai;

const projects = require('../src/projects.js');

// Reproduces the release-reuse case: no clone happened, so the (nested) branch
// directory does not exist yet when builds.json is written.
describe("Output Directory Creation", () => {
    const root = path.resolve(__dirname, "../Slimefun5__testtmp");
    const directory = "Slimefun5__testtmp/Repo/feature/nested-branch";

    after(() => {
        try {
            FileSystem.rmSync(root, {recursive: true, force: true});
        } catch (error) { /* best effort cleanup */ }
    });

    it("addBuild creates a missing nested branch directory", async () => {
        const job = {
            author: "Slimefun5__testtmp",
            repo: "Repo",
            branch: "feature/nested-branch",
            directory: directory,
            id: 1,
            success: true,
            commit: {sha: "abc123", date: "01 Jan 2026", timestamp: 20260101000000, message: "m", author: "a", avatar: ""},
            license: {name: "X", id: "X", url: "u"},
            tags: {}
        };

        await projects.addBuild(job, false);

        const file = path.resolve(__dirname, "../" + directory + "/builds.json");
        assert.isTrue(FileSystem.existsSync(file), "builds.json should be created in the nested dir");
    });
});
