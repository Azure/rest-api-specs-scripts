// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import { devOps, cli } from '@azure/avocado';
import * as utils from './utils';
import { getLinterResult } from "./momentOfTruth";

import { LintingResultParser, LintingResultMessage} from './momentOfTruthUtils'
import { UnifiedPipeLineStore } from "./unifiedPipelineHelper"
import { ReadmeParser } from "./readmeUtils"

/**
 * 1 run linter rpaas
 * 2 check whether the reamde has openapi-subtype
 */

 function isRpaasBranch() {
   const targetBranch = utils.getTargetBranch();
   const RPaaSBranches = ["rpsaasmaster", "rpsaasdev", "rpaasdev","rpaasmaster"];
   return RPaaSBranches.some((b) => b === targetBranch.toLowerCase())
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
