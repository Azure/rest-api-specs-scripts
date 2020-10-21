import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import { OadMessage } from './breaking-change';
import { exception } from 'console';

interface BreakingChangeRule {
  id: string;
  name: string;
  severity?: { original: string; new: string };
  comments?: string;
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
  load(configPath: string) :boolean{
      try {
         const config = fs.readFileSync(configPath).toString();
         this.AllConfig = yaml.safeLoad(config) as BreakingChangeScenario[];
         return !!this.AllConfig
      }
      catch(e) {
          console.log(e)
          return false
      }
  }
  getConfig(sectionName: string): Map<string, BreakingChangeRule> | undefined {
    if (this.AllConfig ) {
      try {
        const sectionConfig = new Map<string, BreakingChangeRule>();
        const rulesIndex = this.AllConfig.findIndex(v => v.Scenario === sectionName);
        if (rulesIndex === -1) {
           return undefined
        }
        const rules = this.AllConfig[rulesIndex].rules
        for (const key in Object.keys(rules)) {
          const ruleContent = rules[key];
          const rule = ruleContent as BreakingChangeRule;

          if (!rule) {
            throw exception("invalid config")
          }
          sectionConfig.set(rule.id.toLowerCase(), rule);
        }
        return sectionConfig;
      } catch (e) {
        return undefined;
      }
    }
  }
}

interface ruleHandler {
   process(message: OadMessage,rule: BreakingChangeRule): OadMessage
}

const severityHandler = {
  process(message: OadMessage, rule: BreakingChangeRule): OadMessage {
    if (
      rule.severity &&
      rule.severity.new &&
      rule.severity.original &&
      rule.severity.original
        .toLowerCase()
        .indexOf(message.type.toLowerCase()) !== -1
    )
      return {
        ...message,
        type: rule.severity.new as string,
      };
    else {
      return message;
    }
  },
};

const commentsHandler = {
    process(message: OadMessage, rule: BreakingChangeRule): OadMessage {
        if (rule.comments) {
            return {...message, comments:rule.comments}
        }
        else {
            return message
        }
    }
}

class BreakingChangeFilter {
  private config: LocalRuleConfig;
  private HandlersMap = new Map<string, ruleHandler>();
  private section = "default";
  constructor(config: LocalRuleConfig) {
    this.config = config;
    this.initHandlerMap();
  }
  initHandlerMap() {
    this.HandlersMap.set("severity", severityHandler);
    this.HandlersMap.set("comments", commentsHandler);
  }
  public setSection(sectionName: string) {
    this.section = sectionName;
    return this
  }
  getRulesMap() {
    return this.config.getConfig(this.section);
  }
  filter(messages: OadMessage[]): OadMessage[] {
    const ruleMap = this.getRulesMap();
    if (!ruleMap) {
        return messages
    }
    console.log("begin breaking change filter")
    const result: OadMessage[] = [];
    for (const message of messages) {
      const ruleId = message.id.toLowerCase();
      if (ruleMap && ruleMap.has(ruleId)) {
        const rule = ruleMap.get(ruleId);
        let postMessage : OadMessage | undefined = message
        for (const key of this.HandlersMap.keys()) {
          if (rule && Object.keys(rule).includes(key) && postMessage) {
            postMessage = this.HandlersMap.get(key)?.process(postMessage, rule);
          }
        }
        if (postMessage) {
            result.push(postMessage);
        }
      }
    }
    console.log(result)
    return result;
  }
}

function buildRuleConfig(configPath:string) {
     if (!fs.existsSync(configPath)) {
       console.log(`Config file:${configPath} was not existing.`);
       return undefined
     }
     const config = new LocalRuleConfig();
     if (!config.load(configPath)) {
       throw exception(`unable to load config file:${configPath}`);
     }
     return config;
}

export const crossApiVersionFilter = function (
  configPath: string,
  messages: OadMessage[]
) {
  const ruleConfig = buildRuleConfig(configPath) 
  if (!ruleConfig) {
      return messages
  }
    return new BreakingChangeFilter(ruleConfig)
      .setSection("CrossVersion")
      .filter(messages);
};

export const sameApiVersionFilter = function (
  configPath: string,
  messages: OadMessage[]
) {
 const ruleConfig = buildRuleConfig(configPath);
 if (!ruleConfig) {
   return messages;
 }

  return new BreakingChangeFilter(ruleConfig)
    .setSection("SameVersion")
    .filter(messages);
};



