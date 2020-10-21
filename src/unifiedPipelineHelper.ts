
import { LintingResultMessage , Mutable , Issue, getFile, getLine,getDocUrl, composeLintResult} from "./momentOfTruthUtils"
import * as utils from "./utils";
import * as fs from "fs-extra";
import { OadMessage } from './breaking-change';
import { crossApiVersionFilter, sameApiVersionFilter } from './breakingChangeFilter';
import * as format from "@azure/swagger-validation-common";

export class LintMsgTransformer {
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

  OadMsgToUnifiedMsg(messages:OadMessage[]) {
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
} 


export class UnifiedPipeLineStore {
  logFile = "pipe.log";
  readme: string;
  transformer: LintMsgTransformer;
  constructor(readme: string) {
    this.transformer = new LintMsgTransformer();
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
    this.appendMsg(this.transformer.OadMsgToUnifiedMsg(oadResult))
  }
}
