// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, timeout } from "mocha-typescript";
import * as assert from "assert";
import {
  ruleManager,
} from "../breakingChangeRuleManager";
@suite
class BreakingChangeRuleTest {
  cwd = process.cwd();
  before() {
    process.env.BREAKING_CHANGE_RULE_CONFIG_PATH = "./breakingChangeRules.yaml";
  }

  @test testcrossApiVersion() {
    process.chdir("./src/tests/Resource/breakingChangeRule");
    const messages = [
      {
        id: "1034",
        code: "AddedRequiredProperty",
        message:
          "The new version has new required property 'capacity' that was not found in the old version.",
        old: {
          ref:
            "file:///home/vsts/work/1/c93b354fd9c14905bb574a8834c4d69b/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json#/definitions/ApiManagementServiceResource/properties/sku",
          path: "definitions.ApiManagementServiceResource.properties.sku",
          location:
            "file:///home/vsts/work/1/c93b354fd9c14905bb574a8834c4d69b/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json:1268:9",
        },
        new: {
          ref:
            "file:///tmp/resolved/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json#/definitions/ApiManagementServiceResource/properties/sku",
          path: "definitions.ApiManagementServiceResource.properties.sku",
          location:
            "file:///tmp/resolved/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json:3143:9",
        },
        type: "Error",
        docUrl:
          "https://github.com/Azure/openapi-diff/tree/master/docs/rules/1034.md",
        mode: "Addition",
      },
    ];
    const expected = [
      {
        id: "1034",
        code: "Added Required Property",
        message: "override message",
        old: {
          ref:
            "file:///home/vsts/work/1/c93b354fd9c14905bb574a8834c4d69b/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json#/definitions/ApiManagementServiceResource/properties/sku",
          path: "definitions.ApiManagementServiceResource.properties.sku",
          location:
            "file:///home/vsts/work/1/c93b354fd9c14905bb574a8834c4d69b/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json:1268:9",
        },
        new: {
          ref:
            "file:///tmp/resolved/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json#/definitions/ApiManagementServiceResource/properties/sku",
          path: "definitions.ApiManagementServiceResource.properties.sku",
          location:
            "file:///tmp/resolved/specification/apimanagement/resource-manager/Microsoft.ApiManagement/preview/2019-12-01-preview/apimdeployment.json:3143:9",
        },
        type: "info",
        docUrl:
          "https://github.com/Azure/openapi-diff/tree/master/docs/rules/1034.md",
        mode: "Addition",
      },
    ];
    const result = ruleManager.handleCrossApiVersion(messages);
    assert.deepEqual(result, expected);
  }

  after() {
    process.chdir(this.cwd);
  }
}
