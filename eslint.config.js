const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,

    // Configure modern CommonJS JavaScript used by the application.
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                process: "readonly",
                require: "readonly",
                module: "readonly",
                __dirname: "readonly",
                console: "readonly",
                fetch: "readonly",
                URL: "readonly",
            },
        },
        rules: {
            "no-unused-vars": "warn",
        },
    },

    // Jest provides these globals when running test files.
    {
        files: ["**/*.test.js"],
        languageOptions: {
            globals: {
                jest: "readonly",
                describe: "readonly",
                afterAll: "readonly",
                test: "readonly",
                expect: "readonly",
            },
        },
    },
];
