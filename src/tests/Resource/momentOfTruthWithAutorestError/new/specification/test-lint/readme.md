# Services

> see https://aka.ms/autorest

This is the AutoRest configuration file.

---
## Getting Started

To build the SDK for Services, simply [Install AutoRest](https://aka.ms/autorest/install) and in this folder, run:

> `autorest`

To see additional help and options, run:

> `autorest --help`
---

## Configuration

### Basic Information

These are the global settings

``` yaml
openapi-type: arm
tag: package-2017-04
```

### Tag: package-2017-04

These settings apply only when `--tag=package-2017-04` is specified on the command line.

``` yaml $(tag) == 'package-2017-04'
input-file:
- test/test-lint-a.json
- test/test-lint-b.json
```
