
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



/**
 * 
 *  - Linting on []source branch
 *   readme - tag
 *  - linting on target branch
 *   readme - tag
 */


class LintTrace {
  private traces = {
    source: new Map<string, string[]>(),
    target: new Map<string, string[]>(),
  };
  add(readmeRelatedPath: string, tag: string, before: boolean) {
    const targetMap = before ? this.traces.source : this.traces.target;

    if (targetMap.has(readmeRelatedPath)) {
      const tags = targetMap.get(readmeRelatedPath);
      if (tags) {
        tags.push(tag);
      }
    } else {
      targetMap.set(readmeRelatedPath, [tag]);
    }
  }

  genMarkDown(pr: PullRequestProperties) {
    let content = "- Lint(merge branch)";
    for (const [key, value] of this.traces.source.entries()) {
      content += "</br>";
      content += `${key}, tags:${value.join(",")}`;
      content += "</br>";
    }
    content += `- Lint (${pr.targetBranch} branch)`;
    for (const [key, value] of this.traces.source.entries()) {
      content += "</br>";
      content += `[${key
        .split("/")
        .slice(-3)
        .join("/")}](${key}), tags:${value.join(",")}`;
      content += "</br>";
    }
    return content;
  }

  save(pr: PullRequestProperties) {

  }
}


class OadTrace {
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
      content += `original:[${value.old.split("/").slice(-3).join("/")}](${utils.targetHref(value.old)
      }) <---> new:[${value.new.split("/").slice(-3).join("/")}](${utils.blobHref(value.new)})`;
      content += "</li>";
    }
    content += `</lu></li></ul>`;
    return content;
  }
  save() {
    return new UnifiedPipeLineStore("").appendMarkDown(this.genMarkDown());
  }
}

export const oadTracer = new OadTrace()