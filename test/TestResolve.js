const path = require("path");

const chai = require('chai');
const {assert} = chai;

// main.js loads its config from the JSON_CONFIG env when present (no file writes)
process.env.JSON_CONFIG = process.env.JSON_CONFIG || "{}";

const main = require('../src/main.js');

describe("Build Source Resolver", () => {

    it("reuses a release when 'auto' and a release exists", () => {
        assert.strictEqual(main.resolveSource({}, {jarUrl: "u", tag: "v1"}), "release");
    });

    it("compiles when 'auto' and no release exists", () => {
        assert.strictEqual(main.resolveSource({}, null), "compile");
    });

    it("compiles when undefined options and no release", () => {
        assert.strictEqual(main.resolveSource(undefined, null), "compile");
    });

    it("forces compile when options.source = 'compile'", () => {
        assert.strictEqual(main.resolveSource({source: "compile"}, {jarUrl: "u"}), "compile");
    });

    it("forces release when options.source = 'release'", () => {
        assert.strictEqual(main.resolveSource({source: "release"}, null), "release");
    });
});
