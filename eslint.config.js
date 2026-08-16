const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        ignores: ["node_modules/**", "coverage/**"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                process: "readonly",
                require: "readonly",
                module: "readonly",
                __dirname: "readonly",
                console: "readonly",
                Buffer: "readonly",
                URL: "readonly",
                fetch: "readonly",
                AbortSignal: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["**/*.test.js"],
        languageOptions: {
            globals: {
                jest: "readonly",
                describe: "readonly",
                beforeAll: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
                afterAll: "readonly",
                test: "readonly",
                expect: "readonly",
            },
        },
    },
    {
        files: ["frontend/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                localStorage: "readonly",
                FormData: "readonly",
                URLSearchParams: "readonly",
                fetch: "readonly",
                URL: "readonly",
                console: "readonly",
            },
        },
    },
];
