import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

type Row = (string | number | null | undefined)[];

interface I18nConfig {
  defaultKey: string;
  langs: Record<string, string[]>;
}

function loadConfig(configPath: string): I18nConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  const json = JSON.parse(content);
  if (!json.i18n || !json.i18n.defaultKey || !json.i18n.langs) {
    throw new Error('配置文件格式错误，缺少 i18n.defaultKey 或 i18n.langs');
  }
  return json.i18n;
}

/**
 * 匹配列名对应的语言key，大小写不敏感
 */
function matchLangKey(
  colName: string,
  langs: Record<string, string[]>
): string | null {
  if (!colName) return null;
  const colNameLower = colName.toLowerCase();

  // 先尝试匹配英文语言key，大小写不敏感
  for (const langKey of Object.keys(langs)) {
    if (langKey.toLowerCase() === colNameLower) {
      return langKey;
    }
  }

  // 再尝试匹配中文语言名，包含关系，大小写不敏感
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
 * 去除字符串首尾单引号或双引号
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

export async function excel2json(program: Command) {
  const configPath = path.join(process.cwd(), 'src/config/setting.json');
  let i18nConfig: I18nConfig;
  try {
    i18nConfig = loadConfig(configPath);
  } catch (err) {
    if (err instanceof Error) {
      console.error('读取配置文件失败:', err.message);
    } else {
      console.error('读取配置文件失败:', err);
    }
    return;
  }

  const answer = await input({
    message: '请输入excel文件路径:',
    required: true,
    validate: (value) => {
      const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length === 0) return '路径不能为空';
      if (!fs.existsSync(cleaned)) return '文件不存在，请输入有效路径';
      if (!/\.(xls|xlsx)$/i.test(cleaned))
        return '请输入有效的excel文件路径(.xls或.xlsx)';
      return true;
    },
  });

  const excelPath = path.normalize(answer.trim().replace(/^['"]|['"]$/g, ''));

  try {
    const workbook = XLSX.readFile(excelPath);
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      console.error('excel文件没有任何工作表');
      return;
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows: Row[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length < 2) {
      console.error('工作表数据不足，至少需要两行（表头+数据）');
      return;
    }

    const headerRow = rows[0].map((cell) => (cell ? String(cell).trim() : ''));

    const colIndexToLangKey: Record<number, string> = {};
    headerRow.forEach((colName, idx) => {
      const langKey = matchLangKey(colName, i18nConfig.langs);
      if (langKey) {
        colIndexToLangKey[idx] = langKey;
      }
    });

    const defaultLang = i18nConfig.defaultKey;
    const defaultColIndex = Object.entries(colIndexToLangKey).find(
      ([, langKey]) => langKey === defaultLang
    )?.[0];

    if (defaultColIndex === undefined) {
      console.error(`找不到默认语言列: ${defaultLang}`);
      return;
    }
    const defaultColNum = Number(defaultColIndex);

    const langTranslations: Record<string, Record<string, string>> = {};
    Object.values(colIndexToLangKey).forEach((langKey) => {
      if (langKey !== defaultLang) {
        langTranslations[langKey] = {};
      }
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const keyCell = row[defaultColNum];
      if (keyCell === undefined || keyCell === null || keyCell === '') continue;
      let key = String(keyCell).trim();
      key = trimQuotes(key); // 去除引号

      for (const [colIdxStr, langKey] of Object.entries(colIndexToLangKey)) {
        const colIdx = Number(colIdxStr);
        if (langKey === defaultLang) continue;
        const valCell = row[colIdx];
        if (valCell !== undefined && valCell !== null && valCell !== '') {
          langTranslations[langKey][key] = String(valCell);
        }
      }
    }

    // 输出目录：Excel 文件所在目录下的 lang 文件夹
    const excelDir = path.dirname(excelPath);
    const outputRoot = path.join(excelDir, 'lang');
    if (!fs.existsSync(outputRoot)) {
      fs.mkdirSync(outputRoot, { recursive: true });
    }

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
      console.log(`已生成: ${filePath}`);
    }

    console.log('全部转换完成！');
  } catch (error) {
    if (error instanceof Error) {
      console.error('转换失败:', error.message);
    } else {
      console.error('转换失败:', error);
    }
  }
}
