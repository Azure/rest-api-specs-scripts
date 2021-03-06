// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { devOps, cli } from '@azure/avocado'
import * as utils from './utils'
import * as oav from 'oav'

export async function main() {
  const pr = await devOps.createPullRequestProperties(cli.defaultConfig())
  let swaggersToProcess = await utils.getFilesChangedInPR(pr);
  swaggersToProcess = swaggersToProcess.filter(function (item) {
    // Useful when debugging a test for a particular swagger.
    // Just update the regex. That will return an array of filtered items.
    //   return (item.match(/.*Microsoft.Logic.*2016-06-01.*/ig) !== null);
    return (item.match(/.*specification\/.*/ig) !== null);
  });
  let exitCode: number = 0;
  let specValidationResult;
  for (const swagger of swaggersToProcess) {
    try {
      specValidationResult = await oav.validateSpec(swagger, {consoleLogLevel: 'error', pretty: true});
      if (specValidationResult.validityStatus === false) {
        exitCode = 1;
      }
    } catch (e) {
      console.error("error: ")
      console.error(e)
      exitCode = 1
    }
  }
  process.exitCode = exitCode;
}
