// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as momentOfTruthUtils from "./momentOfTruthUtils";
import * as tsUtils from "./ts-utils";
import { exec } from "child_process";
import * as path from "path";
import * as utils from "./utils";
import * as fs from "fs";
import { devOps, cli } from "@azure/avocado";
import { targetHref } from "./breaking-change";
import { blobHref } from "./momentOfTruthPostProcessing";
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

  let jsonResult = [];
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

  if (err && stderr.indexOf("Process() cancelled due to exception") !== -1) {
    console.error(`AutoRest exited with code ${err.code}`);
    console.error(stderr);
    throw new Error("AutoRest failed");
  }

  let resultString = stdout + stderr;
  if (resultString.indexOf("{") !== -1) {
    resultString = resultString.replace(
      /Processing batch task - {.*} \.\n/g,
      ""
    );
    resultString =
      "[" +
      resultString
        .substring(resultString.indexOf("{"))
        .trim()
        .replace(/\}\n\{/g, "},\n{") +
      "]";
    //console.log('>>>>>> Trimmed Result...');
    //console.log(resultString);
    try {
      jsonResult = JSON.parse(resultString);
      //console.log('>>>>>> Parsed Result...');
      //console.dir(resultObject, {depth: null, colors: true});
      return jsonResult;
    } catch (e) {
      console.error(
        `An error occurred while executing JSON.parse() on the linter output for ${swaggerPath}:`
      );
      console.dir(resultString);
      console.dir(e, { depth: null, colors: true });
      throw new Error(`An error occurred while executing JSON.parse() on the linter output for ${swaggerPath}:`);
      process.exit(1);
    }
  }
  return [];
}

const linterCmd = `npx autorest --validation --azure-validator --message-format=json `;

//main function
export async function runScript() {
  await lintDiff(utils, devOps);
}

// this function is testable
export async function lintDiff(utils: TypeUtils, devOps: TypeDevOps) {
  const pullRequestNumber = utils.getPullRequestNumber();
  const filename = `${pullRequestNumber}.json`;
  const logFilepath = path.join(momentOfTruthUtils.getLogDir(), filename);

  const finalResult: momentOfTruthUtils.FinalResult = {
    pullRequest: pullRequestNumber,
    repositoryUrl: utils.getRepoUrl(),
    files: {},
  };
  let tagsMap: Map<string, string[]>;

  //creates the log file if it has not been created
  function createLogFile() {
    if (!fs.existsSync(logFilepath)) {
      fs.writeFileSync(logFilepath, "");
    }
  }

  //appends the content to the log file
  function writeContent(content: unknown) {
    fs.writeFileSync(logFilepath, content);
  }

  // Updates final result json to be written to the output file
  async function updateResult(
    spec: string,
    errors: readonly momentOfTruthUtils.Issue[],
    beforeOrAfter: momentOfTruthUtils.BeforeOrAfter
  ) {
    const files = finalResult["files"];
    if (!files[spec]) {
      files[spec] = { before: [], after: [] };
    }
    const filesSpec = tsUtils.asNonUndefined(files[spec]);

    filesSpec[beforeOrAfter] = filesSpec[beforeOrAfter].concat(errors);
  }

  // Run linter tool
  async function runTools(
    swagger: string,
    beforeOrAfter: momentOfTruthUtils.BeforeOrAfter
  ) {
    console.log(`Processing "${swagger}":`);
    const tags = tagsMap.get(swagger);
    let runCnt = 0;
    if (tags) {
      for (const tag of tags) {
        if (utils.isTagExisting(swagger, tag)) {
          const linterErrors = await getLinterResult(swagger, tag);
          console.log(linterErrors);
          await updateResult(swagger, linterErrors, beforeOrAfter);
          runCnt++;
        }
      }
    }
    /* to ensure lint ran at least once */
    if (runCnt == 0) {
      const linterErrors = await getLinterResult(swagger);
      console.log(linterErrors);
      await updateResult(swagger, linterErrors, beforeOrAfter);
    }
  }

  //
  const pr = await devOps.createPullRequestProperties(cli.defaultConfig());
  const configsToProcess = await utils.getConfigFilesChangedInPR(pr);

  tagsMap = await utils.getTagsFromChangedFile(
    await utils.getFilesChangedInPR(pr)
  );

  console.log("Processing configs:");
  console.log(configsToProcess);
  createLogFile();
  console.log(`The results will be logged here: "${logFilepath}".`);

  const errors: { error: Error; old: string; new: string }[] = [];

  if (configsToProcess.length > 0 && pr !== undefined) {
    for (const configFile of configsToProcess) {
      try {
        await runTools(configFile, "after");
      } catch (err) {
          errors.push({
            error: err,
            old: targetHref(
              utils.getRelativeSwaggerPathToRepo(
                path.resolve(pr!.workingDir, configFile)
              )
            ),
            new: blobHref(utils.getRelativeSwaggerPathToRepo(configFile)),
          });
        }
    }

    await utils.doOnTargetBranch(pr, async () => {
      for (const configFile of configsToProcess) {
        try {
          await runTools(configFile, "before");
        } catch (err) {
          errors.push({
            error: err,
            old: targetHref(
              utils.getRelativeSwaggerPathToRepo(
                path.resolve(pr!.workingDir, configFile)
              )
            ),
            new: blobHref(utils.getRelativeSwaggerPathToRepo(configFile)),
          });
        }
      }
    });
  }

  writeContent(JSON.stringify(finalResult, null, 2));

  if (errors.length > 0) {
    process.exitCode = 1;
    console.log(`LintDiff error log ----`);
    const errorResult: format.MessageLine = errors.map((it) => ({
      type: "Raw",
      level: "Error",
      message: it.error.message || "",
      time: new Date(),
      extra: {
        role: "Lint Diff",
        new: it.new,
        old: it.old,
      },
    }));

    console.log("--- Errors of Lint Diff (formated) ----\n");
    console.log(JSON.stringify(errorResult));
    fs.appendFileSync("pipe.log", JSON.stringify(errorResult) + "\n");
    return process.exit(1);
  }
}
