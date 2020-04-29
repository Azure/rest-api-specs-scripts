import * as path from "path";
import * as pfs from "@ts-common/fs";
import { git, cli, devOps, avocado } from "@azure/avocado";
import { fstat } from 'fs';

export const create = async (rootName: string, repoName: string) => {
  const tmpRoot = path.resolve(path.join("..", rootName));
  if (!(await pfs.exists(tmpRoot))) {
    await pfs.mkdir(tmpRoot);
  }
  const tmp = path.join(tmpRoot, repoName);

  cleanUp(rootName, repoName)
  await pfs.mkdir(tmp);
  return tmp;
};

export const cleanUp = async (rootName: string, repoName: string) => {
  const tmpRoot = path.resolve(path.join("..", rootName));
  const tmp = path.join(tmpRoot, repoName);
  try {
    if(await pfs.exists(tmpRoot)){
      await pfs.recursiveRmdir(tmp);
    }
  } catch (error) {
    //Force rm and ignore rm non-existing file error.
  }
}

export const createDevOpsEnv = async (rootName: string, repoName: string): Promise<cli.Config> => {
  const tmp = await create(rootName, repoName);

  // Create '"${tmp}/remote"' folder.
  const remote = path.join(tmp, "remote");
  await pfs.mkdir(remote, { recursive :true});

  const gitRemote = git.repository(remote);

  // create a Git repository
  await gitRemote({ init: [] });
  await gitRemote({ config: ["user.email", "test@example.com"] });
  await gitRemote({ config: ["user.name", "test"] });

  // commit invalid 'specification/readme.md' to 'master'.
  const specification = path.join(remote, "specification");
  await pfs.mkdir(specification);
  await pfs.writeFile(path.join(specification, "readme.md"), "");
  await pfs.writeFile(
    path.join(specification, "file1.json"),
    `
      {
        "a": "foo",
        "b": [
          "bar1",
          "bar2",
          "bar3"
        ]
      }
      `
  );

  await pfs.writeFile(
    path.join(specification, "file2.json"),
    `
      {
        "a": "foo"
      }
      `
  );

  await pfs.writeFile(
    path.join(specification, "file3.json"),
    `
      {
        "a": "foo"
      }
      `
  );

  await pfs.writeFile(path.join(remote, "license"), "");
  await gitRemote({ add: ["."] });
  await gitRemote({ commit: ["-m", '"initial commit"', "--no-gpg-sign"] });

  // commit removing 'specification/readme.md' to 'source'.
  await gitRemote({ checkout: ["-b", "source"] });
  await pfs.unlink(path.join(specification, "readme.md"));
  await pfs.writeFile(
    path.join(specification, "file1.json"),
    `
      {
        "a": "foo",
        "b": ["bar1","bar2","bar3"]
      }
      `
  );

  await pfs.writeFile(
    path.join(specification, "file2.json"),
    `
      {
        "a": "foo",
        "b": "bar"
      }
      `
  );

  // file with invalid JSON
  await pfs.writeFile(path.join(specification, "file3.json"), `random string`);

  // json file that did not exist
  await pfs.writeFile(path.join(specification, "file4.json"), `{"foo":"bar"}`);

  await pfs.writeFile(path.join(remote, "textfile.txt"), "");
  await pfs.writeFile(path.join(remote, "license"), "MIT");
  await gitRemote({ add: ["."] });
  await gitRemote({
    commit: ["-m", '"second commit"', "--no-gpg-sign"]
  });

  // create local Git repository
  const local = path.join(tmp, "local");
  await pfs.mkdir(local);
  const gitLocal = git.repository(local);
  await gitLocal({ clone: ["../remote", "."] });

  return {
    cwd: local,
    env: {
      SYSTEM_PULLREQUEST_TARGETBRANCH: "master"
    }
  };
};

export async function cleanUpDir(dir:string) {
  if (await pfs.exists(dir)) {
    await pfs.recursiveRmdir(dir);
  }
}