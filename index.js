#!/usr/bin/env node

const fs = require("fs");
const process = require("process");

const { Octokit } = require("@octokit/rest");
const globrex = require("globrex");
const Diff = require("diff");

const HttpsProxyAgent = require("https-proxy-agent");

const defaultSizes = {
  0: "size/XS",
  10: "size/S",
  30: "size/M",
  100: "size/L",
  500: "size/XL",
  1000: "size/XXL"
};

const actions = ["opened", "synchronize", "reopened"];

const globrexOptions = { extended: true, globstar: true };

async function main() {
  debug("Running size-label-action-with-proxy-support...");

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    throw new Error("Environment variable GITHUB_TOKEN not set!");
  }

  const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH;
  if (!GITHUB_EVENT_PATH) {
    throw new Error("Environment variable GITHUB_EVENT_PATH not set!");
  }

  const eventDataStr = await readFile(GITHUB_EVENT_PATH);
  const eventData = JSON.parse(eventDataStr);

  if (!eventData || !eventData.pull_request || !eventData.pull_request.base) {
    throw new Error(`Invalid GITHUB_EVENT_PATH contents: ${eventDataStr}`);
  }

  debug("Event payload:", eventDataStr);

  if (!actions.includes(eventData.action)) {
    console.log("Action will be ignored:", eventData.action);
    return false;
  }

  const isIgnored = parseIgnored(process.env.IGNORED);

  const pullRequestHome = {
    owner: eventData.pull_request.base.repo.owner.login,
    repo: eventData.pull_request.base.repo.name
  };

  const pull_number = eventData.pull_request.number;

  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
  const octokit = new Octokit({
    auth: `token ${GITHUB_TOKEN}`,
    userAgent: "casr-anz/size-label-action-with-proxy-support",
    ...(proxyUrl !== undefined) && {request: { agent: new HttpsProxyAgent(proxyUrl) }},
  });

  const pullRequestDiff = await octokit.pulls.get({
    ...pullRequestHome,
    pull_number,
    headers: {
      accept: "application/vnd.github.v3.diff"
    }
  });

  const changedLines = getChangedLines(isIgnored, pullRequestDiff.data);
  console.log("Changed lines:", changedLines);

  const sizes = getSizesInput();
  const validSizeLabels = Object.values(sizes);
  const sizeLabel = getSizeLabel(changedLines, sizes);
  console.log("Matching label:", sizeLabel);

  const { add, remove } = getLabelChanges(
    sizeLabel,
    validSizeLabels,
    eventData.pull_request.labels
  );

  if (add.length === 0 && remove.length === 0) {
    console.log("Correct label already assigned");
    return false;
  }

  if (add.length > 0) {
    console.log("Adding labels:", add);
    await octokit.issues.addLabels({
      ...pullRequestHome,
      issue_number: pull_number,
      labels: add
    });
  }

  for (const label of remove) {
    console.log("Removing label:", label);
    try {
      await octokit.issues.removeLabel({
        ...pullRequestHome,
        issue_number: pull_number,
        name: label
      });
    } catch (error) {
      debug("Ignoring removing label error:", error);
    }
  }

  debug("Success!");

  return true;
}

function debug(...str) {
  if (process.env.DEBUG_ACTION) {
    console.log.apply(console, str);
  }
}

function parseIgnored(str = "") {
  const ignored = str
    .split(/\r|\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("#"))
    .map(s =>
      s.length > 1 && s[0] === "!"
        ? { not: globrex(s.substr(1), globrexOptions) }
        : globrex(s, globrexOptions)
    );
  function isIgnored(path) {
    if (path == null || path === "/dev/null") {
      return true;
    }
    const pathname = path.substr(2);
    let ignore = false;
    for (const entry of ignored) {
      if (entry.not) {
        if (pathname.match(entry.not.regex)) {
          return false;
        }
      } else if (!ignore && pathname.match(entry.regex)) {
        ignore = true;
      }
    }
    return ignore;
  }
  return isIgnored;
}

async function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, { encoding: "utf8" }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

function getChangedLines(isIgnored, diff) {
  return Diff.parsePatch(diff)
    .flatMap(file =>
      isIgnored(file.oldFileName) && isIgnored(file.newFileName)
        ? []
        : file.hunks
    )
    .flatMap(hunk => hunk.lines)
    .filter(line => line[0] === "+" || line[0] === "-").length;
}

function getSizeLabel(changedLines, sizes = defaultSizes) {
  let label = null;
  for (const lines of Object.keys(sizes).sort((a, b) => a - b)) {
    if (changedLines >= lines) {
      label = `${sizes[lines]}`;
    }
  }
  return label;
}

function getLabelChanges(newSizeLabel, validSizeLabels, existingLabels) {
  const add = [newSizeLabel];
  const remove = [];
  for (const existingLabel of existingLabels) {
    const { name } = existingLabel;
    if (name === newSizeLabel) {
      add.pop();
    } else if (validSizeLabels.includes(name)) {
      remove.push(name);
    }
  }
  return { add, remove };
}

function getSizesInput() {
  let inputSizes = process.env.INPUT_SIZES;
  if (inputSizes && inputSizes.length) {
    return JSON.parse(inputSizes);
  } else {
    return undefined;
  }
}

if (require.main === module) {
  main().then(
    () => (process.exitCode = 0),
    e => {
      process.exitCode = 1;
      console.error(e);
    }
  );
}

module.exports = { main };
