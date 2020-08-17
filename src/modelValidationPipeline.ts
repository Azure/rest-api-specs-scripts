// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { devOps, cli } from '@azure/avocado';
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
  if (issueType === "error" || issueType === "warning") {
    return `##vso[task.logissue type=${issueType}]${message}`;
  } else {
    return `##vso[task.logissue type=${issueType}]${message}`;
  }
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

export async function runScript() {
  const pr = await devOps.createPullRequestProperties(cli.defaultConfig());
  const swaggersToProcess = await utils.getFilesChangedInPR(pr);

  let exitCode: number = 0;

  const catchedErrors: { error: Error; url: string }[] = [];

  for (const swagger of swaggersToProcess) {
    try {
      const validator = new oav.ModelValidator(swagger, null, {});
      await validator.initialize();
      oav.log.consoleLogLevel = "off";
      console.log(`Validating "examples" and "x-ms-examples" in  ${swagger}:\n`)
      await validator.validateOperations();
      const validatorSpecValidationResult = validator.specValidationResult;
      const errors = oav.getErrorsFromModelValidation(validatorSpecValidationResult);
      if (errors.length > 0) {
        console.log(
          vsoLogIssueWrapper(
            "error",
            `Validating "examples" and "x-ms-examples" in  ${swagger}:\n`
          )
        );
        prettyPrint(errors, "error");
      }
      const pipelineResultDatas: format.ResultMessageRecord[] = errors.map(function(it) {
        let pipelineResultData: format.ResultMessageRecord = {
          type: "Result",
          level: "Error" as format.MessageLevel,
          message: it.details!.message || "",
          code: it.code || "",
          docUrl: getDocUrl(it.code),
          time: new Date(),
          extra: {
            operationId: it.operationId,
            scenario: it.scenario,
            source: it.source,
            responseCode: it.responseCode,
            severity: it.severity
          },
          paths: []
        }
        if (it.details!.url && it.details!.position) pipelineResultData.paths.push(
          {
            tag: "Url",
            path: utils.blobHref(
              utils.getGithubStyleFilePath(
                utils.getRelativeSwaggerPathToRepo(it.details!.url + '#L' + String(it.details!.position.line) || "")
              )
            )
          }
        )
        if (it.details!.jsonUrl && it.details!.jsonPosition) pipelineResultData.paths.push(
          {
            tag: "JsonUrl",
            path: utils.blobHref(
              utils.getGithubStyleFilePath(
                utils.getRelativeSwaggerPathToRepo(it.details!.jsonUrl + '#L' + String(it.details!.jsonPosition.line) || "")
              )
            )
          }
        )
        return pipelineResultData;
      });
      if (pipelineResultDatas.length > 0) {
        fs.appendFileSync("pipe.log", JSON.stringify(pipelineResultDatas) + "\n");
        exitCode = 1;
      }
    } catch (e) {
      console.error("error: ");
      console.error(e);
      //console.log(e)
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
        role: "Model Validation",
        url: it.url,
      },
    }));
    fs.appendFileSync("pipe.log", JSON.stringify(errorResult) + "\n");
  }
  process.exitCode = exitCode;
}
