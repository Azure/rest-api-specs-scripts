// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { suite, test, slow, timeout, skip, only } from "mocha-typescript";
import {postToGitHub} from '../index'

@suite class PostToGitHubTest {
    
    /**
     * this test just make sure no exception throwed from the postGithubComment
     */
    @test  "TestpostGithubComment" () {
      postToGitHub.postGithubComment("","",1,"");
    }

}
