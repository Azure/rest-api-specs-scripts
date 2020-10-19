import { cleanUp } from "./helper";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, slow, timeout, skip, only } from "mocha-typescript";
import { devOps } from "@azure/avocado";
import * as assert from "assert";
import { utils } from "../index";
import { createDevOpsEnv } from "./helper";
import * as fs from "fs-extra";
import { MarkDownEx, parse } from "@ts-common/commonmark-to-markdown";
import {
  getTagsFromChangedFile,
  isTagExisting,
  getChangeFilesReadmeMap,
  tagLess,
  getDefaultTag,
} from "../utils";

@suite
class UtilsTest {
  @test TestTagLess() {
    const toBeSort: [string, number][] = [
      ["package-2019-01", 5],
      ["package-2020-01-schema", 7],
      ["package-2018-01", 6],
      ["other-package-2020-01", 7],
      ["package-2020-01-only", 7],
      ["package-2017-01", 6],
      ["package-2020-01-profile", 7],
    ];
    toBeSort.sort(utils.tagLess);
    assert.deepEqual(toBeSort, [
      ["package-2018-01", 6],
      ["package-2017-01", 6],
      ["package-2019-01", 5],
      ["other-package-2020-01", 7],
      ["package-2020-01-only", 7],
      ["package-2020-01-schema", 7],
      ["package-2020-01-profile", 7],
    ]);
  }

  @test async TestGetOpenapiTypeDataplane() {
    let openapiType = await utils.getOpenapiType(
      "./src/tests/Resource/openapi-type-data-plane-readme.md"
    );
    assert.equal(openapiType, "data-plane");
  }

  @test async TestGetOpenapiTypeDataplanArm() {
    let openapiType = await utils.getOpenapiType(
      "./src/tests/Resource/openapi-type-arm-readme.md"
    );
    assert.equal(openapiType, "arm");
  }

  @test async TestGetOpenapiTypeNoExistFile() {
    let openapiType = await utils.getOpenapiType(
      "C:/code/data-plane/test/readme.md"
    );
    assert.equal(openapiType, "default");
  }

  @test async TestGetOpenapiTypeFromPathWithArm() {
    let openapiType = await utils.getOpenapiType(
      "C:/specification/test/resource-manager/test/readme.md"
    );
    assert.equal(openapiType, "arm");
  }

  @test async TestGetOpenapiTypeFromPathWithDataPlane() {
    let openapiType = await utils.getOpenapiType(
      "/home/work/1/spec/specification/test/data-plane/test/readme.md"
    );
    assert.equal(openapiType, "data-plane");
  }

  @test async TestGetOpenapiTypeFromRelativePath() {
    let openapiType = await utils.getOpenapiType(
      "specification/test/data-plane/test/readme.md"
    );
    assert.equal(openapiType, "data-plane");
  }

  @test @timeout(60000) async TestDoOnTargetBranch() {
    const rootName = "test-root";
    const repoName = "mock-repo";
    const cfg = await createDevOpsEnv(rootName, repoName);
    /** Create a mock pr.
     * The pr contains two branches.
     * Master:
     * ├── license
     * └── specification
     *     ├── file1.json
     *     ├── file2.json
     *     ├── file3.json
     *     └── readme.md
     *
     * Source:
     * ├── license
     * ├── specification
     * │   ├── file1.json
     * │   ├── file2.json
     * │   ├── file3.json
     * │   └── file4.json (new file)
     * └── textfile.txt
     *
     * */
    const pr = await devOps.createPullRequestProperties(cfg);

    const files = [
      "specification/file1.json",
      "specification/file2.json",
      "specification/file3.json",
      "specification/file4.json",
    ];
    if (pr !== undefined) {
      const newSwaggers = await utils.doOnTargetBranch(pr, async () => {
        return files.filter((s) => !fs.existsSync(s));
      });
      assert.deepEqual(newSwaggers, ["specification/file4.json"]);
    }

    await cleanUp(rootName, repoName);
  }

  @test TestGetLintVersion() {
    process.env.CLASSIC_LINT_VERSION = "1.1.0";
    process.env.LINT_VERSION = "1.1.0";
    let version = utils.getLinterVersion();
    assert.deepEqual(version, { classic: "1.1.0", present: "1.1.0" });
  }

  @test async TestgetTagsFromChangedFile() {
    let cwd = process.cwd();
    process.chdir("./src/tests/Resource");
    let changedFiles = [
      "specification/network/resource-manager/Microsoft.Network/stable/2020-03-01/privateEndpoint.json",
      "specification/network/resource-manager/Microsoft.Network/stable/2019-12-01/firewallPolicy.json",
    ];

    let tags = await getTagsFromChangedFile(changedFiles);
    assert.equal(!tags, false);
    let realChangedFiles = tags.get(
      "specification/network/resource-manager/readme.md"
    );
    assert.deepEqual(realChangedFiles, ["package-2020-03", "package-2019-12"]);

    changedFiles = [
      "specification/network/resource-manager/Microsoft.Network/stable/2020-03-01/privateEndpoint.json",
      "specification/network/resource-manager/Microsoft.Network/stable/2019-12-01/ddosCustomPolicy.json",
    ];

    tags = await getTagsFromChangedFile(changedFiles);
    assert.equal(!tags, false);
    realChangedFiles = tags.get(
      "specification/network/resource-manager/readme.md"
    );
    assert.deepEqual(realChangedFiles, ["package-2020-03"]);
    process.chdir(cwd);
  }

  @test TestIsTagExisting() {
    let cwd = process.cwd();
    process.chdir("./src/tests/Resource");

    let result = isTagExisting(
      "specification/network/resource-manager/readme.md",
      "package-2020-03"
    );
    assert.equal(result, true);

    result = isTagExisting(
      "specification/network/resource-manager/readme.md",
      "package-2020-06"
    );
    assert.equal(result, false);

    // test non-existing readme
    result = isTagExisting(
      "specification/network/resource-manager/readme1.md",
      "package-2020-06"
    );
    assert.equal(result, false);
    process.chdir(cwd);
  }

  @test TestGetDefaultTag() {
    let cwd = process.cwd();
    process.chdir("./src/tests/Resource");
    const content = fs.readFileSync("specification/network/resource-manager/readme.md", { encoding: "utf8" });
    const readme = parse(content);
    let result = getDefaultTag(readme.markDown);
    assert.equal(result, "package-2020-03");
    process.chdir(cwd);
  }

  @test async TestGetChangeFilesReadmeMap() {
    let cwd = process.cwd();
    process.chdir("./src/tests/Resource");

    let result = await getChangeFilesReadmeMap([
      "specification/network/resource-manager/readme.md",
      "specification/network/resource-manager/Microsoft.Network/stable/2020-03-01/privateEndpoint.json",
      "profiles/network/resource-manager/Microsoft.Network/a.json",
    ]);
    const expect = new Map<string, string[]>([
      [
        "specification/network/resource-manager/readme.md",
        [
          "specification/network/resource-manager/Microsoft.Network/stable/2020-03-01/privateEndpoint.json",
        ],
      ],
    ]);
    assert.deepEqual(result, expect);
    process.chdir(cwd);
  }

  @test TestTrimSwaggerPath() {
    assert.deepEqual(
      utils.getRelativeSwaggerPathToRepo(
        "file:///home/ruowan/work/c93b354fd9c14905bb574a8834c4d69b/specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json:150:5"
      ),
      "specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json:150:5"
    );

    assert.deepEqual(
      utils.getRelativeSwaggerPathToRepo(
        "file:///tmp/resolved/specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json:191:5"
      ),
      "specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json:191:5"
    );
    assert.deepEqual(
      utils.getRelativeSwaggerPathToRepo("tmp:a/b/readme.md"),
      "tmp:a/b/readme.md"
    );
  }

  @test TestTrimGithubStyleFilePath() {
    assert.deepEqual(
      utils.getGithubStyleFilePath(
        "file:///home/ruowan/work/c93b354fd9c14905bb574a8834c4d69b/specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json:150:5"
      ),
      "file:///home/ruowan/work/c93b354fd9c14905bb574a8834c4d69b/specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json#L150:5"
    );

    assert.deepEqual(
      utils.getGithubStyleFilePath(
        "file:///home/ruowan/work/c93b354fd9c14905bb574a8834c4d69b/specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json"
      ),
      "file:///home/ruowan/work/c93b354fd9c14905bb574a8834c4d69b/specification/redis/resource-manager/Microsoft.Cache/preview/2019-07-01/redis.json"
    );
  }
}
