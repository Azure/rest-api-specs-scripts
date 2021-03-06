import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import { OadMessage } from './breaking-change';
import { exception } from 'console';
import { sendLabels } from "@azure/swagger-validation-common";
import { devOps } from '@azure/avocado';
import * as path from "path";

type OverrideBody = string | {from:string,to:string}[]

interface BreakingChangeRule {
  appliedTo: string;
  override?: { code?: OverrideBody , message?:OverrideBody , type?:OverrideBody};
  directive?: {addingLabels:string[]}
}

interface BreakingChangeScenario {
  Scenario: string;
  rules: BreakingChangeRule[];
}

interface RuleConfig<T> {
    load(configPath:string):boolean
    getConfig(sectionName: string): Map<string,T> | undefined
}

class LocalRuleConfig implements RuleConfig<BreakingChangeRule> {
  private AllConfig: BreakingChangeScenario[] | undefined;
  load(configPath: string): boolean {
    try {
      const config = fs.readFileSync(configPath).toString();
      this.AllConfig = yaml.safeLoad(config) as BreakingChangeScenario[];
      return !!this.AllConfig;
    } catch (e) {
      console.log(e);
      return false;
    }
  }
  getConfig(scenarioName: string): Map<string, BreakingChangeRule> | undefined {
    if (this.AllConfig) {
      try {
        const sectionConfig = new Map<string, BreakingChangeRule>();
        const rulesIndex = this.AllConfig.findIndex(
          (v) => v.Scenario === scenarioName
        );
        if (rulesIndex === -1) {
          return undefined;
        }
        const rules = this.AllConfig[rulesIndex].rules;
        for (const key in Object.keys(rules)) {
          const ruleContent = rules[key];
          const rule = ruleContent as BreakingChangeRule;

          if (!rule) {
            throw exception("invalid config");
          }
          sectionConfig.set(rule.appliedTo.toLowerCase(), rule);
        }
        return sectionConfig;
      } catch (e) {
        return undefined;
      }
    }
  }
}

const BreakingChangeLabels = new Set<string>()
interface ruleHandler {
   process(message: OadMessage,rule: BreakingChangeRule): OadMessage
}

const overrideHandler = {
  process(message: OadMessage, rule: BreakingChangeRule): OadMessage {
    let result = {...message} as any
    if (rule.override && typeof rule.override === "object") {
        for (const [key,value] of Object.entries(rule.override)) {
           if (typeof value === "string") {
               if (result[key]) {
                 result[key] = value;
               }
           }
           else if (value) {
             for ( const pair of value) {
                if ((result[key] as string).toLowerCase() === pair.from.toLowerCase()) {
                    result[key] = pair.to
                    break
                }
             }
           }
        }
    }
    return result
  },
};


const directiveHandler = {
  process(message: OadMessage, rule: BreakingChangeRule): OadMessage {
    if (rule.directive && rule.directive.addingLabels && message.type.toLowerCase() === "error") {
      for (const label of rule.directive.addingLabels){
        BreakingChangeLabels.add(label)
      } 
    }
    return message
  }
};

class OadMessageEngine {
  private config: LocalRuleConfig;
  private HandlersMap = new Map<string, ruleHandler>();
  private scenario = "default";
  constructor(config: LocalRuleConfig) {
    this.config = config;
    this.initHandlerMap();
  }
  initHandlerMap() {
    this.HandlersMap.set("override", overrideHandler);
    this.HandlersMap.set("directive", directiveHandler);
  }
  public setScenario(scenarioName: string) {
    this.scenario = scenarioName;
    return this
  }
  getRulesMap() {
    return this.config.getConfig(this.scenario);
  }
  handle(messages: OadMessage[]): OadMessage[] {
    const ruleMap = this.getRulesMap();
    if (!ruleMap) {
        return messages
    }
    console.log("---- begin breaking change filter ----")
    const result: OadMessage[] = [];
    for (const message of messages) {
      const ruleId = message.id.toLowerCase();
      const ruleCode = message.code.toLowerCase();
      if (ruleMap && (ruleMap.has(ruleId) || ruleMap.has(ruleCode))) {
        const rule = ruleMap.get(ruleId) || ruleMap.get(ruleCode);
        let postMessage : OadMessage | undefined = message
        for (const [key,handler] of this.HandlersMap.entries()) {
          if (rule && Object.keys(rule).includes(key) && postMessage) {
            postMessage = handler.process(postMessage, rule);
          }
        }
        if (postMessage) {
          result.push(postMessage)
        }
      }
      else {
        result.push(message);
      }
    }
    console.log("----- end breaking change filter ----");
    console.log(result)
    return result;
  }
}

class BreakingChangeRuleManager {
    private getBreakingChangeConfigPath(){
    let breakingChangeRulesConfigPath = "config/BreakingChangeRules.yml";
    if (process.env.BREAKING_CHANGE_RULE_CONFIG_PATH) {
      breakingChangeRulesConfigPath =
        process.env.BREAKING_CHANGE_RULE_CONFIG_PATH;
    }
    return breakingChangeRulesConfigPath
  }

  private buildRuleConfig() {
    const configPath = this.getBreakingChangeConfigPath()
    if (!fs.existsSync(configPath)) {
      console.log(`Config file:${configPath} was not existing.`);
      return undefined;
    }
    const config = new LocalRuleConfig();
    if (!config.load(configPath)) {
      throw exception(`unable to load config file:${configPath}`);
    }
    return config;
  }

  public handleCrossApiVersion(messages: OadMessage[]) {
    const ruleConfig = this.buildRuleConfig();
    if (!ruleConfig) {
      return messages;
    }
    return new OadMessageEngine(ruleConfig)
      .setScenario("CrossVersion")
      .handle(messages);
  }

  public handleSameApiVersion (messages: OadMessage[]) {
    const ruleConfig = this.buildRuleConfig();
    if (!ruleConfig) {
      return messages;
    }
    return new OadMessageEngine(ruleConfig)
      .setScenario("SameVersion")
      .handle(messages);
  };

  public addBreakingChangeLabels() {
    sendLabels([...BreakingChangeLabels.values()]);
  };
}

export const ruleManager = new BreakingChangeRuleManager()