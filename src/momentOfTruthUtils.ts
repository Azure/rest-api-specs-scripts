// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as stringMap from '@ts-common/string-map'
import * as path from 'path'
import * as fs from 'fs'

export type Issue = {
  readonly type?: string
  readonly code: unknown
  readonly message: unknown
  readonly id: string
  readonly validationCategory: string
  readonly providerNamespace: unknown
  readonly resourceType: unknown
  readonly sources: readonly unknown[]
  readonly jsonref: string
  readonly filePath: string
  readonly lineNumber: number
}

export type BeforeOrAfter = 'before' | 'after'

export type File = {
  [key in BeforeOrAfter]: readonly Issue[]
}

/**
 * Moment of truth is using this type for defining a format of file which is produced by
 * `momentOfTruth.ts` script and `momentOfTruthPostProcessing`.
 */
export type FinalResult = {
  readonly pullRequest: unknown,
  readonly repositoryUrl: unknown,
  readonly files: stringMap.MutableStringMap<File>
}

// Creates and returns path to the logging directory
export function getLogDir() {
  let logDir = path.resolve('output');
  if (!fs.existsSync(logDir)) {
      try {
          fs.mkdirSync(logDir);
      } catch (e) {
          if (e.code !== 'EEXIST') throw e;
      }
  }
  return logDir;
}
