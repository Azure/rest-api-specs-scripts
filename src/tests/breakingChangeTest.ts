import { cleanUp } from "./helper";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test } from "mocha-typescript";
import * as assert from "assert";
import * as fs from "fs-extra";
import {
  SwaggerVersionManager,
  CrossVersionBreakingDetector,
} from "../breaking-change";
import * as asyncIt from "@ts-common/async-iterator";
import { FileChange } from '@azure/avocado/dist/dev-ops';
@suite
class BreakingChangeTest {
  cwd = process.cwd()
  before() {}

  @test async TestCrossVersionBreakingDetection() {
    const newSwaggers: string[] = [
      "specification/testRP/stable/2020-08-01/a.json",
    ];
    process.chdir("src/tests/Resource/oadTests/new");
    const workingDir = this.cwd + "/src/tests/Resource/oadTests/old";
    const pr = {
      sourceBranch: "test",
      targetBranch: "master",
      workingDir,
      checkout: async (branch: string) => {},
      diff: async () => {
        return [
          { path: "specification/testRP/stable/2020-08-01/a.json" },
        ] as FileChange[];
      },
      structuralDiff: (): asyncIt.AsyncIterableEx<string> =>
        asyncIt.fromSequence<string>(
          "specification/testRP/stable/2020-08-01/a.json"
        ),
    };
    const resultFile = "pipe.log";
    if (fs.existsSync(resultFile)) {
      fs.unlinkSync(resultFile);
    }
    const detector = new CrossVersionBreakingDetector(pr, newSwaggers);
    await detector.getBreakingChangeBaseOnStableVersion();
    const breaking = JSON.parse(fs.readFileSync(resultFile).toString());
    assert.equal(2, breaking.length);
  }

  after() {
      process.chdir(this.cwd)
  }

  @test TestSwaggerVersionManager() {
    const versionManager = new SwaggerVersionManager();
    assert.equal(versionManager.getClosestPreview("test/test.json"), undefined);
    assert.equal(
      versionManager.getClosestStale("src/tests/Resource/test.json"),
      undefined
    );
  }
}