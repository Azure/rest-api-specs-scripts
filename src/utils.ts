// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import * as tsUtils from "./ts-utils";
import * as stringMap from "@ts-common/string-map";
import * as fs from "fs-extra";
import * as glob from "glob";
import * as path from "path";
const z = require("z-schema");
import * as YAML from "js-yaml";
import request = require("request");
import * as util from "util";
import { execSync } from "child_process";
import { devOps } from "@azure/avocado";
import * as childProcess from "child_process";
import * as commonmark from "commonmark";
import {
  getTagsToSettingsMapping,
  getCodeBlocksAndHeadings,
  getInputFilesForTag,
  inputFile,
} from "@azure/openapi-markdown";

import { MarkDownEx, parse } from "@ts-common/commonmark-to-markdown";
import * as sm from "@ts-common/string-map";

export const exec = util.promisify(childProcess.exec);

const asyncJsonRequest = (url: string) =>
  new Promise<unknown>((res, rej) =>
    request({ url, json: true }, (error: unknown, _: unknown, body: unknown) =>
      error ? rej(error) : res(body)
    )
  );

export const extensionSwaggerSchemaUrl =
  "https://raw.githubusercontent.com/Azure/autorest/master/schema/swagger-extensions.json";
export const swaggerSchemaUrl = "http://json.schemastore.org/swagger-2.0";
export const swaggerSchemaAltUrl = "http://23.22.16.221/v2/schema.json";
export const schemaUrl = "http://json-schema.org/draft-04/schema";
export const exampleSchemaUrl =
  "https://raw.githubusercontent.com/Azure/autorest/master/schema/example-schema.json";
export const compositeSchemaUrl =
  "https://raw.githubusercontent.com/Azure/autorest/master/schema/composite-swagger.json";

// export const isWindows = (process.platform.lastIndexOf('win') === 0);
// export const prOnly = undefined !== process.env['PR_ONLY'] ? process.env['PR_ONLY'] : 'false';

export const getSwaggers = () => {
  const getGlobPath = () =>
    path.join(__dirname, "../", "../", "/specification/**/*.json");
  return glob.sync(getGlobPath(), {
    ignore: [
      "**/examples/**/*.json",
      "**/quickstart-templates/*.json",
      "**/schema/*.json",
    ],
  });
};
export const getExamples = () => {
  const exampleGlobPath = path.join(
    __dirname,
    "../",
    "../",
    "/specification/**/examples/**/*.json"
  );
  return glob.sync(exampleGlobPath);
};
// export const readmes = glob.sync(path.join(__dirname, '../', '../', '/specification/**/readme.md'));

// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
// because the buffer-to-string conversion in `fs.readFile()`
// translates it to FEFF, the UTF-16 BOM.
export const stripBOM = function (content: Buffer | string) {
  if (Buffer.isBuffer(content)) {
    content = content.toString();
  }
  if (content.charCodeAt(0) === 0xfeff || content.charCodeAt(0) === 0xfffe) {
    content = content.slice(1);
  }
  return content;
};

/**
 * Parses the json from the given filepath
 * @returns {string} clr command
 */
export const parseJsonFromFile = async function (filepath: string) {
  const data = await fs.readFile(filepath, { encoding: "utf8" });
  try {
    return YAML.safeLoad(stripBOM(data));
  } catch (error) {
    throw new Error(
      `swagger "${filepath}" is an invalid JSON.\n${util.inspect(error, {
        depth: null,
      })}`
    );
  }
};

/**
 * Gets the name of the target branch to which the PR is sent. We are using the environment
 * variable provided by travis-ci. It is called TRAVIS_BRANCH. More info can be found here:
 * https://docs.travis-ci.com/user/environment-variables/#Default-Environment-Variables
 * If the environment variable is undefined then the method returns 'master' as the default value.
 * @returns {string} branchName The target branch name.
 */
export const getTargetBranch = function () {
  console.log(
    `@@@@@ process.env['TRAVIS_BRANCH'] - ${process.env["TRAVIS_BRANCH"]}`
  );
  let result = process.env["TRAVIS_BRANCH"] || "master";
  result = result.trim();
  console.log(`>>>>> The target branch is: "${result}".`);
  return result;
};

/**
 * Check out a copy of a target branch to a temporary location, execute a function, and then restore the previous state.
 */
export const doOnTargetBranch = async <T>(
  pr: devOps.PullRequestProperties,
  func: () => Promise<T>
) => {
  const currentDir = process.cwd();

  await pr.checkout(pr.targetBranch);

  console.log(`Changing directory and executing the function...`);
  // pr.workingDir is a directory of a cloned Pull Request Git repository. We can't use
  // the original Git repository to switch branches
  process.chdir(pr.workingDir);
  const result = await func();

  console.log(
    `Restoring previous directory and deleting secondary working tree...`
  );
  process.chdir(currentDir);

  return result;
};

/**
 * Resolve a ref to its commit hash
 */
export const resolveRef = function (ref: unknown) {
  let cmd = `git rev-parse ${ref}`;
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: "utf8" }).trim();
};

/**
 * Checkout a copy of branch to location
 */
export const checkoutBranch = function (ref: unknown, location: unknown) {
  let cmd = `git worktree add -f ${location} origin/${ref}`;
  console.log(`Checking out a copy of branch ${ref} to ${location}...`);
  console.log(`> ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit" });
};

/**
 * Gets the name of the source branch from which the PR is sent.
 * @returns {string} branchName The source branch name.
 */
export const getSourceBranch = function () {
  let cmd = "git rev-parse --abbrev-ref HEAD";
  let result = process.env["TRAVIS_PULL_REQUEST_BRANCH"];
  console.log(
    `@@@@@ process.env['TRAVIS_PULL_REQUEST_BRANCH'] - ${process.env["TRAVIS_PULL_REQUEST_BRANCH"]}`
  );
  if (!result) {
    try {
      result = execSync(cmd, { encoding: "utf8" });
    } catch (err) {
      console.log(
        `An error occurred while getting the current branch ${util.inspect(
          err,
          { depth: null }
        )}.`
      );
    }
  }
  result = tsUtils.asNonUndefined(result).trim();
  console.log(`>>>>> The source branch is: "${result}".`);
  return result;
};

/**
 * Gets the PR number. We are using the environment
 * variable provided by travis-ci. It is called TRAVIS_PULL_REQUEST. More info can be found here:
 * https://docs.travis-ci.com/user/environment-variables/#Convenience-Variables
 * @returns {string} PR number or 'undefined'.
 */
export const getPullRequestNumber = function () {
  let result = process.env["TRAVIS_PULL_REQUEST"];
  console.log(
    `@@@@@ process.env['TRAVIS_PULL_REQUEST'] - ${process.env["TRAVIS_PULL_REQUEST"]}`
  );

  if (!result) {
    result = "undefined";
  }

  return result;
};

/**
 * Gets the Repo name. We are using the environment
 * variable provided by travis-ci. It is called TRAVIS_REPO_SLUG. More info can be found here:
 * https://docs.travis-ci.com/user/environment-variables/#Convenience-Variables
 * @returns {string} repo name or 'undefined'.
 */
export const getRepoName = function () {
  let result = process.env["TRAVIS_REPO_SLUG"];
  console.log(`@@@@@ process.env['TRAVIS_REPO_SLUG'] - ${result}`);

  return result;
};

/**
 * Gets the source repo name for PR's. We are using the environment
 * variable provided by travis-ci. It is called TRAVIS_PULL_REQUEST_SLUG. More info can be found here:
 * https://docs.travis-ci.com/user/environment-variables/#Convenience-Variables
 * @returns {string} repo name or 'undefined'.
 */
export const getSourceRepoName = function () {
  let result = process.env["TRAVIS_PULL_REQUEST_SLUG"];
  console.log(`@@@@@ process.env['TRAVIS_PULL_REQUEST_SLUG'] - ${result}`);

  return result;
};

// Retrieves Git Repository Url
/**
 * Gets the repo URL
 * @returns {string} repo URL or 'undefined'
 */
export const getRepoUrl = function () {
  let repoName = getRepoName();
  return `https://github.com/${repoName}`;
};

// Retrieves the source Git Repository Url
/**
 * Gets the repo URL from where the PR originated
 * @returns {string} repo URL or 'undefined'
 */
export const getSourceRepoUrl = function () {
  let repoName = getSourceRepoName();
  return `https://github.com/${repoName}`;
};

export const getTimeStamp = function () {
  // We pad each value so that sorted directory listings show the files in chronological order
  function pad(number: any): any {
    if (number < 10) {
      return "0" + number;
    }

    return number;
  }

  var now = new Date();
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "_" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
};

/**
 * Retrieves list of swagger files to be processed for linting
 * @returns {Array} list of files to be processed for linting
 */
export const getConfigFilesChangedInPR = async (
  pr: devOps.PullRequestProperties | undefined
) => {
  if (pr !== undefined) {
    try {
      let filesChanged = (await pr.diff()).map((file) => file.path);
      console.log(">>>>> Files changed in this PR are as follows:");
      console.log(filesChanged);

      // traverse up to readme.md files
      const configFiles = new Set<string>();
      for (let fileChanged of filesChanged) {
        while (fileChanged.startsWith("specification")) {
          if (
            fileChanged.toLowerCase().endsWith("readme.md") &&
            fs.existsSync(fileChanged)
          ) {
            configFiles.add(fileChanged);
            break;
          }
          // select parent readme
          const parts = fileChanged.split("/");
          parts.pop();
          parts.pop();
          parts.push("readme.md");
          fileChanged = parts.join("/");
        }
      }
      filesChanged = [...configFiles.values()];

      console.log(">>>>> Affected configuration files:");
      console.log(filesChanged);

      return filesChanged;
    } catch (err) {
      throw err;
    }
  } else {
    return getSwaggers();
  }
};

/**
 * get all tags who is containing the changed files
 * @returns {array} ["tag1","tag2"]
 * @param markDownEx
 * @param specsChanged
 */
const getTagsForFilesChanged = (
  markDownEx: MarkDownEx,
  specsChanged: readonly string[]
): readonly string[] => {
  const codeBlocks = getTagsToSettingsMapping(markDownEx.markDown);
  const tagsAffected = new Set<string>();

  for (const [tag, settings] of sm.entries(codeBlocks)) {
    // for every file in settings object, see if it matches one of the
    // paths changed
    const filesTouchedInTag = specsChanged.filter((spec) =>
      inputFile(settings).some((inputFile) => spec.includes(inputFile))
    );

    if (filesTouchedInTag.length > 0) {
      tagsAffected.add(tag);
    }
  }
  return [...tagsAffected];
};

/**
 * Gets the path to the readme starting with "specification" folder and without returning the file name
 * @param readmeUrl Full Url path to readme
 */
const getReadMeRelativeDirPathToRepo = (readmeUrl: string): string => {
  return readmeUrl.substring(
    readmeUrl.indexOf("specification"),
    readmeUrl.indexOf("readme.md")
  );
};

export const isTagExisting = (config: string, tag: string): boolean => {
  if (!fs.existsSync(config)) {
    return false;
  }
  const content = fs.readFileSync(config, { encoding: "utf8" });
  const readme = parse(content);
  return getInputFilesForTag(readme.markDown, tag) != undefined;
};

/**
 * @return {map} ,key is the readme and value is an array of the changed files belonging to the readme
 * [["1/readme.md",["file1.json","file2.json"]]]
 * @param filesChanged
 */
export const getChangeFilesReadmeMap = async (
  filesChanged: string[]
): Promise<Map<string, string[]>> => {
  const configFiles = new Map<string, string[]>();
  for (const fileChanged of filesChanged) {
    let cur = fileChanged;
    while (cur.startsWith("specification")) {
      if (cur.toLowerCase().endsWith("readme.md") && fs.existsSync(cur)) {
        if (!configFiles.has(cur)) {
          configFiles.set(cur, []);
        }
        if (!fileChanged.endsWith("readme.md")) {
          let value = configFiles.get(cur);
          if (value) {
            value.push(fileChanged);
          }
        }
        break;
      }
      // select parent readme
      const parts = cur.split("/");
      parts.pop();
      parts.pop();
      parts.push("readme.md");
      cur = parts.join("/");
    }
  }
  return configFiles;
};


/**
 * input like : ["tagName",5]
 * first item is the tag name , second item is the prior of  changed swagger contained by the tag
 */
export function tagLess(a: [string, number], b: [string, number]) {

  /*
   * Per the analysis of all the tags, tags with these word are not for generating SDK, we should decrease the prior of them
   * prior: start with package- > other > with 'only','schema','profile'
   */
  const TagNamePatterns = ["only","schema","profile"] 
  const getPriorOfTag = function(tag: string) {
    for (let i = 0; i< TagNamePatterns.length ; i++) {
      if (tag.indexOf(TagNamePatterns[i]) !== -1) {
        return i
      }
    }
    if (tag.startsWith("package-")) { // higher prior tag
      return -2 
    }
    return -1 // other kind of tags with 
  }
  const priorA = getPriorOfTag(a[0])
  const priorB = getPriorOfTag(b[0])
  if (priorA !== priorB) {
    return priorA - priorB;
  }
  if (a[1] - b[1] === 0) {
    if (a[0] < b[0]) {
      return 1;
    } else if (a[0] > b[0]) {
      return -1;
    }
    return 0;
  }
   return b[1] - a[1];
}

function safeLoad(content: string) {
  try {
    return YAML.safeLoad(content);
  } catch (err) {
    console.log(err);
    return undefined;
  }
}

export function getDefaultTag(markDown: commonmark.Node): string {
 
  const startNode = markDown;
  const codeBlockMap = getCodeBlocksAndHeadings(startNode);

  const latestHeader = "Basic Information";

  const lh = codeBlockMap[latestHeader];
  if (lh) {
    const latestDefinition = safeLoad(lh.literal!) as
      | undefined
      | { tag: string };
    if (latestDefinition) {
      return latestDefinition.tag;
    }
  } else {
    for (let idx of Object.keys(codeBlockMap)) {
      const lh = codeBlockMap[idx];
      if (!lh || !lh.info || lh.info.trim().toLocaleLowerCase() !== "yaml") {
        continue;
      }
      const latestDefinition = safeLoad(lh.literal!) as
        | undefined
        | { tag: string };

      if (latestDefinition) {
        return latestDefinition.tag;
      }
    }
  }
  return "";
}


/**
 * return [["Sevice/readme.md",["tag1","tag2"]]...]
 * the tags are sorted by refered changed file's count
 */
export const getTagsFromChangedFile = async (
  filesChanged: string[]
): Promise<Map<string, string[]>> => {
  try {
    console.log(filesChanged);
    // traverse up to readme.md files
    const configFiles = await getChangeFilesReadmeMap(filesChanged);

    const tagsAffectedMap = new Map<string, string[]>();

    configFiles.forEach((changedFiles, key) => {
      const content = fs.readFileSync(key, { encoding: "utf8" });
      const readme = parse(content);
      const relativePath = getReadMeRelativeDirPathToRepo(key);
      const defaultTag = getDefaultTag(readme.markDown)
      /**
       *  count the changed file count for each tags
       */
      const tagsPriority = new Map<string, number>();
      changedFiles.map((changedFile) => {
        const tags = getTagsForFilesChanged(readme, [
          changedFile.substring(changedFiles.indexOf(relativePath)),
        ]);
        tags.forEach((element) => {
          const previousPrior = tagsPriority.get(element);
          const tagFiles = getInputFilesForTag(readme.markDown ,element)
          /**
          * consider 
          * one changed file in a tag's priority is 10000 
          * default tag's priority is 10000000
          * 
          */
          const DefaultTagPriority = 10000000
          const changedFilePriority = 10000
          if (defaultTag === element) {
            tagsPriority.set(
              element,
              previousPrior
                ? previousPrior + changedFilePriority
                : tagFiles
                ? DefaultTagPriority
                : 0
            );
          }
          else {
             tagsPriority.set(
               element,
               previousPrior
                 ? previousPrior + changedFilePriority
                 : tagFiles
                 ? tagFiles.length
                 : 0
             );
          }
         
        });
      });

      /**
       *  sort tag by prior
       */
      const sortedTagsCnt = [...tagsPriority].sort(tagLess);

      const AffectedTags: string[] = [];
      sortedTagsCnt.forEach((v) => {
        if (!changedFiles.length) {
          return;
        }
        const tag = v[0];
        const tagFiles = getInputFilesForTag(readme.markDown, tag);

        if (tagFiles) {
          let intersection = tagFiles.filter((v) =>
            changedFiles.includes(relativePath + v)
          );
          if (intersection) {
            changedFiles = changedFiles.filter(
              (v) => !intersection.includes(v.substring(relativePath.length))
            );
            AffectedTags.push(tag);
          }
        }
      });
      if (changedFiles.length) {
        console.log(
          `These following changed files can not find the related tag:${changedFiles.join(
            "\n"
          )}`
        );
      }
      tagsAffectedMap.set(key, AffectedTags);
    });
    return tagsAffectedMap;
  } catch (err) {
    throw err;
  }
};

/**
 * Retrieves list of swagger files to be processed for linting
 * @returns {Array} list of files to be processed for linting
 */
export const getFilesChangedInPR = async (
  pr: devOps.PullRequestProperties | undefined
) => {
  let result = getSwaggers();
  if (pr !== undefined) {
    try {
      let filesChanged = await pr.structuralDiff().toArray();
      console.log(">>>>> Files changed in this PR are as follows:");
      console.log(filesChanged);
      let swaggerFilesInPR = filesChanged.filter(function (item: string) {
        if (
          item.match(/.*(json|yaml)$/gi) == null ||
          item.match(/.*specification\/.*/gi) == null
        ) {
          return false;
        }
        if (item.match(/.*\/examples\/*/gi) !== null) {
          return false;
        }
        if (item.match(/.*\/quickstart-templates\/*/gi) !== null) {
          return false;
        }
        return true;
      });
      console.log(
        `>>>> Number of swaggers found in this PR: ${swaggerFilesInPR.length}`
      );

      var deletedFiles = swaggerFilesInPR.filter(function (
        swaggerFile: string
      ) {
        return !fs.existsSync(swaggerFile);
      });
      console.log(">>>>> Files deleted in this PR are as follows:");
      console.log(deletedFiles);
      // Remove files that have been deleted in the PR
      swaggerFilesInPR = swaggerFilesInPR.filter(function (x: string) {
        return deletedFiles.indexOf(x) < 0;
      });

      result = swaggerFilesInPR;
    } catch (err) {
      throw err;
    }
  }
  return result;
};

/**
 * Downloads the remote schemas and initializes the validator with remote references.
 * @returns {Object} context Provides the schemas in json format and the validator.
 */
export const initializeValidator = async function () {
  const context: stringMap.MutableStringMap<unknown> = {
    extensionSwaggerSchema: await asyncJsonRequest(extensionSwaggerSchemaUrl),
    swaggerSchema: await asyncJsonRequest(swaggerSchemaAltUrl),
    exampleSchema: await asyncJsonRequest(exampleSchemaUrl),
    compositeSchema: await asyncJsonRequest(compositeSchemaUrl),
  };
  let validator = new z({ breakOnFirstError: false });
  validator.setRemoteReference(swaggerSchemaUrl, context.swaggerSchema);
  validator.setRemoteReference(exampleSchemaUrl, context.exampleSchema);
  validator.setRemoteReference(compositeSchemaUrl, context.compositeSchema);
  context.validator = validator;
  return context;
};

/**
 * Get Openapi Type From readme.md ,If failed then from the path
 * @returns {string} arm | data-plane | default
 */
export const getOpenapiType = async function (
  configFile: string
): Promise<string> {
  try {
    let rawMarkdown = fs.readFileSync(configFile, "utf8");
    for (const codeBlock of parseCodeblocks(rawMarkdown)) {
      if (
        !codeBlock.info ||
        codeBlock.info.trim().toLocaleLowerCase() !== "yaml" ||
        !codeBlock.literal
      ) {
        continue;
      }
      let lines = codeBlock.literal.trim().split("\n");
      if (!lines) {
        continue;
      }
      for (let line of lines) {
        if (line.trim().startsWith("openapi-type:")) {
          let openapiType = line.trim().split(":")[1].trim().toLowerCase();
          if (isValidType(openapiType)) {
            return new Promise((resolve) => {
              resolve(openapiType);
            });
          }
        }
      }
    }
  } catch (err) {
    console.log("parse failed with msg:" + err);
  }

  if (
    configFile.match(/.*specification\/.*\/resource-manager\/.*readme.md$/g)
  ) {
    return new Promise((resolve) => {
      resolve("arm");
    });
  } else if (
    configFile.match(/.*specification\/.*\/data-plane\/.*readme.md$/g)
  ) {
    return new Promise((resolve) => {
      resolve("data-plane");
    });
  } else {
    return new Promise((resolve) => {
      resolve("default");
    });
  }

  function parseCommonmark(markdown: string): commonmark.Node {
    return new commonmark.Parser().parse(markdown);
  }

  function* parseCodeblocks(markdown: string): Iterable<commonmark.Node> {
    const parsed = parseCommonmark(markdown);
    const walker = parsed.walker();
    let event;
    while ((event = walker.next())) {
      const node = event.node;
      if (event.entering && node.type === "code_block") {
        yield node;
      }
    }
  }

  function isValidType(type: string): boolean {
    const types = ["arm", "data-plane"];
    return types.indexOf(type) !== -1;
  }
};

type LintVersion = {
  classic: string;
  present: string;
};

export const getLinterVersion = (): LintVersion => {
  let classicLintVersion = process.env["CLASSIC_LINT_VERSION"];
  let lintVersion = process.env["LINT_VERSION"];
  if (!classicLintVersion || !classicLintVersion.match(/^\d+\.\d+\.\d+$/)) {
    classicLintVersion = "";
  }

  if (!lintVersion || !lintVersion.match(/^\d+\.\d+\.\d+$/)) {
    lintVersion = "";
  }

  return {
    classic: classicLintVersion,
    present: lintVersion,
  };
};

export const getRelativeSwaggerPathToRepo = (filePath: string): string => {
  const position = filePath.search("specification");
  return filePath.substring(position, filePath.length);
};

/**
 * For breaking change. Trim file path pattern to github style.
 * E.g. Input: specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json:191:5
 *      Output: specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json#L191:5
 * @param filePath
 *
 */
export const getGithubStyleFilePath = (filePath: string): string => {
  const regex = /(.json:)/;
  return filePath.replace(regex, ".json#L");
};

/**
 * set the Upstream Branch of branch, this function should run in a repo dir
 */
export const setUpstreamBranch = function (name: string, remote: string) {
  let cmd = `git branch ${name} ${remote}`;
  console.log(`set upstream branch ${remote} ${name} `);
  console.log(`> ${cmd}`);
  execSync(cmd, { encoding: "utf8", stdio: "inherit" });
};

/**
 * Get the Github url of targeted swagger file.
 * @param file Swagger file starts with "specification"
 */
export function targetHref(file: string) {
  return file
    ? `https://github.com/${
        process.env.TRAVIS_REPO_SLUG
      }/blob/${getTargetBranch()}/${file}`
    : "";
}

/**
 * Get the Github url of commited swagger file.
 * @param file Swagger file starts with "specification"
 */
export function blobHref(file: unknown) {
  const repoName = process.env.TRAVIS_PULL_REQUEST_SLUG !== undefined ? process.env.TRAVIS_PULL_REQUEST_SLUG : process.env.TRAVIS_REPO_SLUG;
  return `https://github.com/${repoName}/blob/${process.env.TRAVIS_PULL_REQUEST_SHA}/${file}`;
}