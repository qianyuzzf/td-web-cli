#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { input } from "@inquirer/prompts";

function exitWithError(msg) {
  console.error(`\x1b[31mError: ${msg}\x1b[0m`);
  process.exit(1);
}

function logStep(msg) {
  console.log(`\x1b[36m${msg}\x1b[0m`);
}

// 版本号自增，默认增加 patch 版本，如 1.2.3 -> 1.2.4
function incrementVersion(version) {
  const parts = version.split(".");
  if (parts.length !== 3) return null;
  const patch = parseInt(parts[2], 10);
  if (isNaN(patch)) return null;
  parts[2] = (patch + 1).toString();
  return parts.join(".");
}

// 比较版本号大小，返回 -1 表示 v1 < v2，0 表示相等，1 表示 v1 > v2
function compareVersions(v1, v2) {
  const p1 = v1.split(".").map(Number);
  const p2 = v2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) return 1;
    if (p1[i] < p2[i]) return -1;
  }
  return 0;
}

async function main() {
  try {
    logStep("读取 package.json 中的版本号...");
    const pkgRaw = readFileSync("package.json", "utf-8");
    const pkg = JSON.parse(pkgRaw);
    const currentVersion = pkg.version;
    if (!currentVersion) exitWithError("package.json 中没有找到 version 字段");

    const defaultVersion = incrementVersion(currentVersion);
    if (!defaultVersion) exitWithError(`无法解析当前版本号: ${currentVersion}`);

    logStep(`当前版本号: ${currentVersion}`);
    logStep(`默认新版本号: ${defaultVersion}`);

    // 交互输入新版本号，支持默认值、格式校验和版本号大小校验
    const newVersion = await input({
      message: "请输入新的版本号",
      default: defaultVersion,
      required: true,
      pattern: /^\d+\.\d+\.\d+$/,
      patternError: "版本号格式应为 x.y.z",
      prefill: "editable",
      validate(value) {
        if (!/^\d+\.\d+\.\d+$/.test(value)) {
          return "版本号格式应为 x.y.z";
        }
        if (compareVersions(value, currentVersion) === -1) {
          return `新版本号不能低于当前版本号 ${currentVersion}`;
        }
        return true;
      },
    });

    logStep(`设置新版本号为: ${newVersion}`);

    // 更新 package.json 中的版本号
    pkg.version = newVersion;

    // 判断原文件末尾是否有换行符，写回时保持一致
    const endsWithNewline = pkgRaw.endsWith("\n");
    const newPkgContent = JSON.stringify(pkg, null, 2) + (endsWithNewline ? "\n" : "");
    writeFileSync("package.json", newPkgContent, "utf-8");
    logStep("package.json 版本号已更新");

    // 安装依赖
    logStep("开始执行 npm install ...");
    execSync("npm install", { stdio: "inherit" });

    // 执行构建脚本
    logStep("开始执行 npm run build ...");
    execSync("npm run build", { stdio: "inherit" });

    // 发布到 npm
    logStep("开始执行 npm publish ...");
    execSync("npm publish", { stdio: "inherit" });

    // 提交代码到 git 仓库
    logStep("开始提交代码到 git 仓库...");
    execSync("git add .", { stdio: "inherit" });
    execSync(`git commit -m "${newVersion}版本发布"`, { stdio: "inherit" });

    logStep("发布流程完成！");
  } catch (err) {
    exitWithError(err.message || err);
  }
}

main();
