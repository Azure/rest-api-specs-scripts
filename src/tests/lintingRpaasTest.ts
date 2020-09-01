// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, timeout, skip } from "mocha-typescript";
import * as Rpaas from "../lintingRpaas";
import * as assert from "assert";
import { utils } from "..";
import { devOps } from "@azure/avocado";
import * as fs from "fs";
import * as asyncIt from "@ts-common/async-iterator";
import { ResultMessageRecord, MessageLine } from '@azure/swagger-validation-common';
import _ from 'lodash';
import { LintingResultMessage } from '../momentOfTruthUtils';

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

  @test TestLintMsgTransformer() {
    process.chdir("./src/tests/Resource/lintingRpaas");
    const transformer = new Rpaas.LintMsgTransformer();
    const testMsg = [
      ({
        type: "Error",
        code: "XmsParameterLocation",
        message:
          'The parameter ',
        id: "R4001",
        validationCategory: "SDKViolation",
        providerNamespace: null,
        resourceType: null,
        sources: [
          "file:///C:/code/rest-api-specs-scripts/src/tests/Resource/momentOfTruthWithAutorestError/old/specification/test-lint/test/test-lint-a.json:41:4 ($.parameters.SubscriptionId)",
        ],
        jsonref:
          "file:///C:/code/rest-api-specs-scripts/src/tests/Resource/momentOfTruthWithAutorestError/old/specification/test-lint/test/test-lint-a.json:41:4 ($.parameters.SubscriptionId)",
        "json-path":
          "file:///C:/code/rest-api-specs-scripts/src/tests/Resource/momentOfTruthWithAutorestError/old/specification/test-lint/test/test-lint-a.json:41:4 ($.parameters.SubscriptionId)",
      } as unknown) as LintingResultMessage,
    ];
    const expectedMsg = {
        type: "Result",
        level: "Error",
        message: "The parameter ",
        code: "XmsParameterLocation",
        id: "R4001",
        docUrl:
          "https://github.com/Azure/azure-rest-api-specs/blob/master/documentation/openapi-authoring-automated-guidelines.md#R4001",
    };
    const tranformedMsg = transformer.lintMsgToUnifiedMsg(testMsg)
    const MsgJson = JSON.parse(tranformedMsg)
    assert.equal(MsgJson[0].type, expectedMsg.type);
    assert.equal(MsgJson[0].level, expectedMsg.level);
    assert.equal(MsgJson[0].code, expectedMsg.code);
    assert.equal(MsgJson[0].docUrl, expectedMsg.docUrl);
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
    
    console.log(
      "------------- parse validation message from[pipe.log] ------------------"
    );
    assert.deepEqual(chunck, '[]');
  }

  after() {
    process.chdir(cwd);
  }
}
