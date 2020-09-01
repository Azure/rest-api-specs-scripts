
import * as lintPost from './momentOfTruthPostProcessing'
import * as lintFuncs from "./momentOfTruth";
import { exec, execSync } from 'child_process';
import { fstat, existsSync } from 'fs';
import { exception } from 'console';

const args = process.argv.slice(2);

const repoDir = './SpecLocalRepo'

function checkout() {
  if (!args || args.length < 1) {
      throw exception("invalid args")
  }
  const pr = args[0]

  let repoUrl = "git@github.com:Azure/azure-rest-api-specs.git";
  process.env.TRAVIS_REPO_SLUG = "azure-rest-api-specs";
  if (args[1] == "pr") {
    repoUrl = "git@github.com:Azure/azure-rest-api-specs-pr.git";
     process.env.TRAVIS_REPO_SLUG = "azure-rest-api-specs-pr";
  }
  const repoPath = `specs_${pr}`;
  if (!existsSync(repoPath)) {
    let cmd = `git clone ${repoUrl} ${repoPath}`;
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });
    process.chdir(repoPath)
    cmd = `git fetch origin +refs/pull/${pr}/merge:refs/remotes/pull/${pr}/merge `;
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });
    cmd = `git checkout pull/${pr}/merge`;
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });
    cmd = `git branch --delete master`;
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });
   
  }
  else {
    let cmd = `git branch --delete master`;
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });
    //source-b6791c5f-e0a5-49b1-9175-d7fd3e341cb8
    cmd = `git branch --delete source-b6791c5f-e0a5-49b1-9175-d7fd3e341cb8`;
    execSync(cmd, { encoding: "utf8", stdio: "inherit" });
  }
  
  process.env.SYSTEM_PULLREQUEST_TARGETBRANCH = args[2] ? args[2] : "master";
  process.env.TRAVIS_PULL_REQUEST = `${pr}`

}

async function main() {
    checkout()
    await lintFuncs.runScript()
    await lintPost.postProcessing()
}

main()