// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as stringMap from '@ts-common/string-map'
import * as path from 'path'
import * as fs from 'fs'
import * as yaml from "js-yaml";

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
   type:string
   code:string
   message:string
   readme:string
   readmeUrl:string
   tag?:string
} 

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
    let results: any[] = [];
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
  let logDir = path.resolve('output');
  if (!fs.existsSync(logDir)) {
      try {
          fs.mkdirSync(logDir);
      } catch (e) {
          if (e.code !== 'EEXIST') throw e;
      }
  }
  return logDir;
}
