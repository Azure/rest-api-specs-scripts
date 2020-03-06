import { cleanUp } from './helper';
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, slow, timeout, skip, only } from "mocha-typescript";
import { devOps } from '@azure/avocado';
import * as assert from "assert";
import {utils as utils} from "../index"
import {createDevOpsEnv} from "./helper"
import * as fs from 'fs-extra'


@suite class UtilsTest {
    @test async "TestGetOpenapiTypeDataplane" () {
        let openapiType = await utils.getOpenapiType("./src/tests/Resource/openapi-type-data-plane-readme.md")
        assert.equal(openapiType,"data-plane")
    }

    @test async "TestGetOpenapiTypeDataplanArm" () {
        let openapiType = await utils.getOpenapiType("./src/tests/Resource/openapi-type-arm-readme.md")
        assert.equal(openapiType,"arm")
    }

    @test async "TestGetOpenapiTypeNoExistFile" () {
        let openapiType = await utils.getOpenapiType("C:/code/data-plane/test/readme.md")
        assert.equal(openapiType,"default")
    }

    @test async "TestGetOpenapiTypeFromPathWithArm" () {
        let openapiType = await utils.getOpenapiType("C:/specification/test/resource-manager/test/readme.md")
        assert.equal(openapiType,"arm")
    }

    @test async "TestGetOpenapiTypeFromPathWithDataPlane" () {
        let openapiType = await utils.getOpenapiType("/home/work/1/spec/specification/test/data-plane/test/readme.md")
        assert.equal(openapiType,"data-plane")
    }

    @test async "TestDoOnTargetBranch" () {
        const rootName = 'test-root'
        const repoName = 'mock-repo'
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
        const pr = await devOps.createPullRequestProperties(cfg)

        const files = ['specification/file1.json', 'specification/file2.json', 'specification/file3.json', 'specification/file4.json']
        if(pr!==undefined){
            const newSwaggers = await utils.doOnTargetBranch(pr, async ()=>{
                return files.filter(s=>!fs.existsSync(s))
            })
            assert.deepEqual(newSwaggers, ['specification/file4.json'])
        }

        await cleanUp(rootName, repoName)
    }
}
