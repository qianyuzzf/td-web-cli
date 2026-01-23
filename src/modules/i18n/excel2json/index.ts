import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { getTimestamp, logger, loggerError } from '../../../utils/index.js';

type Row = (string | number | null | undefined)[];

/**
 * 国际化配置类型定义
 * defaultKey: 默认语言key
 * langs: 语言映射，key为语言标识，value为语言名称数组（支持多名称匹配）
 */
interface I18nConfig {
  defaultKey: string;
  langs: Record<string, string[]>;
}

/**
 * 读取并解析配置文件
 * @param configPath 配置文件路径
 * @returns I18nConfig 配置对象
 * @throws 配置文件不存在或格式错误时抛出异常
 */
function loadConfig(configPath: string): I18nConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在：${configPath}`);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  const json = JSON.parse(content);
  if (!json.i18n || !json.i18n.defaultKey || !json.i18n.langs) {
    throw new Error('配置文件格式错误，缺少i18n.defaultKey或i18n.langs');
  }
  return json.i18n;
}

/**
 * 匹配excel表头列名对应的语言key，支持大小写不敏感匹配
 * 先匹配语言key本身，再匹配语言名称数组（包含关系）
 * @param colName 表头列名
 * @param langs 语言映射
 * @returns 匹配到的语言key，未匹配返回null
 */
function matchLangKey(
  colName: string,
  langs: Record<string, string[]>
): string | null {
  if (!colName) return null;
  const colNameLower = colName.toLowerCase();

  // 先尝试匹配语言key
  for (const langKey of Object.keys(langs)) {
    if (langKey.toLowerCase() === colNameLower) {
      return langKey;
    }
  }

  // 再尝试匹配语言名称（包含关系）
  for (const [langKey, names] of Object.entries(langs)) {
    if (
      names.some((name) => name && colNameLower.includes(name.toLowerCase()))
    ) {
      return langKey;
    }
  }

  return null;
}

/**
 * 去除字符串首尾的单引号或双引号
 * @param str 输入字符串
 * @returns 去除引号后的字符串
 */
function trimQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * excel转json功能主函数
 * 读取用户输入的excel路径，解析内容，根据配置生成多语言json文件
 * @param program Commander命令行实例
 */
export async function excel2json(program: Command) {
  // 配置文件默认路径
  const configPath = path.join(process.cwd(), 'src/config/setting.json');
  let i18nConfig: I18nConfig;

  // 加载配置文件
  try {
    logger.info(`开始加载配置文件：${configPath}`);
    i18nConfig = loadConfig(configPath);
    logger.info('配置文件加载成功');
  } catch (error: unknown) {
    const msg = `读取配置文件失败：${
      error instanceof Error ? error.message : String(error)
    }，程序已退出`;
    logger.error(msg);
    process.exit(1);
  }

  // 交互式输入excel文件路径并校验
  const answer = await input({
    message: '请输入excel文件路径：',
    validate: (value) => {
      const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length === 0) return '路径不能为空';
      if (!fs.existsSync(cleaned)) return '文件不存在，请输入有效路径';
      if (!/\.(xls|xlsx)$/i.test(cleaned))
        return '请输入有效的excel文件路径（.xls或.xlsx）';
      return true;
    },
  });

  // 规范化路径，支持相对路径转绝对路径，去除首尾引号
  const excelPath = path.resolve(
    process.cwd(),
    answer.trim().replace(/^['"]|['"]$/g, '')
  );

  try {
    logger.info(`开始读取excel文件：${excelPath}`);
    // 读取excel文件
    const workbook = XLSX.readFile(excelPath);
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      logger.error('excel文件没有任何工作表，程序已退出');
      process.exit(1);
    }

    // 读取第一个工作表的数据，按行读取，header=1表示返回二维数组
    const sheet = workbook.Sheets[firstSheetName];
    const rows: Row[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      logger.error('工作表数据不足，至少需要两行（表头+数据），程序已退出');
      process.exit(1);
    }

    logger.info('开始解析表头');
    // 处理表头行，去除空格，转成字符串
    const headerRow = rows[0].map((cell) => (cell ? String(cell).trim() : ''));

    // 根据表头匹配语言列，建立列索引到语言key的映射
    const colIndexToLangKey: Record<number, string> = {};
    headerRow.forEach((colName, idx) => {
      const langKey = matchLangKey(colName, i18nConfig.langs);
      if (langKey) {
        colIndexToLangKey[idx] = langKey;
      }
    });

    // 获取默认语言列索引
    const defaultLang = i18nConfig.defaultKey;
    const defaultColIndex = Object.entries(colIndexToLangKey).find(
      ([, langKey]) => langKey === defaultLang
    )?.[0];

    if (defaultColIndex === undefined) {
      logger.error(`找不到默认语言列：${defaultLang}，程序已退出`);
      process.exit(1);
    }
    const defaultColNum = Number(defaultColIndex);

    // 初始化除默认语言外的语言词条对象
    const langTranslations: Record<string, Record<string, string>> = {};
    Object.values(colIndexToLangKey).forEach((langKey) => {
      if (langKey !== defaultLang) {
        langTranslations[langKey] = {};
      }
    });

    logger.info('开始解析数据行');
    // 遍历数据行，提取默认语言词条作为key，其他语言对应的值作为翻译
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const keyCell = row[defaultColNum];
      if (keyCell === undefined || keyCell === null || keyCell === '') continue;

      let key = String(keyCell).trim();
      key = trimQuotes(key); // 去除引号

      // 跳过空key，避免写入无效数据
      if (key.length === 0) continue;

      // 遍历语言列，除默认语言外，填充翻译内容
      for (const [colIdxStr, langKey] of Object.entries(colIndexToLangKey)) {
        const colIdx = Number(colIdxStr);
        if (langKey === defaultLang) continue;
        const valCell = row[colIdx];
        if (valCell !== undefined && valCell !== null && valCell !== '') {
          langTranslations[langKey][key] = String(valCell);
        }
      }
    }

    // 输出目录：excel文件所在目录下的“lang_时间戳”文件夹
    const excelDir = path.dirname(excelPath);
    const timestamp = getTimestamp();
    const outputRoot = path.join(excelDir, `lang_${timestamp}`);
    if (!fs.existsSync(outputRoot)) {
      fs.mkdirSync(outputRoot, { recursive: true });
    }

    logger.info(`开始生成语言文件，输出目录：${outputRoot}`);
    // 按语言生成对应的json文件
    for (const [langKey, translations] of Object.entries(langTranslations)) {
      if (Object.keys(translations).length === 0) continue;

      const langDir = path.join(outputRoot, langKey);
      if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
      }

      const filePath = path.join(langDir, 'translate.json');
      fs.writeFileSync(
        filePath,
        JSON.stringify(translations, null, 2),
        'utf-8'
      );
      logger.info(`已生成语言文件：${filePath}`);
    }

    logger.info('全部转换完成', true);
  } catch (error: unknown) {
    // 记录错误日志，方便排查
    loggerError(error, logger);
    process.exit(1);
  }
}
