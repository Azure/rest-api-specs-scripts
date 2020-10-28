
import { LintingResultMessage , Mutable , Issue, getFile, getLine,getDocUrl, composeLintResult} from "./momentOfTruthUtils"
import * as utils from "./utils";
import * as fs from "fs-extra";
import { OadMessage } from './breaking-change';
import * as format from "@azure/swagger-validation-common";
import { devOps } from '@azure/avocado';
import { PullRequestProperties } from '@azure/avocado/dist/dev-ops';
const packageJson = require("../package.json");

export class MsgTransformer {
  constructor() {}

  lintMsgToUnifiedMsg(msg: LintingResultMessage[]) {
    const result = msg.map((it) => {
      const violation = (it as unknown) as Mutable<Issue>;
      if (!violation.filePath) {
        violation.filePath = getFile(violation.jsonref) || "";
      }
      if (!violation.lineNumber) {
        violation.lineNumber = getLine(violation.jsonref) || 1;
      }
      return {
        type: "Result",
        ...composeLintResult(violation),
      };
    });
    return JSON.stringify(result);
  }

  OadMsgToUnifiedMsg(messages: OadMessage[]) {
    const pipelineResultData: format.ResultMessageRecord[] = messages.map(
      (it) => ({
        type: "Result",
        level: it.type as format.MessageLevel,
        message: it.message,
        code: it.code,
        id: it.id,
        docUrl: it.docUrl,
        time: new Date(),
        extra: {
          mode: it.mode,
        },
        paths: [
          {
            tag: "New",
            path: utils.blobHref(
              utils.getGithubStyleFilePath(
                utils.getRelativeSwaggerPathToRepo(it.new.location || "")
              )
            ),
          },
          {
            tag: "Old",
            path: utils.targetHref(
              utils.getGithubStyleFilePath(
                utils.getRelativeSwaggerPathToRepo(it.old.location || "")
              )
            ),
          },
        ],
      })
    );
    return JSON.stringify(pipelineResultData);
  }

  rawErrorToUnifiedMsg(
    errType: string,
    errorMsg: string,
    config: string,
    levelType = "Error"
  ) {
    const result = {
      type: "Raw",
      level: levelType,
      message: errType,
      time: new Date(),
      extra: {
        new: utils.targetHref(utils.getRelativeSwaggerPathToRepo(config)),
        details: errorMsg,
      },
    };
    return JSON.stringify(result);
  }

  toMarkDownMsg(
    errorMsg: string,
    levelType = "Error"
  ) {
    const result = {
      type: "Markdown",
      mode:"append",
      level: levelType,
      message: errorMsg,
      time: new Date(),
    } as format.MarkdownMessageRecord;
    return JSON.stringify(result);
  }
} 


export class UnifiedPipeLineStore {
  logFile = "pipe.log";
  readme: string;
  transformer: MsgTransformer;
  constructor(readme: string) {
    this.transformer = new MsgTransformer();
    this.readme = readme;
  }

  private appendMsg(msg: string) {
    fs.appendFileSync(this.logFile, msg);
    fs.appendFileSync(this.logFile, "\n");
    console.log("appendMsg:" + msg);
  }

  public appendLintMsg(msg: LintingResultMessage[]) {
    this.appendMsg(this.transformer.lintMsgToUnifiedMsg(msg));
  }

  public appendAutoRestErr(msg: string) {
    this.appendMsg(
      this.transformer.rawErrorToUnifiedMsg(
        "AutoRest exception",
        msg,
        this.readme
      )
    );
  }

  public appendRunTimeErr(msg: string) {
    this.appendMsg(
      this.transformer.rawErrorToUnifiedMsg(
        "Runtime exception",
        msg,
        this.readme
      )
    );
  }

  public appendReadmeErr(msg: string) {
    this.appendMsg(
      this.transformer.rawErrorToUnifiedMsg(
        "Readme exception",
        msg,
        this.readme
      )
    );
  }

  public appendConfigViolation(msg: string, errType: string) {
    this.appendMsg(
      this.transformer.rawErrorToUnifiedMsg(
        errType,
        msg,
        this.readme,
        "Warning"
      )
    );
  }

  public appendOadViolation(oadResult: OadMessage[]) {
    this.appendMsg(this.transformer.OadMsgToUnifiedMsg(oadResult));
  }

  public appendMarkDown(markDown: string) {
    this.appendMsg(this.transformer.toMarkDownMsg(markDown));
  }
}


class AbstractToolTrace {
  genMarkDown() {
    return ""
  }
  save() {
    return new UnifiedPipeLineStore("").appendMarkDown(this.genMarkDown());
  }
}


// record lint invoking trace
class LintTrace extends AbstractToolTrace {
  private traces = {
    source: new Map<string, string[]>(),
    target: new Map<string, string[]>(),
  };

  // isFromTargetBranch indicates whether it's from target branch
  add(readmeRelatedPath: string, tag: string, isFromTargetBranch: boolean) {
    const targetMap = isFromTargetBranch
      ? this.traces.target
      : this.traces.source;

    if (targetMap.has(readmeRelatedPath)) {
      const tags = targetMap.get(readmeRelatedPath);
      if (tags) {
        tags.push(tag);
      }
    } else {
      targetMap.set(readmeRelatedPath, [tag]);
    }
  }

  genMarkDown() {
    const classicLintVersion = process.env["CLASSIC_LINT_VERSION"]
      ? process.env["CLASSIC_LINT_VERSION"]
      : "1.0.14";
    const lintVersion = process.env["LINT_VERSION"]
      ? process.env["LINT_VERSION"]
      : "1.0.4";
    let content = "<ul>";
    for (const [beforeAfter, readmeTags] of Object.entries(this.traces)) {
      content += `<li>`;
      content += `Linted configuring files (Based on ${
        beforeAfter === "source" ? "source" : "target"
      } branch, openapi-validator <a href="https://www.npmjs.com/package/@microsoft.azure/openapi-validator/v/${lintVersion}" target="_blank"> v${lintVersion} </a>, classic-openapi-validator <a href="https://www.npmjs.com/package/@microsoft.azure/classic-openapi-validator/v/${classicLintVersion}" target="_blank"> v${classicLintVersion} </a>)`;
      content += `<ul> `;
      for (const [readme, tags] of readmeTags.entries()) {
        const url =
          beforeAfter === "target"
            ? utils.targetHref(readme)
            : utils.blobHref(readme);
        const showReadme = readme
          .split(/[/|\\]/)
          .slice(-3)
          .join("/");
        for (const tag of tags) {
          content += "<li>";
          content += `<a href="${url}"target="_blank">${showReadme}</a> tag:<a href="${url}${
            tag ? "#tag-" : ""
          }${tag}" target="_blank">${tag ? tag : "default"}</a>`;
          content += "</li>";
        }
      }
      content += `</ul></li>`;
    }
    content += "</ul>";
    return content;
  }
}

// record oad invoking trace
class OadTrace extends AbstractToolTrace {
  private traces: { old: string; new: string }[] = [];
  add(oldSwagger: string, newSwagger: string) {
    this.traces.push({ old: oldSwagger, new: newSwagger });
    return this;
  }

  genMarkDown() {
    const oadVersion = packageJson.dependencies["@azure/oad"].replace(
      /[\^~]/,
      ""
    );
    let content = `<ul><li>Compared Swaggers (Based on Oad <a href="https://www.npmjs.com/package/@azure/oad/v/${oadVersion}" target="_blank">v${oadVersion}</a>)<ul>`;
    for (const value of this.traces.values()) {
      content += "<li>";
      content += `original: <a href="${utils.targetHref(
        value.old
      )}" target="_blank">${value.old
        .split("/")
        .slice(-3)
        .join("/")} </a> <---> new: <a href="${utils.blobHref(
        value.new
      )} " target="_blank"> ${value.new.split("/").slice(-3).join("/")} </a>`;
      content += "</li>";
    }
    content += `</ul></li></ul>`;
    return content;
  }
 
}

export const oadTracer = new OadTrace();
export const lintTracer = new LintTrace();