// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, timeout, skip } from "mocha-typescript";
import {getLinterResult,lintDiff} from '../momentOfTruth'
import {LintingResultParser} from '../momentOfTruthUtils'
import * as assert from "assert";
import { utils } from '..';
import {devOps} from '@azure/avocado'
import * as fs from "fs";
import {cleanUpDir } from './helper';
import * as asyncIt from "@ts-common/async-iterator";

const sinon = require("sinon");
let cwd = process.cwd()

@suite
class MomentOfTruthTest {
  before() {
    process.env.CLASSIC_LINT_VERSION = "1.1.0";
    process.env.LINT_VERSION = "1.1.0";
  }
  /**
   * test if the lint tool run normally
   */
  @test @timeout(60000) async TestGetLinterResult() {
    const resultStr = await getLinterResult(
      "./src/tests/Resource/swagger/test-lint-result.md"
    );
    const paser = new LintingResultParser(resultStr);
    const result = paser.getResult();
    assert.equal(Object.keys(result).length, 3);

    const resultIds = [result[0].id, result[1].id, result[2].id].sort();

    assert.deepEqual(resultIds, ["D5001", "R2054", "R3023"]);
  }

  @test @timeout(60000) async TestGetLinterResultWithTag() {
    const resultStr = await getLinterResult(
      "./src/tests/Resource/swagger/test-lint-result.md",
      "package-2017-04"
    );
    const paser = new LintingResultParser(resultStr);
    const result = paser.getResult();
    assert.equal(Object.keys(result).length, 3);
    const resultIds = [result[0].id, result[1].id, result[2].id].sort();
    assert.deepEqual(resultIds, ["D5001", "R2054", "R3023"]);
  }

  @test @timeout(100000) async TestLintDiff() {
    let cwd = process.cwd();
    process.chdir("./src/tests/Resource/momentOfTruth/new");

    let stub2 = sinon.stub(utils, "getPullRequestNumber").callsFake(() => 1000);

    let stub3 = sinon.stub(utils, "getRepoUrl").callsFake(() => "repo");

    let stub4 = sinon.stub(devOps, "createPullRequestProperties").returns({
      workingDir: cwd + "/src/tests/Resource/momentOfTruth/old",
      checkout: () => "true",
      diff: () => {
        return [{ path: "specification/test-lint/test/test-lint-result.json" }];
      },
      structuralDiff: (): asyncIt.AsyncIterableEx<string> =>
        asyncIt.fromSequence<string>(
          "specification/test-lint/test/test-lint-result.json"
        ),
    });

    await cleanUpDir("./output");
    await lintDiff(utils, devOps);

    stub2.restore();
    stub3.restore();
    stub4.restore();

    assert.equal(true, stub2.called);
    assert.equal(true, stub3.called);
    assert.equal(true, stub4.called);

    const logFile = "./output/1000.json";
    const result = JSON.parse(fs.readFileSync(logFile, { encoding: "utf8" }));
    const resultFiles = result.files;
    assert.deepEqual(Object.keys(resultFiles), [
      "specification/test-lint/readme.md",
    ]);

    assert.equal(
      Object.keys(resultFiles["specification/test-lint/readme.md"].before)
        .length,
      3
    );
    assert.equal(
      Object.keys(resultFiles["specification/test-lint/readme.md"].after)
        .length,
      3
    );

    let errorIds = (resultFiles["specification/test-lint/readme.md"]
      .before as Array<any>)
      .map((error) => error.id)
      .sort();
    assert.deepEqual(errorIds, ["R2054", "R3023", "R4004"]);

    errorIds = (resultFiles["specification/test-lint/readme.md"].after as Array<
      any
    >)
      .map((error) => error.id)
      .sort();
    assert.deepEqual(errorIds, ["D5001", "R2054", "R3023"]);
  }

  @test @timeout(100000) async TestLintDiffWithAutoRestError() {
    let cwd = process.cwd();
    process.chdir("./src/tests/Resource/momentOfTruthWithAutorestError/new");

    let stub2 = sinon.stub(utils, "getPullRequestNumber").callsFake(() => 1000);

    let stub3 = sinon.stub(utils, "getRepoUrl").callsFake(() => "repo");

    let stub4 = sinon.stub(devOps, "createPullRequestProperties").returns({
      workingDir:
        cwd + "/src/tests/Resource/momentOfTruthWithAutorestError/old",
      checkout: () => "true",
      diff: () => {
        return [{ path: "specification/test-lint/test/test-lint-a.json" }];
      },
      structuralDiff: (): asyncIt.AsyncIterableEx<string> =>
        asyncIt.fromSequence<string>(
          "specification/test-lint/test/test-lint-a.json"
        ),
    });

    await cleanUpDir("./output");

    try {
       await lintDiff(utils, devOps);
    }
    catch(e) {
    }
    
    stub2.restore();
    stub3.restore();
    stub4.restore();

    assert.equal(true, stub2.called);
    assert.equal(true, stub3.called);
    assert.equal(true, stub4.called);

    const logFile = "./output/1000.json";
    const result = JSON.parse(fs.readFileSync(logFile, { encoding: "utf8" }));
    const resultFiles = result.files;
    assert.deepEqual(Object.keys(resultFiles), [
      "specification/test-lint/readme.md",
    ]);

    assert.equal(
      Object.keys(resultFiles["specification/test-lint/readme.md"].before)
        .length,
      6
    );
    assert.equal(
      Object.keys(resultFiles["specification/test-lint/readme.md"].after)
        .length,
      4
    );

    let errorIds = (resultFiles["specification/test-lint/readme.md"]
      .before as Array<any>)
      .map((error) => error.id)
      .sort();
    assert.deepEqual(errorIds, [
      "R2015",
      "R2054",
      "R2054",
      "R4001",
      "R4004",
      "R4004"
    ]);

    errorIds = (resultFiles["specification/test-lint/readme.md"].after as Array<
      any
    >)
      .map((error) => error.id)
      .sort();
    assert.deepEqual(errorIds, ["D5001", "D5001", "R2054", "R2054"]);

     const pipeFile = "./pipe.log";
     const errors = JSON.parse(fs.readFileSync(pipeFile, { encoding: "utf8" }));
     
     assert.equal(errors.length,2)
     assert.equal(
       errors[0].message.indexOf('{\n  "Channel": "fatal",') !== -1,
       true
     );

  }

  after() {
    process.chdir(cwd);
  }
}
