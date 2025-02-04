#!/usr/bin/env node
import { Command } from "commander";
import { exec as Exec } from "child_process";
import inquirer from "inquirer";
import { version } from "./version.js";

const STAGED_FILES_WARNING_THRESHOLD = 30;

const program = new Command();

interface CommitType {
  emoji: string;
  name: string;
  description: string;
}

const commitTypes: Record<string, CommitType> = {
  feat: {
    emoji: "📦",
    name: "feat",
    description: "new feature",
  },
  style: {
    emoji: "💅",
    name: "style",
    description: "layout or style change",
  },
  fix: {
    emoji: "🐛",
    name: "fix",
    description: "fix bug",
  },
  chore: {
    emoji: "🧹",
    name: "chore",
    description: "update packages, gitignore etc; (no prod code)",
  },
  doc: {
    emoji: "📖",
    name: "doc",
    description: "documentation",
  },
  refactor: {
    emoji: "🛠 ", // needs extra space
    name: "refactor",
    description: "refactoring",
  },
  content: {
    emoji: "📝",
    name: "content",
    description: "content changes",
  },
  test: {
    emoji: "✅",
    name: "test",
    description: "add/edit tests (no prod code)",
  },
  try: {
    emoji: "🤞",
    name: "try",
    description: "add untested to production",
  },
  build: {
    emoji: "🚀",
    name: "build",
    description: "build for production",
  },
};

const questions = [
  {
    type: "input",
    name: "commitMessage",
    message: "What's your commit title/message?",
    validate: function (value: string) {
      if (value !== "") {
        return true;
      }
      console.log("😕  Please enter a valid commit message.");
      return 0;
    },
    when: function () {
      // there is no commit message
      return !program.args[0] || !program.args.length;
    },
  },
  {
    type: "list",
    name: "commitType",
    message: "Select a commit type:",
    choices: Object.values(commitTypes).map(
      (type) => `${type.name} ${type.emoji}: ${type.description}`
    ),
    // when: function (answers) {
    //   return answers.comments !== "Nope, all good!";
    // },
  },
];

interface ExecResult {
  stdout: string;
  stderr: string;
}

const exec = (command: string): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    Exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

async function checkVersion() {
  try {
    const { stdout } = await exec("npm show git-emoji-commit version");
    const latestVersion = stdout.trim().toString();
    const currentVersion = version;
    // show message if user doesn't have the latest major and minor version
    if (
      latestVersion.split(".")[0] !== currentVersion.split(".")[0] ||
      latestVersion.split(".")[1] !== currentVersion.split(".")[1]
    )
      console.log(
        "\x1b[32m", // green
        `😎  Update available: ${latestVersion}`,
        "\x1b[37m", // white
        `run $ npm update -g git-emoji-commit`
      );
  } catch (err) {
    console.error("Error checking for updates:", err);
  }
}

async function getStagedFiles() {
  try {
    const { stdout } = await exec("git diff --cached --name-only");
    return stdout.trim().split("\n");
  } catch (err) {
    // @ts-ignore
    if (err.code === 1) {
      return [];
    }
    throw err;
  }
}

async function makeCommit(commitType: string, commitMessage: string) {
  const commitTypeFormated = commitType.replace(/\:(.*)/, "").replace(/"/, "");

  try {
    const { stdout, stderr } = await exec(
      `git commit -m "${commitTypeFormated}: ${commitMessage}"`
    );
    if (stdout.length > 0) console.log(`* ${stdout.toString()}`);
    if (stderr.length > 0) console.log(`# ${stderr.toString()}`);
    checkVersion();
  } catch (err) {
    if (err) {
      // @ts-ignore
      if (err.code === 128) {
        console.error(
          "Error: Committing is not possible because you have unmerged files."
        );
        console.error("Please resolve the conflicts and try again.");
      } else {
        console.error("An unknown error occurred:", err);
      }
      return;
    }
  }
}

async function confirmCommitWithNodeModules() {
  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message:
        "🤔 'node_modules/' is staged for commit. Are you sure you want to continue?",
      default: false,
    },
  ]);
  return proceed;
}

async function confirmCommitHasManyFiles(stagedFilesCount: number) {
  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: `🤔 You are committing ${stagedFilesCount} (many) files. Are you sure you want to continue?`,
      default: false,
    },
  ]);
  return proceed;
}

(async function main() {
  program
    .description("Simple CLI to encourage more concise commits.")
    .option("--learn", "learn more about commit types")
    .option("-f, --feat", "add new feature")
    .option("-s, --style", "edit/add styles")
    .option("-x, --fix", "squash bugs")
    .option("-c, --chore", "add untested to production")
    .option("-d, --doc", "add/edit documentation & content")
    .option("-r, --refactor", "refactor or rework")
    .option("-t, --test", "add/edit test")
    .option("-y, --try", "add untested to production")
    .option("-b, --build", "build for production")
    .version(version)
    .parse(process.argv);

  const options = program.opts();

  if (options.learn) {
    console.log(
      "📚 Learn more about commit types here: https://www.conventionalcommits.org/en/v1.0.0/#summary"
    );
    return;
  }

  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    console.log(
      "🤷 There are no files staged to commit. Stage some files then try again."
    );
    return;
  }

  if (stagedFiles.some((file) => file.includes("node_modules"))) {
    const shouldProceed = await confirmCommitWithNodeModules();
    if (!shouldProceed) {
      console.log("❌ Commit canceled.");
      return;
    }
  }

  if (stagedFiles.length > STAGED_FILES_WARNING_THRESHOLD) {
    const shouldProceed = await confirmCommitHasManyFiles(stagedFiles.length);
    if (!shouldProceed) {
      console.log("❌ Commit canceled.");
      return;
    }
  }

  const commitMessage = program.args[0];

  if (!commitMessage) {
    const answers = await inquirer.prompt(questions);
    const commitType = answers.commitType;
    await makeCommit(commitType, answers.commitMessage);
  } else {
    const commitType = Object.values(commitTypes).find((type) =>
      commitMessage.startsWith(`${type.emoji}  ${type.name}`)
    );

    if (!commitType) {
      const answers = await inquirer.prompt(questions);
      const selectedCommitType = answers.commitType;
      await makeCommit(selectedCommitType, commitMessage);
    } else {
      console.log("👍 Commit message looks good.");
    }
  }
})();
