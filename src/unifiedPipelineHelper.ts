
import { LintingResultMessage , Mutable , Issue, getFile, getLine,getDocUrl, composeLintResult} from "./momentOfTruthUtils"
import * as utils from "./utils";
import * as fs from "fs-extra";

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
}
