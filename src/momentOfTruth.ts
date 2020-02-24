// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as momentOfTruthUtils from './momentOfTruthUtils'
import * as tsUtils from './ts-utils'
import { exec } from 'child_process'
import * as path from 'path'
import * as utils from './utils'
import * as fs from 'fs'
import { devOps, cli } from '@azure/avocado'

// Executes linter on given swagger path and returns structured JSON of linter output
async function getLinterResult(swaggerPath: string|null|undefined) {
    if (swaggerPath === null || swaggerPath === undefined || typeof swaggerPath.valueOf() !== 'string' || !swaggerPath.trim().length) {
        throw new Error('swaggerPath is a required parameter of type "string" and it cannot be an empty string.');
    }

    let jsonResult = [];
    if (!fs.existsSync(swaggerPath)) {
        return [];
    }

    let openapiType = await utils.GetOpenapiType(swaggerPath).then(result=>{})
    let openapiTypeCmd = ' --openapi-type=' + openapiType + ' '
    let cmd = "npx autorest --reset && " + linterCmd + openapiTypeCmd + swaggerPath;
    console.log(`Executing: ${cmd}`);
    const { err, stdout, stderr } = await new Promise(res => exec(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
        (err: unknown, stdout: unknown, stderr: unknown) => res({ err: err, stdout: stdout, stderr: stderr })));

    if (err && stderr.indexOf("Process() cancelled due to exception") !== -1) {
        console.error(`AutoRest exited with code ${err.code}`);
        console.error(stderr);
        throw new Error("AutoRest failed");
    }

    let resultString = stdout + stderr;
    if (resultString.indexOf('{') !== -1) {
        resultString = resultString.replace(/Processing batch task - {.*} \.\n/g, "");
        resultString = "[" + resultString.substring(resultString.indexOf('{')).trim().replace(/\}\n\{/g, "},\n{") + "]";
        //console.log('>>>>>> Trimmed Result...');
        //console.log(resultString);
        try {
            jsonResult = JSON.parse(resultString);
            //console.log('>>>>>> Parsed Result...');
            //console.dir(resultObject, {depth: null, colors: true});
            return jsonResult;
        } catch (e) {
            console.error(`An error occurred while executing JSON.parse() on the linter output for ${swaggerPath}:`);
            console.dir(resultString);
            console.dir(e, { depth: null, colors: true });
            process.exit(1)
        }
    }
    return [];
};

const linterCmd = `npx autorest --validation --azure-validator --message-format=json `;

//main function
export async function runScript() {
    const pullRequestNumber = utils.getPullRequestNumber();
    const filename = `${pullRequestNumber}.json`;
    const logFilepath = path.join(momentOfTruthUtils.getLogDir(), filename);

    const finalResult: momentOfTruthUtils.FinalResult = {
        pullRequest: pullRequestNumber,
        repositoryUrl: utils.getRepoUrl(),
        files: {}
    }

    //creates the log file if it has not been created
    function createLogFile() {
        if (!fs.existsSync(logFilepath)) {
            fs.writeFileSync(logFilepath, '');
        }
    }

    //appends the content to the log file
    function writeContent(content: unknown) {
        fs.writeFileSync(logFilepath, content);
    }

    // Updates final result json to be written to the output file
    async function updateResult(
        spec: string,
        errors: readonly momentOfTruthUtils.Issue[],
        beforeOrAfter: momentOfTruthUtils.BeforeOrAfter
    ) {
        const files = finalResult['files']
        if (!files[spec]) {
            files[spec] = { before: [], after: [] };
        }
        const filesSpec = tsUtils.asNonUndefined(files[spec])
        filesSpec[beforeOrAfter] = errors;
    }

    // Run linter tool
    async function runTools(swagger: string, beforeOrAfter: momentOfTruthUtils.BeforeOrAfter) {
        console.log(`Processing "${swagger}":`);
        const linterErrors = await getLinterResult(swagger);
        console.log(linterErrors);
        await updateResult(swagger, linterErrors, beforeOrAfter);
    };

    //
    const pr = await devOps.createPullRequestProperties(cli.defaultConfig())
    const configsToProcess = await utils.getConfigFilesChangedInPR(pr);

    console.log('Processing configs:');
    console.log(configsToProcess);
    createLogFile();
    console.log(`The results will be logged here: "${logFilepath}".`)

    if (configsToProcess.length > 0 && pr !== undefined) {
        for (const configFile of configsToProcess) {
            await runTools(configFile, 'after');
        }

        await utils.doOnTargetBranch(pr, async () => {
            for (const configFile of configsToProcess) {
                await runTools(configFile, 'before');
            }
        });
    }

    writeContent(JSON.stringify(finalResult, null, 2));
}
