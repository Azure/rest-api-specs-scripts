// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import { devOps, cli } from '@azure/avocado';
import * as utils from './utils';
import { getLinterResult } from "./momentOfTruth";
import * as fs from "fs-extra";
import * as YAML from "js-yaml";
import { LintingResultParser, LintingResultMessage, Issue } from './momentOfTruthUtils'
import { composeLintResult,Mutable,getFile,getLine } from './momentOfTruthPostProcessing';
/**
 * 1 run linter rpaas
 * 2 check whether the reamde has openapi-subtype
 */

 function isRpaasBranch() {
   const targetBranch = utils.getTargetBranch();
   const RPaaSBranches = ["RPaaSMaster", "RPaaSDev"];
   return RPaaSBranches.some((b) => b === targetBranch)
 }
 
 export class ReadmeParser {
   readmeFile : string 
   markDownContent: string
   constructor(readmePath: string) {
      this.readmeFile = readmePath
      this.markDownContent = fs.readFileSync(this.readmeFile, "utf8");
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
            const configs = YAML.safeLoad(codeBlock.literal) as any
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

export class LintMsgTransformer {
  constructor() {}

  lintMsgToUnifiedMsg(msg: LintingResultMessage[]) {
    const result = msg.map(
    (it) => {
      const violation = it as unknown as Mutable<Issue>
      if (!violation.filePath) {
        violation.filePath = getFile(violation.jsonref) || ""
      }
        if (!violation.lineNumber) {
        violation.lineNumber = getLine(violation.jsonref) || 1
      }
      return  {
      type: "Result",
      ...composeLintResult(violation)
      }
    })    
    return JSON.stringify(result)
  }

  rawErrorToUnifiedMsg(errType:string, errorMsg: string,config:string) {
      const result = {
        type: "Raw",
        level: "Error",
        message: errType,
        time: new Date(),
        extra: {
          new: utils.targetHref(utils.getRelativeSwaggerPathToRepo(config)),
          details: errorMsg,
        },
      };
      return JSON.stringify(result);
  }
} 

class UnifiedPipeLineStore {
  logFile = "pipe.log";
  readme: string;
  transformer: LintMsgTransformer;
  constructor(readme: string) {
    this.transformer = new LintMsgTransformer();
    this.readme = readme;
  }

  private appendMsg(msg: string) {
    fs.appendFileSync(this.logFile, msg);
    console.log("appendMsg:" + msg)
  }

  public appendLintMsg(msg: LintingResultMessage[]) {
    this.appendMsg(this.transformer.lintMsgToUnifiedMsg(msg));
  }

  public appendAutoRestErr(msg: string) {
    this.appendMsg(
      this.transformer.rawErrorToUnifiedMsg(
        "AutoRest exception",
        msg,
        this.readme
      )
    );
  }

  public appendRunTimeErr(msg: string) {
    this.appendMsg(
      this.transformer.rawErrorToUnifiedMsg(
        "Runtime exception",
        msg,
        this.readme
      )
    );
  }

  public appendReadmeErr(msg: string) {
    this.appendMsg(
      this.transformer.rawErrorToUnifiedMsg(
        "Readme exception",
        msg,
        this.readme
      )
    );
  }
}

export async function runRpaasLint() {
    const pr = await devOps.createPullRequestProperties(cli.defaultConfig());
    const configsToProcess = await utils.getConfigFilesChangedInPR(pr);
    for (const config of configsToProcess) {
      const store = new UnifiedPipeLineStore(config);
      if (isRpaasBranch()) {
        const checker = new ReadmeParser(config);
        const subType = checker.getGlobalConfigByName("openapi-subtype");
        if (subType !== "rpaas") {
          const helpInfo = "Please set the 'openapi-subtype: rpaas' to it.";
          const subMsg = !subType
            ? "unset"
            : `incorrect, expects 'rpaas' but received: ${subType}`;
          const errorMsg = `For the ${config} , the 'openapi-subtype' is ${subMsg}.\n${helpInfo}`;

          console.log(errorMsg);
          store.appendReadmeErr(errorMsg);
          process.exitCode = 1;
          continue;
        }
      }
      try {
        const resultMsgs = await getLinterResult(config);
        const lintParser = new LintingResultParser(resultMsgs);
        if (lintParser.hasAutoRestError()) {
          store.appendAutoRestErr(lintParser.getAutoRestError());
        } else {
          const result = lintParser
            .getResult()
            .filter(
              (msg) =>
                (msg as LintingResultMessage).validationCategory ===
                "RPaaSViolation"
            );
          console.log(lintParser.getResult());
          if (result && result.length && result.some(r => (r as LintingResultMessage).type.toLowerCase() === "error")
          ) {
            process.exitCode = 1;
          }
          store.appendLintMsg(result);
        }
      }
      catch(e) {
        store.appendRunTimeErr(e.message);
        process.exitCode = 1;
      }
    }
}

 export async function main() {
    await runRpaasLint()
 }