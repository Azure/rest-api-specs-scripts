// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as stringMap from '@ts-common/string-map'

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

export type FinalResult = {
  readonly pullRequest: unknown,
  readonly repositoryUrl: unknown,
  readonly files: stringMap.MutableStringMap<File>
}
