// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import { devOps, cli } from '@azure/avocado';
import * as utils from './utils';
import { getLinterResult } from "./momentOfTruth";
import * as fs from "fs-extra";
import * as YAML from "js-yaml";
import { LintingResultParser, LintingResultMessage, AutorestError, Issue } from './momentOfTruthUtils'
import { composeLintResult,MutableIssue,Mutable } from './momentOfTruthPostProcessing';
/**
 * 1 run linter rpass
 * 2 check  
 */

 function isRpaasBranch() {
   const targetBranch = utils.getTargetBranch();
   const RPaasBranches = ["RpaasMaster", "RpaasDev"];
   return RPaasBranches.some((b) => b === targetBranch)
 }
 
 export class ReadmeParser {
   readmeFile : string 
   markDownContent: string
   constructor(readmePath: string) {
      this.readmeFile = readmePath
      this.markDownContent = fs.readFileSync(this.readmeFile, "utf8");
   }
   public Init() {

   }

   public getGlobalConfigByName(Name:string) {
       let rawMarkdown = this.markDownContent;
       for (const codeBlock of utils.parseCodeblocks(rawMarkdown)) {
         if (
           !codeBlock.info ||
           codeBlock.info.trim().toLocaleLowerCase() !== "yaml" ||
           !codeBlock.literal
         ) {
           continue;
         }
         try {
            const configs = YAML.safeLoad(codeBlock.literal)
            if (configs && configs[Name]) {
              return configs[Name];
            }
         }
         catch(e) {
            console.log(e)
         }
      }
   }

 }

class LintMsgTransformer {
  constructor() {}

  lintMsgToUnifiedData(msg: LintingResultMessage[]) {
     const result = msg.map(
      (it) => ({
        type: "Result",
        ...composeLintResult(it as unknown as Mutable<Issue>)
      }))
      return JSON.stringify(result)
  }

  rawErrorToUnifiedData(error: string,config:string) {
      const result = {
        type: "Raw",
        level: "Error",
        message: error,
        time: new Date(),
        extra: {
          role: "error",
          new: utils.targetHref(
              utils.getRelativeSwaggerPathToRepo(config)
            )
        },
      }
      return JSON.stringify(result);
  }
} 

 class UnifiedPipeLineStore {
   logFile = "pipe.log";
   readme:string
   transformer: LintMsgTransformer;
   constructor(readme: string) {
     this.transformer = new LintMsgTransformer();
     this.readme = readme
   }

  private appendMsg(msg: string) {
     fs.appendFileSync(this.logFile, msg);
   }

  public appendLintMsg(msg: LintingResultMessage[]) {
     this.appendMsg(this.transformer.lintMsgToUnifiedData(msg));
   }

  public appendRawErr(msg: string) {
      this.appendMsg(this.transformer.rawErrorToUnifiedData(msg, this.readme));
   }
 }


export async function runRpaasLint() {
    const pr = await devOps.createPullRequestProperties(cli.defaultConfig());
    const configsToProcess = await utils.getConfigFilesChangedInPR(pr);
    for (const config of configsToProcess) {
      const checker = new ReadmeParser(config);
      const store = new UnifiedPipeLineStore(config);
      const subType = checker.getGlobalConfigByName("openapi-subtype");
      if (subType !== "rpass") {
        const subMsg = !subType ? " undefined, please add it!":`incorrect, expects 'rpaas', but provides:${subType}.`
        const errorMsg = `the readme:${config} , the config of 'openapi-subtype' is ${subMsg} !`;

        console.log(errorMsg);
        store.appendRawErr(errorMsg);
        process.exitCode = 1;
        return;
      }
      const resultMsgs = await getLinterResult(config);
      const lintParser = new LintingResultParser(resultMsgs);
      if (lintParser.hasAutoRestError()) {
        store.appendRawErr(lintParser.getAutoRestError());
      } else {
        store.appendLintMsg(lintParser.getResult());
      }
    }
}

 export async function main() {
    if (!isRpaasBranch()) {
       return
    }
    await runRpaasLint()
 }