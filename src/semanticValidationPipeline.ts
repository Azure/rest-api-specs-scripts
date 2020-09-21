// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { devOps, cli } from '@azure/avocado';
import { FilePosition } from "@ts-common/source-map";
import * as utils from './utils';
import * as oav from 'oav';
import * as format from "@azure/swagger-validation-common";
import * as fs from "fs-extra";
import jsYaml from "js-yaml";

type ErrorType = "error" | "warning";

function getDocUrl(id: string | undefined) {
  return `https://github.com/Azure/azure-rest-api-specs/blob/master/documentation/Semantic-and-Model-Violations-Reference.md#${id}`;
}

const vsoLogIssueWrapper = (issueType: string, message: string) => {
  return `##vso[task.logissue type=${issueType}]${message}`;
}

const prettyPrint = <T extends oav.NodeError<T>>(
  errors: ReadonlyArray<T> | undefined,
  errorType: ErrorType
) => {
  if (errors !== undefined) {
    for (const error of errors) {
      const yaml = jsYaml.dump(error);
      if (process.env["Agent.Id"]) {
        /* tslint:disable-next-line:no-console no-string-literal */
        console.error(vsoLogIssueWrapper(errorType, errorType));
        /* tslint:disable-next-line:no-console no-string-literal */
        console.error(vsoLogIssueWrapper(errorType, yaml));
      } else {
        /* tslint:disable-next-line:no-console no-string-literal */
        console.error("\x1b[31m", errorType, ":", "\x1b[0m");
        /* tslint:disable-next-line:no-console no-string-literal */
        console.error(yaml);
      }
    }
  }
}

interface ValidationError {
  validationCategory: string
  code?: string
  providerNamespace: unknown
  type: string
  inner?: oav.CommonError | oav.CommonError[]
  id?: unknown
  message?: string
  jsonref?: string
  "json-path"?: string
  jsonUrl?: string
  jsonPosition?: FilePosition
}

interface ValidationEntry {
  code: string
  error: string
  errors: ValidationEntry[] //for nested errors
  lineage: string[]
  message: string
  name: string
  params: Object[]
  path: string[]
  schemaPath: string
  schemaId: string
}

function constructBaseResultData(level: string, error: ValidationError | ValidationEntry): format.ResultMessageRecord {
  let pipelineResultData: format.ResultMessageRecord = {
    type: "Result",
    level: level as format.MessageLevel,
    message: error.message || "",
    code: error.code || "",
    docUrl: getDocUrl(error.code),
    time: new Date(),
    extra: { },
    paths:[]
  }
  return pipelineResultData;
}

function constructBaseResultDataForError(level: string, error: oav.SemanticValidationError): format.ResultMessageRecord {
  let pipelineResultData: format.ResultMessageRecord = {
    type: "Result",
    level: level as format.MessageLevel,
    message: error.details!.message || "",
    code: error.details!.code || error.code || "",
    docUrl: getDocUrl(error.code),
    time: new Date(),
    extra: { },
    paths:[]
  }
  return pipelineResultData;
}

export async function runScript() {
  const pr = await devOps.createPullRequestProperties(cli.defaultConfig())
  let swaggersToProcess = await utils.getFilesChangedInPR(pr);
  swaggersToProcess = swaggersToProcess.filter(function (item) {
    // Useful when debugging a test for a particular swagger.
    // Just update the regex. That will return an array of filtered items.
    //   return (item.match(/.*Microsoft.Logic.*2016-06-01.*/ig) !== null);
    return (item.match(/.*specification\/.*/ig) !== null);
  });

  let exitCode: number = 0;
  const catchedErrors: { error: Error; url: string }[] = [];

  for (const swagger of swaggersToProcess) {
    try {
      const validator = new oav.SemanticValidator(swagger, null,
        {shouldResolveDiscriminator : false,
        shouldResolveParameterizedHost : false,
        shouldResolveNullableTypes: false});
      await validator.initialize();
      oav.log.consoleLogLevel = "off";

      console.log(`Semantically validating  ${swagger}:\n`);
      await validator.validateSpec();

      if (validator.specValidationResult.resolveSpec) {
        const resolveSpecError = validator.specValidationResult.resolveSpec;
        const pipelineResultError = constructBaseResultData("Error", resolveSpecError);
        console.log(vsoLogIssueWrapper("error", `Semantically validating  ${swagger}:\n`));
        prettyPrint([resolveSpecError], "error");
        fs.appendFileSync("pipe.log", JSON.stringify(pipelineResultError) + "\n");
        exitCode = 1;
      } else if (validator.specValidationResult.validateSpec) {
        const validateSpec = validator.specValidationResult.validateSpec;
        if (!validateSpec.isValid) {

          const validateSpecErrors = oav.getErrorsFromSemanticValidationForUnifiedPipeline(validator.specValidationResult as any);
          const pipelineResultErrors: format.ResultMessageRecord[] = validateSpecErrors.map(function(it) {
            let pipelineResultError = constructBaseResultDataForError("Error", it);
            if (it.details!.jsonUrl && it.details!.jsonPosition) {
              pipelineResultError.paths.push({
                tag: "JsonUrl",
                path: utils.blobHref(
                  utils.getGithubStyleFilePath(
                    utils.getRelativeSwaggerPathToRepo(it.details!.jsonUrl + '#L' + String(it.details!.jsonPosition.line) || "")
                  )
                )}
              )
            }
            return pipelineResultError;
          });
          if (pipelineResultErrors.length > 0) {
            console.log(vsoLogIssueWrapper("error", `Semantically validating  ${swagger}:\n`));
            prettyPrint(validateSpecErrors as any, "error");
            fs.appendFileSync("pipe.log", JSON.stringify(pipelineResultErrors) + "\n");
          }

          const validateSpecWarnings = validateSpec.warnings as ValidationError[];
          const pipelineResultWarnings: format.ResultMessageRecord[] = validateSpecWarnings.map(function(it) {
            let pipelineResultWarning = constructBaseResultData("Warning", it);
            if (it.jsonUrl && it.jsonPosition) {
              pipelineResultWarning.paths.push({
                tag: "JsonUrl",
                path: utils.blobHref(
                  utils.getGithubStyleFilePath(
                    utils.getRelativeSwaggerPathToRepo(it.jsonUrl + '#L' + String(it.jsonPosition.line) || "")
                  )
                )
              })
            }
            return pipelineResultWarning;
          });

          if (pipelineResultWarnings.length > 0) {
            console.log(vsoLogIssueWrapper("warning", `Semantically validating  ${swagger}:\n`));
            prettyPrint(validateSpec.warnings as ValidationEntry[], "warning");
            fs.appendFileSync("pipe.log", JSON.stringify(pipelineResultWarnings) + "\n");
          }

          exitCode = 1;
        }
      }
      if (exitCode === 0) {
        console.log(`Semantically validating  ${swagger}: without error.\n`);
      }
    } catch (e) {
      console.error("error: ");
      console.error(e);
      catchedErrors.push({
        error: e,
        url: utils.blobHref(
          utils.getGithubStyleFilePath(
            utils.getRelativeSwaggerPathToRepo(swagger))),
      });
    }
  }
  if (catchedErrors.length > 0) {
    exitCode = 1;
    const errorResult: format.MessageLine = catchedErrors.map((it) => ({
      type: "Raw",
      level: "Error",
      message: it.error.stack || "",
      time: new Date(),
      extra: {
        role: "Semantic Validation",
        url: it.url,
      },
    }));
    fs.appendFileSync("pipe.log", JSON.stringify(errorResult) + "\n");
  }
  process.exitCode = exitCode;
}
