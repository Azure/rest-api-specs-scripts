// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, timeout, skip } from "mocha-typescript";
import * as Rpaas from "../lintingRpaas";
import { LintingResultParser } from "../momentOfTruthUtils";
import * as assert from "assert";
import { utils } from "..";
import { devOps } from "@azure/avocado";
import * as fs from "fs";
import { cleanUpDir } from "./helper";
import * as asyncIt from "@ts-common/async-iterator";
import { ResultMessageRecord, MessageLine } from '@azure/swagger-validation-common';
import _ from 'lodash';

const sinon = require("sinon");
let cwd = process.cwd();

@suite
class LintingRpaasTest {
  before() {
    process.env.CLASSIC_LINT_VERSION = "1.1.3";
    process.env.LINT_VERSION = "1.4.0";
  }
  @test TestReadmeParser() {
    process.chdir("./src/tests/Resource/lintingRpaas");
    const parser = new Rpaas.ReadmeParser("specification/test-lint/readme.md");
    assert.equal(parser.getGlobalConfigByName("openapi-type"), "arm");
  }
 
  @test @timeout(100000) async TestLintingRpaas() {
    process.chdir("./src/tests/Resource/lintingRpaas");
    
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
    const pipeFile = "./pipe.log";
    if (fs.existsSync(pipeFile)) {
      fs.unlinkSync(pipeFile);
    }
    
    await Rpaas.runRpaasLint();
    
    stub3.restore();
    stub4.restore();

    assert.equal(true, stub4.called);

    console.log("------------- read from pipe.log -----------------");
    const chunck = fs.readFileSync(pipeFile, { encoding: "utf8" });
    console.log(chunck);
    const messages = chunck
      .split(/[\r\n]+/)
      .filter((l) => l) // filter out empty lines
      .map((l) => JSON.parse(l.trim()) as MessageLine)
      .map((l) => (Array.isArray(l) ? l : [l]));
    const res: ResultMessageRecord[] = _.flatMap(messages, (m) => m).map(
      (m) => <ResultMessageRecord>m
    );
    const resIds = res.map((m) => m.id).sort();
    console.log(
      "------------- parse validation message from[pipe.log] ------------------"
    );
    console.log(JSON.stringify(res));
    assert.deepEqual(resIds, ["D5001","R2054","R3023"]);
  }

  after() {
    process.chdir(cwd);
  }
}
