import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import XLSX from 'xlsx';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  getTimestamp,
  logger,
  loggerError,
  normalizeError,
  normalizeGitBashPath,
} from '../../../utils/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface I18nConfig {
  defaultKey: string;
  langs: Record<string, string[]>;
  longCodes: Record<string, string>;
}

/**
 * 读取并解析配置文件（同 excel2json）
 */
function loadConfig(configPath: string): I18nConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在：${configPath}`);
  }
  const content = fs.readFileSync(configPath, { encoding: 'utf-8' });
  const json = JSON.parse(content);
  if (!json.i18n) {
    throw new Error('配置文件格式错误，缺少i18n');
  }
  if (!json.i18n.defaultKey) {
    throw new Error('配置文件格式错误，缺少i18n.defaultKey');
  }
  if (!json.i18n.langs) {
    throw new Error('配置文件格式错误，缺少i18n.langs');
  }
  if (!json.i18n.longCodes) {
    throw new Error('配置文件格式错误，缺少i18n.longCodes');
  }
  return json.i18n;
}

/**
 * JSON 转 Excel 主函数
 * 将多语言 JSON 文件合并为一个 Excel 文件，表头使用语言名称（从配置的 langs 中取第一个）
 */
export async function json2excel(program: Command) {
  // 配置文件默认路径
  const configPath = path.join(__dirname, '../../../../setting.json');
  let i18nConfig: I18nConfig;

  // 加载配置文件
  try {
    logger.info(`开始加载配置文件：${configPath}`, true);
    i18nConfig = loadConfig(configPath);
    logger.info('配置文件加载成功', true);
  } catch (error: unknown) {
    const msg = `读取配置文件失败：${normalizeError(error).stack}，程序已退出`;
    logger.error(msg);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }

  // 交互式输入 JSON 根目录
  const answer = await input({
    message: '请输入存放多语言 JSON 的根目录：',
    validate: (value) => {
      const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length === 0) {
        return '路径不能为空';
      }
      const normalizedPath = normalizeGitBashPath(cleaned);
      if (!fs.existsSync(normalizedPath)) {
        return '目录不存在，请输入有效路径';
      }
      if (!fs.statSync(normalizedPath).isDirectory()) {
        return '请输入一个目录路径';
      }
      return true;
    },
  });

  const rootDir = normalizeGitBashPath(answer);

  try {
    logger.info(`开始扫描目录：${rootDir}`, true);

    // 获取根目录下所有子目录（作为语言 KEY）
    const subDirs = fs.readdirSync(rootDir).filter((name) => {
      const fullPath = path.join(rootDir, name);
      return fs.statSync(fullPath).isDirectory();
    });

    // 加载每个语言的翻译
    const translations: Record<string, Record<string, string>> = {};
    const availableLangs: string[] = [];

    for (const langKey of subDirs) {
      const jsonPath = path.join(rootDir, langKey, 'translate.json');
      if (!fs.existsSync(jsonPath)) {
        logger.warn(`跳过 ${langKey}，不存在 translate.json`, true);
        continue;
      }
      try {
        const content = fs.readFileSync(jsonPath, 'utf-8');
        const data = JSON.parse(content) as Record<string, string>;
        translations[langKey] = data;
        availableLangs.push(langKey);
        logger.info(`已加载语言：${langKey}，词条数量：${Object.keys(data).length}`, true);
      } catch (err) {
        logger.error(`读取 ${langKey} 的 translate.json 失败：${normalizeError(err).message}`, true);
        process.exit(1);
      }
    }

    if (availableLangs.length === 0) {
      logger.error('未找到任何有效的 translate.json 文件，程序退出', true);
      process.exit(1);
    }

    // 默认语言
    const defaultLang = i18nConfig.defaultKey;
    if (!availableLangs.includes(defaultLang)) {
      logger.warn(`默认语言 ${defaultLang} 不存在于已加载的语言中，将使用所有语言的 KEY 并集作为基准`, true);
    }

    // 收集所有 KEY 的并集（作为 Excel 第一列）
    const allKeysSet = new Set<string>();
    for (const lang of availableLangs) {
      Object.keys(translations[lang]).forEach((key) => allKeysSet.add(key));
    }
    const sortedKeys = Array.from(allKeysSet).sort();
    logger.info(`共收集到 ${sortedKeys.length} 个唯一 KEY`, true);

    // 构建表头：第一列使用默认语言的名称（从配置中获取），后面列使用其他语言的名称
    const header: string[] = [];

    // 第一列名称：优先使用默认语言的第一个名称，否则用 defaultKey
    const defaultLangNames = i18nConfig.langs[defaultLang];
    const firstColName = (defaultLangNames && defaultLangNames.length > 0)
      ? defaultLangNames[0]
      : defaultLang;
    header.push(firstColName);

    const nonDefaultLangs = availableLangs.filter((lang) => lang !== defaultLang);
    for (const lang of nonDefaultLangs) {
      const names = i18nConfig.langs[lang];
      const colName = (names && names.length > 0) ? names[0] : lang;
      header.push(colName);
    }

    // 构建 Excel 数据行
    const rows: (string | null)[][] = [header];
    for (const key of sortedKeys) {
      const row: (string | null)[] = [key]; // 第一列是 KEY
      for (const lang of nonDefaultLangs) {
        const val = translations[lang]?.[key];
        row.push(val !== undefined ? val : null); // 无翻译时留空
      }
      rows.push(row);
    }

    // 生成 Excel 文件
    const timestamp = getTimestamp();
    const outputFileName = `lang_merged_${timestamp}.xlsx`;
    const outputPath = path.join(rootDir, outputFileName);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Translations');
    XLSX.writeFile(wb, outputPath);

    logger.info(`Excel 文件已生成：${outputPath}`, true);
    logger.info(`共处理语言：${availableLangs.join(', ')}`, true);
    logger.info('转换完成', true);
  } catch (error: unknown) {
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}