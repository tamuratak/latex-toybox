import eslint from "@eslint/js";
import tseslint from 'typescript-eslint';

const commonRules = {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-empty-function": "off",
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
    "@typescript-eslint/no-unsafe-enum-comparison": "off",
    "@typescript-eslint/prefer-includes": "error",
    "@typescript-eslint/prefer-readonly": "error",
    "no-return-await": "off",
    "@typescript-eslint/return-await": "error",
    "@typescript-eslint/restrict-template-expressions": "off",
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
};

export default tseslint.config(
    {
        ignores: [
            "eslint.config.mjs",
            "src/lib/await-semaphore/",
            "src/lib/synctexjs/",
            "viewer/viewer.js",
            "viewer/viewer.mjs",
            "types/**/*.d.ts",
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
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylistic,
    {
        languageOptions: {
            ecmaVersion: 2018,
            parserOptions: {
                projectService: {
                    defaultProject: "tsconfig.json",
                },
                tsconfigRootDir: import.meta.dirname
            },
        },
        rules: {
            "@typescript-eslint/naming-convention": ["error",
                {
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
                }
            ],
            ...commonRules,
        },
    },
    {
        languageOptions: {
            ecmaVersion: 2018,
            parserOptions: {
                projectService: {
                    defaultProject: "tsconfig.json",
                },
                tsconfigRootDir: import.meta.dirname + "/viewer"
            },
        },
        rules: {
            "@typescript-eslint/naming-convention": ["error",
                {
                    selector: "default",
                    format: ["camelCase", "PascalCase", "UPPER_CASE"],
                    leadingUnderscore: "allow",
                }, {
                    selector: "method",
                    format: ["camelCase"],
                    leadingUnderscore: "allow",
                }, {
                    selector: "function",
                    format: ["camelCase"],
                }, {
                    selector: "typeLike",
                    format: ["PascalCase"],
                }, {
                    selector: "objectLiteralProperty",
                    format: null,
                }
            ],
            "@typescript-eslint/ban-ts-comment": "off",
            ...commonRules
        },
    }
)
