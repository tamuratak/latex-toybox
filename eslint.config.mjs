import eslint from "@eslint/js";
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            "src/lib/await-semaphore/",
            "src/lib/synctexjs/",
            "viewer/viewer.js",
            "viewer/viewer.mjs",
            "data/",
            "dev/",
            "icons/",
            "node_modules/",
            "out/",
            "resources/",
            "samples/",
            "syntax/",
            ".vscode/",
            ".vscode-test/",
            ".git/",
            ".github/",
            ".devcontainer/",
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        files: [
            "src/**/*.ts",
            "test/**/*.ts"
        ],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2018,
            sourceType: "commonjs",
            parserOptions: {
                project: "./tsconfig.eslint.json",
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/naming-convention": ["error", {
                selector: "default",
                format: ["camelCase", "PascalCase", "UPPER_CASE"],
                leadingUnderscore: "allow",
            }, {
                    selector: "method",
                    format: ["camelCase"],
                }, {
                    selector: "function",
                    format: ["camelCase"],
                }, {
                    selector: "typeLike",
                    format: ["PascalCase"],
                }, {
                    selector: "objectLiteralProperty",
                    format: null,
                }],
            "@typescript-eslint/consistent-type-assertions": ["error", {
                assertionStyle: "as",
                objectLiteralTypeAssertions: "never",
            }],
            "@typescript-eslint/no-empty-interface": ["error", {
                allowSingleExtends: true,
            }],
            "@typescript-eslint/no-floating-promises": ["error", {
                checkThenables: true,
            }],
            "@typescript-eslint/no-invalid-void-type": "error",
            "@typescript-eslint/no-misused-promises": ["error", {
                checksVoidReturn: {
                    arguments: false,
                },
            }],
            "no-shadow": "off",
            "@typescript-eslint/no-shadow": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            "no-unused-expressions": "off",
            "@typescript-eslint/no-unused-expressions": "error",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    "args": "all",
                    "argsIgnorePattern": "^_",
                    "caughtErrors": "all",
                    "caughtErrorsIgnorePattern": "^_",
                    "destructuredArrayIgnorePattern": "^_",
                    "varsIgnorePattern": "^_",
                    "ignoreRestSiblings": true
                }
            ],
            "@typescript-eslint/no-require-imports": "error",
            "@typescript-eslint/prefer-includes": "error",
            "@typescript-eslint/prefer-readonly": "error",
            "no-return-await": "off",
            "@typescript-eslint/return-await": "error",
            "require-await": "off",
            "@typescript-eslint/require-await": "error",
            "@typescript-eslint/unbound-method": "error",
            "curly": "error",
            "default-case": "error",
            "eol-last": "error",
            "eqeqeq": ["error", "always"],
            "func-call-spacing": ["error", "never"],
            "no-caller": "error",
            "no-constant-condition": "error",
            "no-eval": "error",
            "no-invalid-this": "error",
            "no-multiple-empty-lines": "error",
            "no-multi-spaces": "error",
            "no-new-wrappers": "error",
            "no-trailing-spaces": "error",
            "no-empty": ["error", {
                allowEmptyCatch: true,
            }],
            "object-shorthand": "error",
            "one-var": ["error", {
                initialized: "never",
                uninitialized: "never",
            }],
            "prefer-arrow-callback": ["error", {
                allowUnboundThis: false,
            }],
            "quotes": ["error", "single", {
                avoidEscape: true,
            }],
            "space-before-function-paren": ["error", {
                anonymous: "always",
                named: "never",
                asyncArrow: "always",
            }],
        },
    },
    {
        files: ["viewer/**/*.ts"],
        languageOptions: {
            ecmaVersion: 2018,
            sourceType: "script",
            parserOptions: {
                project: "./tsconfig.eslint.viewer.json",
            },
        },
        rules: {
            "@typescript-eslint/naming-convention": ["error", {
                selector: "interface",
                prefix: ["I"],
                format: ["PascalCase"],
            }],
            "@typescript-eslint/ban-ts-comment": "off",
        },
    }
)
