import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { input, select, Separator } from '@inquirer/prompts';
import {
  logger,
  loggerError,
  normalizeGitBashPath,
  readJsonFile,
  writeJsonFile,
  getJsonFilesInLangDir,
  validatePathInput,
} from '../../../utils/index.js';

/** 键冲突处理方式 */
type ConflictStrategy = 'overwrite' | 'manual';

/** 获取目录下的一级子文件夹名称 */
function getSubDirectories(dirPath: string): string[] {
  return fs
    .readdirSync(dirPath)
    .filter((name) => fs.statSync(path.join(dirPath, name)).isDirectory());
}

/** 校验 JSON 文件路径输入 */
function validateJsonFileInput(value: string): true | string {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
  if (!cleaned) return '路径不能为空';

  const normalized = normalizeGitBashPath(cleaned);
  if (!fs.existsSync(normalized)) return '文件不存在，请输入有效路径';
  if (!fs.statSync(normalized).isFile()) return '请输入 JSON 文件路径';
  if (!normalized.endsWith('.json')) return '请输入 .json 文件路径';

  return true;
}

/**
 * 从 JSON 文件中提取待插入的 key 列表
 * 支持对象（取顶层 key）或字符串数组两种格式
 */
function extractKeysFromJsonFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`JSON 文件解析失败: ${filePath}`);
  }

  if (Array.isArray(parsed)) {
    const keys = parsed
      .filter((item): item is string => typeof item === 'string')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
    return [...new Set(keys)];
  }

  if (parsed && typeof parsed === 'object') {
    return Object.keys(parsed as Record<string, unknown>);
  }

  throw new Error('JSON 文件格式无效，需为对象或字符串数组');
}

/**
 * 将指定 keys 从插入对象合并到被插入对象
 */
async function insertKeysIntoObject(
  baseObj: Record<string, any>,
  insertObj: Record<string, any>,
  keys: string[],
  strategy: ConflictStrategy
): Promise<Record<string, any>> {
  for (const key of keys) {
    if (!(key in insertObj)) {
      logger.warn(`键 "${key}" 在插入文件中不存在，已跳过`, true);
      continue;
    }

    const insertVal = insertObj[key];

    if (!(key in baseObj)) {
      baseObj[key] = insertVal;
      logger.info(`新增键: ${key}`, true);
      continue;
    }

    if (baseObj[key] === insertVal) {
      logger.info(`键 "${key}" 值相同，已跳过`, true);
      continue;
    }

    logger.info(`键 "${key}" 已存在且值不同`, true);

    if (strategy === 'overwrite') {
      baseObj[key] = insertVal;
      logger.info(`已用插入值覆盖键 "${key}"`, true);
      continue;
    }

    const choice = await select({
      message: `请选择要保留的值：`,
      choices: [
        { name: `被插入文件值: ${baseObj[key]}`, value: 'base' },
        { name: `插入文件值: ${insertVal}`, value: 'insert' },
        new Separator(),
      ],
      default: 'base',
      loop: true,
    });

    if (choice === 'insert') {
      baseObj[key] = insertVal;
      logger.info(`已用插入值覆盖键 "${key}"`, true);
    } else {
      logger.info(`保留被插入文件值，键 "${key}" 未更改`, true);
    }
  }

  return baseObj;
}

/**
 * 主函数：从插入目录按指定 keys 批量插入到被插入目录
 */
export async function jsonInsert(program: Command) {
  try {
    const srcDir = await input({
      message:
        '请输入被插入 JSON 文件夹路径（含语言子文件夹，如 cn/translate.json）：',
      validate: validatePathInput,
    });

    const insertDir = await input({
      message:
        '请输入待插入 JSON 文件夹路径（含语言子文件夹，如 cn/translate.json）：',
      validate: validatePathInput,
    });

    const keysFileInput = await input({
      message: '请输入 key 来源 JSON 文件路径（从中读取需要插入的 key）：',
      validate: validateJsonFileInput,
    });

    const conflictStrategy = await select<ConflictStrategy>({
      message: '当目标键已存在且值不同时，请选择处理方式：',
      choices: [
        { name: '直接覆盖（始终使用插入文件值）', value: 'overwrite' },
        { name: '手动选择（针对每个冲突键提示）', value: 'manual' },
        new Separator(),
      ],
      default: 'manual',
      loop: true,
    });

    const srcPath = normalizeGitBashPath(srcDir);
    const insertPath = normalizeGitBashPath(insertDir);
    const keysFilePath = normalizeGitBashPath(keysFileInput);
    const keys = extractKeysFromJsonFile(keysFilePath);

    if (keys.length === 0) {
      logger.info('key 来源文件中未找到有效 key，操作取消');
      return;
    }

    logger.info(`被插入目录: ${srcPath}`);
    logger.info(`插入目录: ${insertPath}`);
    logger.info(`key 来源文件: ${keysFilePath}`);
    logger.info(`待插入 key: ${keys.join(', ')}`);
    logger.info(
      `冲突处理策略: ${conflictStrategy === 'overwrite' ? '直接覆盖' : '手动选择'}`
    );

    const commonLangDirs = getSubDirectories(srcPath).filter((lang) =>
      getSubDirectories(insertPath).includes(lang)
    );

    if (commonLangDirs.length === 0) {
      logger.info('没有发现相同语言文件夹，操作取消');
      return;
    }

    logger.info(
      `发现 ${commonLangDirs.length} 个共同语言文件夹: ${commonLangDirs.join(', ')}`,
      true
    );

    for (const langKey of commonLangDirs) {
      logger.info(`${'='.repeat(60)}`, true);
      logger.info(`处理语言: ${langKey}`, true);

      const srcLangPath = path.join(srcPath, langKey);
      const insertLangPath = path.join(insertPath, langKey);
      const insertJsonFiles = getJsonFilesInLangDir(insertLangPath);
      const commonJsonFiles = getJsonFilesInLangDir(srcLangPath).filter(
        (file) => insertJsonFiles.includes(file)
      );

      if (commonJsonFiles.length === 0) {
        logger.info(`语言【${langKey}】下没有共同的 JSON 文件，跳过`, true);
        continue;
      }

      logger.info(
        `发现 ${commonJsonFiles.length} 个共同 JSON 文件: ${commonJsonFiles.join(', ')}`,
        true
      );

      for (const jsonFile of commonJsonFiles) {
        logger.info(`处理文件: ${jsonFile}`, true);

        const srcFile = path.join(srcLangPath, jsonFile);
        const insertFile = path.join(insertLangPath, jsonFile);
        const srcJson = readJsonFile(srcFile);
        const insertJson = readJsonFile(insertFile);

        logger.info(`被插入文件原有键数: ${Object.keys(srcJson).length}`, true);

        const updated = await insertKeysIntoObject(
          srcJson,
          insertJson,
          keys,
          conflictStrategy
        );

        logger.info(`插入后键数: ${Object.keys(updated).length}`, true);
        writeJsonFile(srcFile, updated);
        logger.info(`文件 ${jsonFile} 已更新`, true);
      }

      logger.info(`语言【${langKey}】处理完成`, true);
    }

    logger.info(`${'='.repeat(60)}`, true);
    logger.info(`所有插入操作完成!`, true);
    logger.info(`被插入目录已更新: ${srcPath}`, true);
  } catch (error: unknown) {
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
