import * as fs from "fs-extra";
import * as util from "./utils"
import * as YAML from "js-yaml";
import {
  getInputFilesForTag,
} from "@azure/openapi-markdown";

import { MarkDownEx, parse } from "@ts-common/commonmark-to-markdown";

export function getVersionFromInputFile(filePath: string): string {
  const apiVersionRegex = /^\d{4}-\d{2}-\d{2}(|-preview)$/;
  const segments = filePath.split("/").slice(0,-1)
  if (segments && segments.length > 1) {
     for (const s of segments){
      if (apiVersionRegex.test(s)) {
        return s
      }
    }
  }
  return ""
}

export class ReadmeParser {
  readmeFile: string;
  markDownContent: string;
  constructor(readmePath: string) {
    this.readmeFile = readmePath;
    this.markDownContent = fs.readFileSync(this.readmeFile, "utf8");
  }

  public getGlobalConfigByName(Name: string) {
    let rawMarkdown = this.markDownContent;
    for (const codeBlock of util.parseCodeblocks(rawMarkdown)) {
      if (
        !codeBlock.info ||
        codeBlock.info.trim().toLocaleLowerCase() !== "yaml" ||
        !codeBlock.literal
      ) {
        continue;
      }
      try {
        const configs = YAML.safeLoad(codeBlock.literal) as any;
        if (configs && configs[Name]) {
          return configs[Name];
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
}
