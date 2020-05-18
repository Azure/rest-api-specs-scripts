import { cli, devOps } from "@azure/avocado";
import * as oad from "@azure/oad";
import * as stringMap from "@ts-common/string-map";
import * as format from "@zhenglaizhang/swagger-validation-common";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import * as tsUtils from "./ts-utils";
import { getTargetBranch } from "./utils";
import * as utils from "./utils";

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

const headerText = `
| | Rule | Location | Message |
|-|------|----------|---------|
`;

export type ChangeProperties = {
  readonly location?: string;
  readonly path?: string;
  readonly ref?: string;
};

export type OadMessage = {
  readonly id: string;
  readonly code: string;
  readonly docUrl: string;
  readonly message: string;
  readonly mode: string;
  readonly type: string;
  readonly new: ChangeProperties;
  readonly old: ChangeProperties;
};

function iconFor(type: unknown) {
  if (type === "Error") {
    return ":x:";
  } else if (type === "Warning") {
    return ":warning:";
  } else if (type === "Info") {
    return ":speech_balloon:";
  } else {
    return "";
  }
}

function shortName(filePath: string) {
  return `${path.basename(
    path.dirname(filePath)
  )}/&#8203;<strong>${path.basename(filePath)}</strong>`;
}

type Diff = {
  readonly type: unknown;
  readonly id: string;
  readonly code: unknown;
  readonly message: unknown;
};

function tableLine(filePath: string, diff: Diff) {
  return `|${iconFor(diff["type"])}|[${diff["type"]} ${diff["id"]} - ${
    diff["code"]
  }](https://github.com/Azure/openapi-diff/blob/master/docs/rules/${
    diff["id"]
  }.md)|[${shortName(filePath)}](${blobHref(filePath)} "${filePath}")|${
    diff["message"]
  }|\n`;
}

function blobHref(file: string) {
  return file
    ? `https://github.com/${process.env.TRAVIS_REPO_SLUG}/blob/${process.env.TRAVIS_PULL_REQUEST_SHA}/${file}`
    : "";
}

function targetHref(file: string) {
  return file
    ? `https://github.com/${
        process.env.TRAVIS_REPO_SLUG
      }/blob/${getTargetBranch()}/${file}`
    : "";
}

/**
 * Compares old and new specifications for breaking change detection.
 *
 * @param oldSpec Path to the old swagger specification file.
 *
 * @param newSpec Path to the new swagger specification file.
 */
async function runOad(oldSpec: string, newSpec: string) {
  if (
    oldSpec === null ||
    oldSpec === undefined ||
    typeof oldSpec.valueOf() !== "string" ||
    !oldSpec.trim().length
  ) {
    throw new Error(
      'oldSpec is a required parameter of type "string" and it cannot be an empty string.'
    );
  }

  if (
    newSpec === null ||
    newSpec === undefined ||
    typeof newSpec.valueOf() !== "string" ||
    !newSpec.trim().length
  ) {
    throw new Error(
      'newSpec is a required parameter of type "string" and it cannot be an empty string.'
    );
  }

  console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
  console.log(`Old Spec: "${oldSpec}"`);
  console.log(`New Spec: "${newSpec}"`);
  console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);

  let result = await oad.compare(oldSpec, newSpec, { consoleLogLevel: "warn" });
  let oadResult = JSON.parse(result) as OadMessage[];

  const pipelineResultData: format.ResultMessageRecord[] = oadResult.map(
    (it) => ({
      level: it.type as format.MessageLevel,
      message: it.message,
      code: it.code,
      id: it.id,
      docUrl: it.docUrl,
      time: new Date(),
      extra: {
        mode: it.mode,
      },
      paths: [
        {
          tag: "New",
          path: blobHref(
            utils.trimGithubStyleFilePath(
              utils.trimSwaggerPath(it.new.location || "")
            )
          ),
        },
        {
          tag: "Old",
          path: targetHref(
            utils.trimGithubStyleFilePath(
              utils.trimSwaggerPath(it.old.location || "")
            )
          ),
        },
      ],
    })
  );
  const pipelineResult: format.ResultMessage = {
    type: "Result",
    data: pipelineResultData,
  };

  console.log("Write to pipe.log.");
  fs.appendFileSync("pipe.log", JSON.stringify(pipelineResult) + "\n");

  console.log(JSON.parse(result));

  if (!result) {
    return;
  }

  // fix up output from OAD, it does not output valid JSON
  result = result.replace(/}\s+{/gi, "},{");

  return JSON.parse(result);
}

//main function
export async function runScript() {
  console.log(`ENV: ${JSON.stringify(process.env)}`);
  // Used to enable running script outside TravisCI for debugging
  const isRunningInTravisCI = process.env.TRAVIS === "true";
  const outputFolder = path.join(os.tmpdir(), "resolved");

  // This map is used to store the mapping between files resolved and stored location
  const resolvedMapForNewSpecs: stringMap.MutableStringMap<string> = {};

  /**
   * Processes the given swagger and stores the resolved swagger on to disk
   *
   * @param swaggerPath Path to the swagger specification file.
   */
  async function processViaAutoRest(swaggerPath: string) {
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

    const swaggerOutputFolder = path.join(
      outputFolder,
      path.dirname(swaggerPath)
    );
    const swaggerOutputFileNameWithoutExt = path.basename(swaggerPath, ".json");
    const autorestPath = path.resolve("node_modules/.bin/autorest");
    const autoRestCmd = `${autorestPath} --input-file=${swaggerPath} --output-artifact=swagger-document.json --output-file=${swaggerOutputFileNameWithoutExt} --output-folder=${swaggerOutputFolder}`;

    console.log(`Executing : ${autoRestCmd}`);

    try {
      await fs.ensureDir(swaggerOutputFolder);
      await utils.exec(`${autoRestCmd}`, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 64,
      });
      resolvedMapForNewSpecs[swaggerPath] = path.join(
        swaggerOutputFolder,
        swaggerOutputFileNameWithoutExt + ".json"
      );
    } catch (err) {
      console.log(`Error processing via AutoRest: ${err}`);
      throw err;
    }
  }

  // create Azure DevOps PR properties.
  const pr = await devOps.createPullRequestProperties(cli.defaultConfig());

  // See whether script is in Travis CI context
  console.log(`isRunningInTravisCI: ${isRunningInTravisCI}`);

  let targetBranch = utils.getTargetBranch();
  let swaggersToProcess = await utils.getFilesChangedInPR(pr);

  console.log("Processing swaggers:");
  console.log(swaggersToProcess);

  console.log("Finding new swaggers...");
  let newSwaggers: unknown[] = [];
  if (swaggersToProcess.length > 0 && pr !== undefined) {
    newSwaggers = await utils.doOnTargetBranch(pr, async () => {
      return swaggersToProcess.filter((s: string) => !fs.existsSync(s));
    });
  }

  console.log("Processing via AutoRest...");
  for (const swagger of swaggersToProcess) {
    if (!newSwaggers.includes(swagger)) {
      await processViaAutoRest(swagger);
    }
  }

  console.log(`Resolved map for the new specifications:`);
  console.dir(resolvedMapForNewSpecs);

  let errorCnt = 0,
    warningCnt = 0;
  const diffFiles: stringMap.MutableStringMap<Diff[]> = {};
  const newFiles = [];

  const errors: Error[] = [];

  for (const swagger of swaggersToProcess) {
    // If file does not exists in the previous commits then we ignore it as it's new file
    if (newSwaggers.includes(swagger)) {
      console.log(`File: "${swagger}" looks to be newly added in this PR.`);
      newFiles.push(swagger);
      continue;
    }

    const resolved = resolvedMapForNewSpecs[swagger];
    if (resolved) {
      try {
        const diffs = await runOad(
          path.resolve(pr!.workingDir, swagger),
          resolved
        );
        if (diffs) {
          diffFiles[swagger] = diffs;
          for (const diff of diffs) {
            if (diff["type"] === "Error") {
              if (errorCnt === 0) {
                console.log(
                  `There are potential breaking changes in this PR. Please review before moving forward. Thanks!`
                );
                process.exitCode = 1;
              }
              errorCnt += 1;
            } else if (diff["type"] === "Warning") {
              warningCnt += 1;
            }
          }
        }
      } catch (err) {
        errors.push(err);
      }
    }
  }

  if (errors.length > 0) {
    console.log(`oad error log: ${errors}`);
  }
  for (const err of errors) {
    fs.appendFileSync("error.log", err.stack);
  }

  if (isRunningInTravisCI) {
    let summary = "";
    if (errorCnt > 0) {
      summary +=
        "**There are potential breaking changes in this PR. Please review before moving forward. Thanks!**\n\n";
    }
    summary += `Compared to the target branch (**${targetBranch}**), this pull request introduces:\n\n`;
    summary += `&nbsp;&nbsp;&nbsp;${
      errorCnt > 0 ? iconFor("Error") : ":white_check_mark:"
    }&nbsp;&nbsp;&nbsp;**${errorCnt}** new error${
      errorCnt !== 1 ? "s" : ""
    }\n\n`;
    summary += `&nbsp;&nbsp;&nbsp;${
      warningCnt > 0 ? iconFor("Warning") : ":white_check_mark:"
    }&nbsp;&nbsp;&nbsp;**${warningCnt}** new warning${
      warningCnt !== 1 ? "s" : ""
    }\n\n`;

    let message = "";
    if (newFiles.length > 0) {
      message += "### The following files look to be newly added in this PR:\n";
      newFiles.sort();
      for (const swagger of newFiles) {
        message += `* [${swagger}](${blobHref(swagger)})\n`;
      }
      message += "<br><br>\n";
    }

    const diffFileNames = Object.keys(diffFiles);
    if (diffFileNames.length > 0) {
      message += "### OpenAPI diff results\n";
      message += headerText;

      diffFileNames.sort();
      for (const swagger of diffFileNames) {
        const diffs = tsUtils.asNonUndefined(diffFiles[swagger]);
        diffs.sort((a, b) => {
          if (a.type === b.type) {
            return a.id.localeCompare(b.id);
          } else if (a.type === "Error") {
            return 1;
          } else if (b.type === "Error") {
            return -1;
          } else if (a.type === "Warning") {
            return 1;
          } else {
            return -1;
          }
        });

        for (const diff of diffs) {
          message += tableLine(swagger, diff);
        }
      }
    } else {
      message += "**There were no files containing new errors or warnings.**\n";
    }

    message +=
      "\n<br><br>\nThanks for using breaking change tool to review.\nIf you encounter any issue(s), please open issue(s) at https://github.com/Azure/openapi-diff/issues.";

    const output = {
      title: `${errorCnt === 0 ? "No" : errorCnt} potential breaking change${
        errorCnt !== 1 ? "s" : ""
      }`,
      summary,
      text: message,
    };

    console.log("---output");
    console.log(output);
    console.log("---");
  }
}
