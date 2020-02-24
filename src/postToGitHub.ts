// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

const { octokit } = require('@octokit/rest');
let token = process.env.GITHUB_TOKEN;

if(token != undefined) {
    octokit.authenticate({
        type: 'token',
        token: token
    });
}

export const postGithubComment = function(owner: string, repository: string, prNumber: number, commentBody: string) {
    octokit.issues.createComment({
        owner: owner,
        repo: repository,
        issue_number: prNumber,
        body: commentBody
    }).then(() => {
        console.log("Comment has been posted");
    }). catch((err: unknown) => {
        console.log(err);
    });
}
