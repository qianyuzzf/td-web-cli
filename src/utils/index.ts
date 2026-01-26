import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 获取当前时间戳字符串，格式为：YYYYMMDDHHMMSS
 * 例如：20260123135500 表示 2026年01月23日 13点55分00秒
 *
 * @returns {string} 格式化后的时间戳字符串
 */
export function getTimestamp(): string {
  const now = new Date();

  /**
   * 辅助函数：将数字转换为长度为2的字符串，不足时左侧补0
   * @param n 需要格式化的数字
   * @returns {string} 补零后的字符串
   */
  const pad = (n: number): string => n.toString().padStart(2, '0');

  const year = now.getFullYear(); // 获取四位年份
  const month = pad(now.getMonth() + 1); // 获取月份（0-11），需+1，补零
  const day = pad(now.getDate()); // 获取日期，补零
  const hour = pad(now.getHours()); // 获取小时，补零
  const minute = pad(now.getMinutes()); // 获取分钟，补零
  const second = pad(now.getSeconds()); // 获取秒钟，补零

  // 拼接成完整时间戳字符串
  return `${year}${month}${day}${hour}${minute}${second}`;
}

/**
 * 日志级别类型
 */
type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/**
 * 日志配置接口
 */
interface LoggerOptions {
  /**
   * 日志目录，默认程序入口文件所在目录的上级目录的 logs 文件夹
   */
  logsDir?: string;

  /**
   * 日志文件名格式函数，接收当前日期，返回文件名字符串
   * 默认格式为 YYYYMMDD.txt
   */
  filenameFormatter?: (date: Date) => string;

  /**
   * 当前环境，默认 process.env.NODE_ENV
   */
  env?: string;

  /**
   * 程序入口文件绝对路径，用于确定日志目录位置
   */
  entryFilePath?: string;
}

/**
 * 获取程序入口文件路径（兼容 ES Module）
 * @returns 程序入口文件的绝对路径
 */
function getEntryFilePath(): string {
  try {
    // 当前模块文件路径
    return fileURLToPath(import.meta.url);
  } catch {
    // 兜底：使用 process.argv[1]
    if (process.argv.length > 1) {
      return path.resolve(process.cwd(), process.argv[1]);
    }
    // 最终兜底
    return '';
  }
}

/**
 * 默认日志配置
 * logsDir 默认设置为程序入口文件所在目录的上级目录的 logs 文件夹
 */
const defaultOptions: LoggerOptions = {
  logsDir: '',
  filenameFormatter: (date: Date) =>
    date.toISOString().slice(0, 10).replace(/-/g, '') + '.txt',
  env: process.env.NODE_ENV || 'production',
  entryFilePath: getEntryFilePath(),
};

/**
 * 格式化日志内容，支持字符串或对象
 * @param level 日志级别
 * @param message 日志内容，字符串或对象
 * @param date 当前时间
 * @returns 格式化后的日志字符串
 */
function formatLogLine(level: LogLevel, message: unknown, date: Date): string {
  const timeStr = date.toISOString();
  let msgStr: string;

  if (typeof message === 'string') {
    msgStr = message;
  } else {
    try {
      msgStr = JSON.stringify(message, null, 2);
    } catch {
      msgStr = String(message);
    }
  }

  return `[${timeStr}] [${level}] ${msgStr}\n`;
}

/**
 * 统一日志处理类
 * 支持写入日志文件和控制台打印
 */
export class Logger {
  private logsDir: string;
  private filenameFormatter: (date: Date) => string;
  private env: string;

  /**
   * 构造函数，初始化日志配置
   * @param options 配置项，可选
   */
  constructor(options?: LoggerOptions) {
    const opts = { ...defaultOptions, ...options };

    // 如果未传 logsDir，则默认设置为入口文件所在目录的上级目录的 logs 文件夹
    this.logsDir =
      opts.logsDir ||
      path.resolve(path.dirname(opts.entryFilePath!), '..', 'logs');
    this.filenameFormatter =
      opts.filenameFormatter ?? defaultOptions.filenameFormatter!;
    this.env = opts.env ?? defaultOptions.env!;
  }

  /**
   * 写日志主函数
   * @param level 日志级别
   * @param message 日志内容，支持字符串或对象
   * @param printConsole 是否打印到控制台，默认 false
   */
  log(level: LogLevel, message: unknown, printConsole = false): void {
    const now = new Date();
    const logLine = formatLogLine(level, message, now);

    // 根据调用时是否指定打印控制台，决定是否打印
    if (printConsole) {
      switch (level) {
        case 'INFO':
          console.info(logLine.trim());
          break;
        case 'WARN':
          console.warn(logLine.trim());
          break;
        case 'ERROR':
          console.error(logLine.trim());
          break;
      }
    }

    try {
      // 确保日志目录存在
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      const filename = this.filenameFormatter(now);
      const logFilePath = path.join(this.logsDir, filename);

      // 追加写入日志文件
      fs.appendFileSync(logFilePath, logLine, { encoding: 'utf8' });
    } catch (error: unknown) {
      // 仅在开发环境打印写日志异常堆栈，生产环境静默失败，避免影响主程序
      if (this.env === 'development') {
        if (error instanceof Error) {
          console.error('日志写入异常：', error.stack);
        } else {
          console.error('日志写入异常：', error);
        }
      }
    }
  }

  /**
   * 记录信息级别日志
   * @param message 日志内容
   * @param printConsole 是否打印到控制台，默认 false
   */
  info(message: unknown, printConsole = false): void {
    this.log('INFO', message, printConsole);
  }

  /**
   * 记录警告级别日志
   * @param message 日志内容
   * @param printConsole 是否打印到控制台，默认 false
   */
  warn(message: unknown, printConsole = false): void {
    this.log('WARN', message, printConsole);
  }

  /**
   * 记录错误级别日志
   * @param message 日志内容
   * @param printConsole 是否打印到控制台，默认 false
   */
  error(message: unknown, printConsole = false): void {
    this.log('ERROR', message, printConsole);
  }
}

/**
 * 默认导出单例 logger，方便直接使用
 * 默认不打印控制台日志
 */
export const logger = new Logger({
  env: process.env.NODE_ENV || 'development',
});

/**
 * 通用错误日志记录函数
 * @param error 捕获的错误对象
 * @param logger 日志对象，需包含 error 方法
 * @param prefix 日志前缀，方便区分来源，默认值为 '程序执行时发生错误'
 * @param printConsole 是否打印错误日志到控制台，默认 false
 */
export function loggerError(
  error: unknown,
  logger: { error: (msg: string, printConsole?: boolean) => void },
  prefix = '程序执行时发生错误',
  printConsole = false
): void {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  logger.error(`${prefix}：${message}`, printConsole);
}
