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
