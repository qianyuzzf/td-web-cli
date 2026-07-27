import { getData } from '../../../api/index.js';
import api from '../../../api/interface.js';
import { logger, loggerError, normalizeError } from '../../../utils/index.js';

interface HolidayDate {
  date: string; // 日期字符串，格式 "YYYY-MM-DD"
  name: string; // 节日名称
  type: string; // 类型：public_holiday 或 transfer_workday
}

interface HolidayData {
  year: number;
  region: string;
  dates: HolidayDate[];
}

interface HolidaySummary {
  name: string; // 节日名称
  daysUntil: number; // 距离今天还有多少天
  holidayDates: string[]; // 放假日期数组
  hasTransferWorkday: boolean; // 是否有调休
  transferWorkdays: string[]; // 调休日日期数组
}

/**
 * 计算从今天起最近的几个节假日信息
 * @param data 节假日数据
 * @param count 需要返回的节假日数量，默认3
 * @returns 最近count个节假日的汇总信息数组
 */
export function getNearestHolidays(
  data: HolidayData,
  count: number = 3,
  now: Date = new Date()
): HolidaySummary[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // 过滤出所有节假日和调休日
  const holidays = data.dates.filter(
    (d) => d.type.toLowerCase() === 'public_holiday'
  );
  const transferWorkdays = data.dates.filter(
    (d) => d.type.toLowerCase() === 'transfer_workday'
  );

  // 解析日期字符串为Date对象，确保时区正确
  function parseDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00');
  }

  // 按日期升序排序节假日
  holidays.sort(
    (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
  );

  // 筛选今天及以后日期的节假日
  const upcomingHolidays = holidays.filter((h) => parseDate(h.date) >= today);

  // 将连续日期且名称相同的节假日合并为一个节日区间
  const grouped: HolidaySummary[] = [];
  let currentGroup: HolidaySummary | null = null;

  for (const h of upcomingHolidays) {
    const hd = parseDate(h.date);
    if (!currentGroup) {
      // 初始化第一个节日组
      currentGroup = {
        name: h.name,
        daysUntil: Math.ceil(
          (hd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        ),
        holidayDates: [h.date],
        hasTransferWorkday: false,
        transferWorkdays: [],
      };
    } else {
      // 判断是否是连续日期且名称相同，合并到当前组
      const lastDate = parseDate(
        currentGroup.holidayDates[currentGroup.holidayDates.length - 1]
      );
      const diffDays =
        (hd.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 1 && h.name === currentGroup.name) {
        currentGroup.holidayDates.push(h.date);
      } else {
        // 不连续或名称不同，保存当前组，开启新组
        grouped.push(currentGroup);
        currentGroup = {
          name: h.name,
          daysUntil: Math.ceil(
            (hd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          ),
          holidayDates: [h.date],
          hasTransferWorkday: false,
          transferWorkdays: [],
        };
      }
    }
  }
  if (currentGroup) {
    grouped.push(currentGroup);
  }

  // 为每个节假日组匹配调休日（调休日距离节假日区间前后7天内视为相关）
  for (const group of grouped) {
    const start = parseDate(group.holidayDates[0]);
    const end = parseDate(group.holidayDates[group.holidayDates.length - 1]);

    const relatedTransfers = transferWorkdays.filter((t) => {
      const td = parseDate(t.date);
      return (
        td.getTime() >= start.getTime() - 7 * 24 * 60 * 60 * 1000 &&
        td.getTime() <= end.getTime() + 7 * 24 * 60 * 60 * 1000
      );
    });

    if (relatedTransfers.length > 0) {
      group.hasTransferWorkday = true;
      group.transferWorkdays = relatedTransfers.map((t) => t.date);
    }
  }

  // 返回最近count个节假日
  return grouped.slice(0, count);
}

/**
 * 根据最近节假日的最短剩余天数，打印对应文案和表情
 * @param minDays 最近节假日剩余最少天数
 */
function printHolidayMessage(minDays: number) {
  if (minDays <= 10) {
    console.log(
      '\x1b[33m%s\x1b[0m',
      '🎉 好开心！假期马上就到了，放松一下吧！🎉'
    );
  } else if (minDays <= 30) {
    console.log('\x1b[36m%s\x1b[0m', '🙏 祈祷时间过得快点，假期早点来临！🙏');
  } else {
    console.log(
      '\x1b[31m%s\x1b[0m',
      '😞 距离假期还很远，继续加油，坚持就是胜利！😞'
    );
  }
}

/**
 * 获取节假日信息并打印最近三个节假日详情，节假日名称黄色，序号无颜色
 * 并打印请求和处理进度提示，最后根据最近节假日剩余天数打印文案
 */
export async function getHolidayTime() {
  try {
    logger.info('开始获取节假日数据...', true);
    const year = new Date().getFullYear();
    const url = api.UNPKG_HOLIDAY_CALENDAR + `/${year}.json`;
    let data: HolidayData = await getData<HolidayData>(url);
    logger.info('节假日数据请求成功，开始计算最近节假日...', true);

    let nearest = getNearestHolidays(data, 3);

    // 当前年份不足三个未来假期时，补充下一年数据，避免年末无结果。
    if (nearest.length < 3) {
      const nextYear = year + 1;
      const nextYearUrl = api.UNPKG_HOLIDAY_CALENDAR + `/${nextYear}.json`;
      try {
        logger.info(
          `当前年份未来假期不足，开始获取 ${nextYear} 年数据...`,
          true
        );
        const nextYearData = await getData<HolidayData>(nextYearUrl);
        data = {
          ...data,
          dates: [...data.dates, ...nextYearData.dates],
        };
        nearest = getNearestHolidays(data, 3);
      } catch (error: unknown) {
        logger.warn(
          `获取 ${nextYear} 年节假日数据失败，将展示当前可用结果：${normalizeError(error).message}`,
          true
        );
      }
    }

    console.log('\x1b[36m%s\x1b[0m', '=== 最近三个节假日信息 ==='); // 青色标题
    nearest.forEach((holiday, index) => {
      console.log(
        `第${index + 1}个节假日: \x1b[33m\x1b[1m${holiday.name}\x1b[0m`
      ); // 节假日名称黄色加粗
      console.log(`距离今天还有: \x1b[32m${holiday.daysUntil} 天\x1b[0m`); // 绿色天数
      console.log(
        `放假日期: \x1b[35m${holiday.holidayDates.join(', ')}\x1b[0m`
      ); // 紫色日期
      if (holiday.hasTransferWorkday) {
        console.log(
          `包含调休日期: \x1b[31m${holiday.transferWorkdays.join(', ')}\x1b[0m`
        ); // 红色调休日
      } else {
        console.log('\x1b[37m无调休\x1b[0m'); // 白色无调休
      }
      console.log('\x1b[90m---------------------\x1b[0m'); // 灰色分割线
    });

    // 找到最近节假日的最小剩余天数，打印对应文案
    if (nearest.length > 0) {
      const minDays = Math.min(...nearest.map((h) => h.daysUntil));
      printHolidayMessage(minDays);
    } else {
      console.log('\x1b[37m暂无未来节假日信息。\x1b[0m');
    }

    logger.info('节假日信息打印完成。', true);
  } catch (error: unknown) {
    // 记录错误日志，方便排查
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
