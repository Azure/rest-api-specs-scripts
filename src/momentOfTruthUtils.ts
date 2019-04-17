// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as stringMap from '@ts-common/string-map'

export type FinalResult = {
  readonly pullRequest: unknown,
  readonly repositoryUrl: unknown,
  readonly files: stringMap.MutableStringMap<stringMap.MutableStringMap<unknown>>
}