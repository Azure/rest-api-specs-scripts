# Changelog

## 0.11.0

- Improve error handling for Lint Diff - separate autorest error from the whole error output & refactor the code.
- Change the method to find related tags through changed files , let tags with 'schema','profile','only' have low prior.
- If no swagger file changed and only readme file changed, the LintDiff would be skipped .

## 0.10.6

- Fix bug: LintDiff does not report error when before-lint-errors-count is bigger or equal than after-lint-errors-count.

## 0.10.5

- Remove old tag for Lint Diff.

## 0.10.4

- LintDiff support unified pipeline log format.

## 0.10.3

- Breaking change print error log
- swagger file filter regex fix

## 0.10.2

- Set breaking change target branch whitelist [RPSaaSMaster, RPSaaSDev, master]. If target branch not in this whitelist,
  the breaking change will compare against master.

## 0.10.1

- Set exitCode for semantic validation when process normally.

## 0.10.0

- Breaking change support unified pipeline log format

## 0.9.2

- Upgrade oav version to 0.21.6.
- Upgrade @azure/oad version to 0.8.1.

## 0.9.1

- Fixed the bug:The LintDiff exit with code 1 when new RP is being added .It caused by an unhandled error:
  read non-existing readme file .
- Upgrade @azure/oad version to 0.8.0.

## 0.9.0

- The LintDiff will check the changed files which are not belong to default tag.

## 0.8.0

- The breaking change checking will always aganist master branch .

## 0.7.3

- Upgrade oav version to 0.21.5 with exception info output to console when pretty switch is on.

## 0.7.2

- Upgrade oav version to 0.21.4.

## 0.7.1

- Upgrade oav version to 0.21.3 with the change on global parameters validation in request.

## 0.7.0

- Upgrade oav version to 0.21.1.
- Enable pass the version of lint tool via environment variable.

## 0.6.8

- breaking change output formatted json

## 0.6.7

- Fixed breaking change can't find file bug. doOnTargetBranch execute function until checkout branch finished.
- The root cause is the switch branch function don't use await to pause execution process. The next code block execute directly and doesn't wait switch branch function finished, as a result it actually doesn't run on target branch.

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
