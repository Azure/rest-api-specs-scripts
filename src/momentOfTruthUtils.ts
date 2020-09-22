// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as stringMap from '@ts-common/string-map'
import * as path from 'path'
import * as yaml from "js-yaml";
import * as format from "@azure/swagger-validation-common";
import * as utils from "./utils";
import * as fs from "fs-extra";

export type Issue = {
  readonly type?: string
  readonly code: unknown
  readonly message: unknown
  readonly id: string
  readonly validationCategory: string
  readonly providerNamespace: unknown
  readonly resourceType: unknown
  readonly sources: readonly unknown[]
  readonly jsonref: string
  readonly filePath: string
  readonly lineNumber: number
}

export type BeforeOrAfter = 'before' | 'after'

export type LintingResultMessage = {
   type:string
   code:string
   message:string
   id:string
   validationCategory:string
   providerNamespace:string | boolean | undefined
   resourceType:string | boolean | undefined
   sources:string[]
   jsonref:string 
   "json-path":string
} 

export type AutorestError = {
  type: string;
  code: string;
  message: string;
  readme: string;
  readmeUrl: string;
  tag?: string;
  context: string;
}; 

export class LintingResultParser {
  results: string;
  AutoRestErrors = [
    '{\n  "Channel": "error"',
    '{\n  "Channel": "fatal"',
    "Process() cancelled due to exception",
  ];
  regexLintResult = /\{\n  "type": "[\s\S]*?\n\}/gi;

  constructor(output: string) {
    this.results = output;
  }

  getResult() {
    const results: any[] = [];
    let matches;
    while ((matches = this.regexLintResult.exec(this.results))) {
      try {
          const oneMessage = yaml.load(matches[0]!) as
        | undefined
        | LintingResultMessage;
        if (oneMessage) {
          results.push(oneMessage);
        }
      }
      catch(e) {
        console.log(e)
      }
    }
    return results;
  }

  hasAutoRestError() {
    return this.results ? this.AutoRestErrors.some(
      (error) => this.results.indexOf(error) !== -1
    ) : false;
  }

  getAutoRestError() {
    if (this.hasAutoRestError()) {
      return this.results.replace(this.regexLintResult, "");
    }
    return ""
  }
}

export type File = {
  [key in BeforeOrAfter]: readonly Issue[]
}

/**
 * Moment of truth is using this type for defining a format of file which is produced by
 * `momentOfTruth.ts` script and `momentOfTruthPostProcessing`.
 */
export type FinalResult = {
  readonly pullRequest: unknown,
  readonly repositoryUrl: unknown,
  readonly files: stringMap.MutableStringMap<File>
}

// Creates and returns path to the logging directory
export function getLogDir() {
  const logDir = path.resolve('output');
  if (!fs.existsSync(logDir)) {
      try {
          fs.mkdirSync(logDir);
      } catch (e) {
          if (e.code !== 'EEXIST') throw e;
      }
  }
  return logDir;
}

export type Mutable<T extends object> = {
  -readonly [K in keyof T]: T[K];
};

export type MutableIssue = Mutable<Issue>;


export function getLine(jsonRef: string): number | undefined {
  try {
    return parseInt(
      jsonRef.substr(jsonRef.indexOf(".json:") + 6).split(":")[0]
    );
  } catch (error) {
    return undefined;
  }
}

export function getFile(jsonRef: string) {
  try {
    const start = jsonRef.indexOf("specification");
    return jsonRef.substr(start, jsonRef.indexOf(".json") + 5 - start);
  } catch (error) {
    return undefined;
  }
}

export function getDocUrl(id: string) {
  return `https://github.com/Azure/azure-rest-api-specs/blob/master/documentation/openapi-authoring-automated-guidelines.md#${id}`;
}

export function composeLintResult(it: MutableIssue) {
  const severityMap: Map<string, string> = new Map([
    ["error", "Error"],
    ["warning", "Warning"],
    ["info", "Info"],
  ]);

  const type = severityMap.get(String(it.type).toLowerCase())
    ? severityMap.get(String(it.type).toLowerCase())
    : "Info";
  return {
    level: type as format.MessageLevel,
    message: String(it.message).replace(/"/g, "'"),
    code: String(it.code),
    id: String(it.id),
    docUrl: getDocUrl(it.id),
    time: new Date(),
    extra: {
      validationCategory: it.validationCategory,
      providerNamespace: it.providerNamespace,
      resourceType: it.resourceType,
      jsonref: it.jsonref,
      filePath: it.filePath,
      lineNumber: it.lineNumber,
      sources: it.sources,
    },
    paths: [
      {
        tag: "New",
        path: utils.blobHref(
          utils.getGithubStyleFilePath(
            utils.getRelativeSwaggerPathToRepo(
              it.filePath + "#L" + String(it.lineNumber) || ""
            )
          )
        ),
      },
    ],
  };
}
