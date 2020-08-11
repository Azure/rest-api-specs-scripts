// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, timeout, skip } from "mocha-typescript";
import {getLinterResult,lintDiff} from '../momentOfTruth';
import * as assert from "assert";
import { utils } from '..';
import {devOps} from '@azure/avocado';
import * as fs from "fs";
import {cleanUpDir } from './helper';
import * as asyncIt from "@ts-common/async-iterator";
import { postProcessing } from '../momentOfTruthPostProcessing';
import { MessageLine, ResultMessageRecord } from "@azure/swagger-validation-common";
import * as _ from "lodash";

const sinon = require("sinon");
let cwd = process.cwd()

@suite
class MomentOfTruthPostProcessingTest {

  before() {
      process.env.CLASSIC_LINT_VERSION = "1.1.0";
      process.env.LINT_VERSION = "1.1.0";
  }

  @test @timeout(100000) async TestLintDiff() {
    let cwd = process.cwd();
    process.chdir("./src/tests/Resource/momentOfTruth/new");

    let stub2 = sinon.stub(utils, "getPullRequestNumber").callsFake(() => 1001);

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

    let stub5 = sinon.stub(utils, "getTargetBranch").callsFake(() => "master");
    const pipeFile = "./pipe.log";
    if (fs.existsSync(pipeFile)) {
      fs.unlinkSync(pipeFile);
    }
    
    await cleanUpDir("./output");
    await lintDiff(utils, devOps);
    await postProcessing();

    stub2.restore();
    stub3.restore();
    stub4.restore();
    stub5.restore();

    assert.equal(true, stub2.called);
    assert.equal(true, stub3.called);
    assert.equal(true, stub4.called);
    assert.equal(true, stub5.called);

    const logFile = "./output/1001.json";
    const result = JSON.parse(fs.readFileSync(logFile, { encoding: "utf8" }));
    const resultFiles = result.files;
    assert.deepEqual(Object.keys(resultFiles), [
      "specification/test-lint/readme.md",
    ]);

    let errorIds = (resultFiles["specification/test-lint/readme.md"]
      .before as Array<any>)
      .map((error) => error.id)
      .sort();
    assert.deepEqual(errorIds, [ "R2054","R3023", "R4004", ]);

    errorIds = (resultFiles["specification/test-lint/readme.md"]
      .after as Array<any>).map((error) => error.id).sort();
    assert.deepEqual(errorIds, ["D5001","R2054", "R3023"]);
    
    console.log("------------- read from pipe.log -----------------");
    const chunck = fs.readFileSync(pipeFile, { encoding: "utf8" })
    console.log(chunck);
    const messages = chunck.split(/[\r\n]+/)
      .filter(l => l) // filter out empty lines
      .map(l => JSON.parse(l.trim()) as MessageLine)
      .map(l => Array.isArray(l) ? l : [l]);
    const res: ResultMessageRecord[] = _.flatMap(messages, m => m).map(m => <ResultMessageRecord>m);
    const resIds = res.map(m => m.id).sort();
    console.log("------------- parse validation message from[pipe.log] ------------------");
    console.log(JSON.stringify(res));
    assert.deepEqual(resIds, ["D5001"]);
  }

  after() {
    process.chdir(cwd);
  }
}