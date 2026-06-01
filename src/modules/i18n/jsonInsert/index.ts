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

/**
 * 将指定 keys 从插入对象合并到源对象
 * @param baseObj     源 JSON 对象（会被原地修改）
 * @param insertObj   待插入的 JSON 对象
 * @param keys        需要插入的键数组
 * @param langKey     当前语言标识（用于日志）
 * @param strategy    冲突处理策略：直接覆盖或手动选择
 * @returns 返回修改后的源对象（与 baseObj 同一引用）
 */
async function insertKeysIntoObject(
  baseObj: Record<string, any>,
  insertObj: Record<string, any>,
  keys: string[],
  langKey: string,
  strategy: ConflictStrategy
): Promise<Record<string, any>> {
  for (const key of keys) {
    // 插入文件中不存在该键 → 跳过
    if (!(key in insertObj)) {
      logger.warn(`键 "${key}" 在插入文件中不存在，已跳过`, true);
      continue;
    }

    const insertVal = insertObj[key];

    // 源文件中不存在该键 → 直接新增
    if (!(key in baseObj)) {
      baseObj[key] = insertVal;
      logger.info(`新增键: ${key}`, true);
      continue;
    }

    // 键已存在且值相同 → 跳过
    if (baseObj[key] === insertVal) {
      logger.info(`键 "${key}" 值相同，已跳过`, true);
      continue;
    }

    // 键已存在且值不同 → 根据策略处理
    logger.info(`键 "${key}" 已存在且值不同`, true);

    if (strategy === 'overwrite') {
      // 直接覆盖
      baseObj[key] = insertVal;
      logger.info(`已用插入值覆盖键 "${key}"`, true);
    } else {
      // 手动选择
      const choice = await select({
        message: `请选择要保留的值：`,
        choices: [
          { name: `源文件值: ${baseObj[key]}`, value: 'base' },
          { name: `插入文件值: ${insertVal}`, value: 'insert' },
          new Separator(), // 分割线，方便未来扩展更多功能
        ],
        default: 'base',
        loop: true,
      });

      if (choice === 'insert') {
        baseObj[key] = insertVal;
        logger.info(`已用插入值覆盖键 "${key}"`, true);
      } else {
        logger.info(`保留源文件值，键 "${key}" 未更改`, true);
      }
    }
  }
  return baseObj;
}

/**
 * 主函数：从插入目录按指定 keys 批量插入到源目录
 * @param program Commander 实例（保留扩展可能）
 */
export async function jsonInsert(program: Command) {
  try {
    // 获取源目录路径
    const srcDir = await input({
      message:
        '请输入源 JSON 文件夹路径（含语言子文件夹，如 cn/translate.json）：',
      validate: validatePathInput,
    });

    // 获取待插入目录路径
    const insertDir = await input({
      message:
        '请输入待插入 JSON 文件夹路径（含语言子文件夹，如 cn/translate.json）：',
      validate: validatePathInput,
    });

    // 获取需要插入的 keys
    const keysInput = await input({
      message: '请输入需要插入的 JSON key（多个 key 请用英文逗号分隔）：',
      validate: (value) => {
        if (!value.trim()) return '键不能为空';
        return true;
      },
    });

    // 冲突处理策略选择
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

    // 路径标准化
    const srcPath = normalizeGitBashPath(srcDir);
    const insertPath = normalizeGitBashPath(insertDir);

    // 解析并清洗 keys
    const keys = keysInput
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keys.length === 0) {
      logger.info('未输入有效 key，操作取消');
      return;
    }

    logger.info(`源目录: ${srcPath}`);
    logger.info(`插入目录: ${insertPath}`);
    logger.info(`待插入 key: ${keys.join(', ')}`);
    logger.info(
      `冲突处理策略: ${conflictStrategy === 'overwrite' ? '直接覆盖' : '手动选择'}`
    );

    // 获取共同的顶层语言子文件夹
    const srcLangDirs = fs
      .readdirSync(srcPath)
      .filter((f) => fs.statSync(path.join(srcPath, f)).isDirectory());
    const insertLangDirs = fs
      .readdirSync(insertPath)
      .filter((f) => fs.statSync(path.join(insertPath, f)).isDirectory());

    const commonLangDirs = srcLangDirs.filter((lang) =>
      insertLangDirs.includes(lang)
    );

    if (commonLangDirs.length === 0) {
      logger.info('没有发现相同语言文件夹，操作取消');
      return;
    }

    logger.info(
      `发现 ${commonLangDirs.length} 个共同语言文件夹: ${commonLangDirs.join(', ')}`,
      true
    );

    // 逐语言文件夹处理
    for (const langKey of commonLangDirs) {
      logger.info(`${'='.repeat(60)}`, true);
      logger.info(`处理语言: ${langKey}`, true);

      const srcLangPath = path.join(srcPath, langKey);
      const insertLangPath = path.join(insertPath, langKey);

      const srcJsonFiles = getJsonFilesInLangDir(srcLangPath);
      const insertJsonFiles = getJsonFilesInLangDir(insertLangPath);

      // 找出该语言下共同存在的 JSON 文件
      const commonJsonFiles = srcJsonFiles.filter((file) =>
        insertJsonFiles.includes(file)
      );

      if (commonJsonFiles.length === 0) {
        logger.info(`语言【${langKey}】下没有共同的 JSON 文件，跳过`, true);
        continue;
      }

      logger.info(
        `发现 ${commonJsonFiles.length} 个共同 JSON 文件: ${commonJsonFiles.join(', ')}`,
        true
      );

      // 逐文件插入
      for (const jsonFile of commonJsonFiles) {
        logger.info(`处理文件: ${jsonFile}`, true);

        const srcFile = path.join(srcLangPath, jsonFile);
        const insertFile = path.join(insertLangPath, jsonFile);

        if (!fs.existsSync(srcFile) || !fs.existsSync(insertFile)) {
          logger.warn(`文件缺失，跳过: ${jsonFile}`, true);
          continue;
        }

        // 读取 JSON
        const srcJson = readJsonFile(srcFile);
        const insertJson = readJsonFile(insertFile);

        const beforeCount = Object.keys(srcJson).length;
        logger.info(`源文件原有键数: ${beforeCount}`, true);

        // 执行插入
        const updated = await insertKeysIntoObject(
          srcJson,
          insertJson,
          keys,
          langKey,
          conflictStrategy
        );

        const afterCount = Object.keys(updated).length;
        logger.info(`插入后键数: ${afterCount}`, true);

        // 写回源文件
        writeJsonFile(srcFile, updated);
        logger.info(`文件 ${jsonFile} 已更新`, true);
      }

      logger.info(`语言【${langKey}】处理完成`, true);
    }

    logger.info(`${'='.repeat(60)}`, true);
    logger.info(`所有插入操作完成!`, true);
    logger.info(`源目录已更新: ${srcPath}`, true);
  } catch (error: unknown) {
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
