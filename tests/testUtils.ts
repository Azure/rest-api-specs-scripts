// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, slow, timeout, skip, only } from "mocha-typescript";
import * as assert from "assert";
import {utils as utils} from "../src/index"

@suite class TestUtils {
    @test async "TestGetOpenapiTypeDataplane" () {
        let openapiType = await utils.GetOpenapiType("./tests/Resource/openapi-type-data-plane-readme.md")
        assert.equal(openapiType,"data-plane")
    }

    @test async "TestGetOpenapiTypeDataplanArm" () {
        let openapiType = await utils.GetOpenapiType("./tests/Resource/openapi-type-arm-readme.md")
        assert.equal(openapiType,"arm")
    }

    @test async "TestGetOpenapiTypeNoExistFile" () {
        let openapiType = await utils.GetOpenapiType("C:/code/data-plane/test/readme.md")
        assert.equal(openapiType,"default")
    }

    @test async "TestGetOpenapiTypeFromPathWithArm" () {
        let openapiType = await utils.GetOpenapiType("C:/specification/test/resource-manager/test/readme.md")
        assert.equal(openapiType,"arm")
    }

    @test async "TestGetOpenapiTypeFromPathWithDataPlane" () {
        let openapiType = await utils.GetOpenapiType("/home/work/1/spec/specification/test/data-plane/test/readme.md")
        assert.equal(openapiType,"data-plane")
    }
}
