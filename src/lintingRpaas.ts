// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import { devOps, cli } from '@azure/avocado';
import * as utils from './utils';
import { getLinterResult } from "./momentOfTruth";
import * as fs from "fs-extra";
import * as YAML from "js-yaml";
/**
 * 1 run linter rpass
 * 2 check  
 */

 function isRpaasBranch() {
   const targetBranch = utils.getTargetBranch();
   const RPaasBranches = ["RpaasMaster", "RpaasDev"];
   return RPaasBranches.some((b) => b === targetBranch)
 }
 
 class ReadmeParser {
   readmeFile : string 
   markDownContent: string
   constructor(readmePath: string) {
      this.readmeFile = readmePath
      this.markDownContent = fs.readFileSync(this.readmeFile, "utf8");
   }
   public Init() {

   }

   getGlobalConfigByName(Name:string) {
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

 export async function main() {
    if (!isRpaasBranch()) {
       return
    }
    const pr = await devOps.createPullRequestProperties(cli.defaultConfig());
    const configsToProcess = await utils.getConfigFilesChangedInPR(pr);
    configsToProcess.forEach(config => {
       const checker = new ReadmeParser(config);
       const subType = checker.getGlobalConfigByName("openapi-subtype")
        if (!subType || subType !== 'rpaas') {
           console.log(`the readme:${config} ,does not contain 'openapi-subtype' !`)
           process.exitCode = 1
           return 
        }
       getLinterResult(config)
    })
 }