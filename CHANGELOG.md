# Changelog

## 0.6.7

- Fixed breaking change can't find file bug.

## 0.6.6

- Fixed octokit.issues undefined issue.

## 0.6.5

- Fixed last version could not work issue.

## 0.6.4

- Seprate the lint rules by type: data-plane | arm .
- Compatible with typescript 3.5.3

## 0.6.2

- Fix breaking-change always pass bug.

## 0.6.1

- Upgrade oav version to 0.20.9
- Octokit interface change (https://github.com/octokit/rest.js/releases/tag/v16.42.0)

## 0.5.1

- Upgrade oav version to 0.19.6

## 0.4.1

- Fix semantic validation should only run on specification files

## 0.4.0

- fix exec function
- replace diff with structural diff
- add package '@types/jsonpath'

## 0.3.9

- remove global variables
- `modelValidation`, `momentOTruthPostProcessing`, `postToGitHub`, and `semanticValidation` from https://github.com/Azure/azure-rest-api-specs
- `getSwaggers()` and `getExamples()` functions are added to `utils`
- relative log output path is fixed.

## 0.2.21

- Run AutoRest from `node_modules` for `breaking-changes`.

## 0.2.13

- Correct Swagger 2.0 Schema URL.

## 0.2.12

- Use Avocado git checkout and diff algorithms in breaking-changes and linter-diff.