// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as momentOfTruthUtils from "./momentOfTruthUtils";
import * as tsUtils from "./ts-utils";
import { exec } from "child_process";
import * as path from "path";
import * as utils from "./utils";
import * as fs from "fs";
import { devOps, cli } from "@azure/avocado";
import * as format from "@azure/swagger-validation-common";

type TypeUtils = typeof utils;
type TypeDevOps = typeof devOps;


// Executes linter on given swagger path and returns structured JSON of linter output
export async function getLinterResult(
  swaggerPath: string | null | undefined,
  tag = ""
) {
  if (
    swaggerPath === null ||
    swaggerPath === undefined ||
    typeof swaggerPath.valueOf() !== "string" ||
    !swaggerPath.trim().length
  ) {
    throw new Error(
      'swaggerPath is a required parameter of type "string" and it cannot be an empty string.'
    );
  }
  const linterCmd = `npx autorest --validation --azure-validator --message-format=json `;

  if (!fs.existsSync(swaggerPath)) {
    return [];
  }

  let openapiType = await utils.getOpenapiType(swaggerPath);
  let lintVersion = utils.getLinterVersion();
  let lintVersionCmd = "";
  if (lintVersion.classic) {
    lintVersionCmd +=
      "--use=@microsoft.azure/classic-openapi-validator@" +
      lintVersion.classic +
      " ";
  }
  if (lintVersion.present) {
    lintVersionCmd +=
      "--use=@microsoft.azure/openapi-validator@" + lintVersion.present + " ";
  }
  let openapiTypeCmd = "--openapi-type=" + openapiType + " ";
  const tagCmd = tag ? "--tag=" + tag + " " : "";
  let cmd =
    "npx autorest --reset && " +
    linterCmd +
    openapiTypeCmd +
    lintVersionCmd +
    tagCmd +
    swaggerPath;
  console.log(`Executing: ${cmd}`);
  const { err, stdout, stderr } = await new Promise((res) =>
    exec(
      cmd,
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
      (err: unknown, stdout: unknown, stderr: unknown) =>
        res({ err: err, stdout: stdout, stderr: stderr })
    )
  );

  let resultString = stderr + stdout;
  if (resultString.indexOf("{") !== -1) {
    resultString = resultString.replace(
      /Processing batch task - {.*} \.\n/g,
      ""
    );
  }
  return resultString;
}


class LintStore {
  logFilepath : string;
  constructor(logFile:string) {
    this.logFilepath = logFile;
    
  }
  createLogFile() {
    if (!fs.existsSync(this.logFilepath)) {
      fs.writeFileSync(this.logFilepath, "");
    }
  }

  //appends the content to the log file
  writeContent(content: unknown) {
    fs.writeFileSync(this.logFilepath, content);
  }
}

/*
 * run linter and handling exception
 */
class LinterRunner {
  tagsMap: Map<string, string[]>;
  errors: momentOfTruthUtils.AutorestError[] = [];
  pullRequestNumber: string;
  pr: devOps.PullRequestProperties | undefined;

  // Updates final result json to be written to the output file
  finalResult: momentOfTruthUtils.FinalResult = {
    pullRequest: this.pullRequestNumber,
    repositoryUrl: utils.getRepoUrl(),
    files: {},
  };

  constructor(
    tagsMapping: Map<string, string[]>,
    pr: devOps.PullRequestProperties | undefined
  ) {
    this.tagsMap = tagsMapping;
    this.pullRequestNumber = utils.getPullRequestNumber();
    this.pr = pr;
  }

  async updateResult(
    spec: string,
    lintErrors: string,
    beforeOrAfter: momentOfTruthUtils.BeforeOrAfter
  ) {
    const parser = new momentOfTruthUtils.LintingResultParser(lintErrors);

    const files = this.finalResult["files"];
    if (!files[spec]) {
      files[spec] = { before: [], after: [] };
    }
    const filesSpec = tsUtils.asNonUndefined(files[spec]);

    filesSpec[beforeOrAfter] = filesSpec[beforeOrAfter].concat(
      parser.getResult()
    );
    if (parser.hasAutoRestError()) {
      this.errors.push({
        type: "AutoRestErr",
        code: "",
        message: parser.getAutoRestError(),
        readme: spec,
        readmeUrl:
          beforeOrAfter === "before"
            ? utils.targetHref(
                utils.getRelativeSwaggerPathToRepo(
                  path.resolve(this.pr!.workingDir, spec)
                )
              )
            : utils.blobHref(utils.getRelativeSwaggerPathToRepo(spec)),
      });
    }
  }

  // Run linter tool
  async runTools(
    swagger: string,
    beforeOrAfter: momentOfTruthUtils.BeforeOrAfter
  ) {
    console.log(`Processing "${swagger}":`);
    const tags = this.tagsMap.get(swagger);
    let runCnt = 0;
    if (tags) {
      for (const tag of tags) {
        if (utils.isTagExisting(swagger, tag)) {
          const linterErrors = await getLinterResult(swagger, tag);
          console.log(linterErrors);
          await this.updateResult(swagger, linterErrors, beforeOrAfter);
          runCnt++;
        }
      }
    }
    /* to ensure lint ran at least once */
    if (runCnt == 0) {
      const linterErrors = await getLinterResult(swagger);
      console.log(linterErrors);
      await this.updateResult(swagger, linterErrors, beforeOrAfter);
    }
  }

  getResult() {
    return this.finalResult;
  }

  getError() {
    return this.errors;
  }

  pushError(error: momentOfTruthUtils.AutorestError) {
    this.errors.push(error);
  }
}

//main function
export async function runScript() {
  await lintDiff(utils, devOps);
}

// this function is testable
export async function lintDiff(utils: TypeUtils, devOps: TypeDevOps) {
  const pullRequestNumber = utils.getPullRequestNumber();
  const filename = `${pullRequestNumber}.json`;
  const logFilepath = path.join(momentOfTruthUtils.getLogDir(), filename);

  const store = new LintStore(logFilepath);
  store.createLogFile();
  
  const pr = await devOps.createPullRequestProperties(cli.defaultConfig());
  const configsToProcess = await utils.getConfigFilesChangedInPR(pr);

  const tagsMap = await utils.getTagsFromChangedFile(
    await utils.getFilesChangedInPR(pr)
  );

  console.log("Processing configs:");
  console.log(configsToProcess);
  const linter = new LinterRunner(tagsMap,pr);
  console.log(`The results will be logged here: "${logFilepath}".`);

  const errors: { error: Error; old: string; new: string }[] = [];

  if (configsToProcess.length > 0 && pr !== undefined) {
    for (const configFile of configsToProcess) {
      try {
        await linter.runTools(configFile, "after");
      } catch (err) {
          linter.pushError({
            type:"RuntimeErrors",
            code:err.code,
            message: err.message,
            readmeUrl: utils.blobHref(utils.getRelativeSwaggerPathToRepo(configFile)),
            readme:configFile
          });
        }
    }

    await utils.doOnTargetBranch(pr, async () => {
      for (const configFile of configsToProcess) {
        try {
          await linter.runTools(configFile, "before");
        } catch (err) {
          linter.pushError({
            type: "RuntimeErrors",
            code: err.code,
            message: err.message,
            readmeUrl: utils.targetHref(
              utils.getRelativeSwaggerPathToRepo(
                path.resolve(pr!.workingDir, configFile)
              )
            ),
            readme: configFile,
          });
        }
      }
    });
  }

  store.writeContent(JSON.stringify(linter.getResult(), null, 2));

  console.log("--- Lint Violation Result ----\n");
  console.log(JSON.stringify(linter.getResult(), null, 2));

  if (linter.getError().length > 0) {
    process.exitCode = 1;
    console.log(`LintDiff error log ----`);
    const errorResult: format.MessageLine = linter.getError().map((it) => ({
      type: "Raw",
      level: "Error",
      message: it.message || "",
      time: new Date(),
      extra: {
        role: it.type,
        new: it.readmeUrl,
      },
    }));

    console.log("--- Errors of Lint Diff (formated) ----\n");
    console.log(JSON.stringify(errorResult,undefined,2));
    fs.writeFileSync("pipe.log", JSON.stringify(errorResult) + "\n");
    throw new Error('Autorest fail');
  }
}
