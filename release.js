#!/usr/bin/env node

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { input } from '@inquirer/prompts';

function exitWithError(msg) {
  console.error(`\x1b[31merror：${msg}\x1b[0m`);
  process.exit(1);
}

function logStep(msg) {
  console.log(`\x1b[36m${msg}\x1b[0m`);
}

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

// 版本号自增，默认增加 patch 版本，如 1.2.3 -> 1.2.4
function incrementVersion(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const patch = parseInt(parts[2], 10);
  if (isNaN(patch)) {
    return null;
  }
  parts[2] = (patch + 1).toString();
  return parts.join('.');
}

// 比较版本号大小，返回 -1 表示 v1 < v2，0 表示相等，1 表示 v1 > v2
function compareVersions(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) {
      return 1;
    }
    if (p1[i] < p2[i]) {
      return -1;
    }
  }
  return 0;
}

async function main() {
  try {
    const gitStatus = execSync('git status --porcelain', {
      encoding: 'utf-8',
    }).trim();
    if (gitStatus) {
      exitWithError('工作区存在未提交修改，请提交或暂存后再发布');
    }

    logStep('读取 package.json 中的版本号...');
    const pkgRaw = readFileSync('package.json', 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    const currentVersion = pkg.version;
    if (!currentVersion) {
      exitWithError('package.json 中没有找到 version 字段');
    }

    const defaultVersion = incrementVersion(currentVersion);
    if (!defaultVersion) {
      exitWithError(`无法解析当前版本号：${currentVersion}`);
    }

    logStep(`当前版本号：${currentVersion}`);
    logStep(`默认新版本号：${defaultVersion}`);

    // 交互输入新版本号，支持默认值、格式校验和版本号大小校验
    const newVersion = await input({
      message: '请输入新的版本号：',
      default: defaultVersion,
      required: true,
      pattern: /^\d+\.\d+\.\d+$/,
      patternError: '版本号格式应为 x.y.z',
      prefill: 'editable',
      validate(value) {
        if (!/^\d+\.\d+\.\d+$/.test(value)) {
          return '版本号格式应为 x.y.z';
        }
        if (compareVersions(value, currentVersion) <= 0) {
          return `新版本号必须高于当前版本号 ${currentVersion}`;
        }
        return true;
      },
    });

    logStep(`设置新版本号为：${newVersion}`);

    // 同步更新 package.json 和 package-lock.json 中的版本号
    logStep('开始更新版本号...');
    run(`npm version ${newVersion} --no-git-tag-version`);

    // 执行构建脚本
    logStep('开始执行 npm run build ...');
    run('npm run build');

    // 在提交前验证实际发布包内容
    logStep('开始检查 npm 发布包内容...');
    run('npm pack --dry-run');

    // 只提交版本文件，避免把无关本地内容带入发布提交
    logStep('开始提交版本文件...');
    run('git add package.json package-lock.json');
    run(`git commit -m "${newVersion}版本发布"`);

    // 先确保对应源码已推送，再公开 npm 包
    logStep('开始推送代码到远程仓库...');
    run('git push');

    logStep('开始执行 npm publish ...');
    run('npm publish');

    logStep('发布流程完成！');
  } catch (err) {
    exitWithError(err.message || err);
  }
}

main();
