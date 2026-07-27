import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import { extractFromVue } from '../dist/modules/i18n/extractEntry/index.js';
import { createImageProcessor } from '../dist/modules/image/compressImage/index.js';
import { getNearestHolidays } from '../dist/modules/tools/getHolidayTime/index.js';
import { readJsonFile } from '../dist/utils/index.js';

test('readJsonFile rejects invalid JSON without modifying the file', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-web-cli-json-'));
  const filePath = path.join(tempDir, 'translate.json');
  const invalidJson = '{"broken":';
  fs.writeFileSync(filePath, invalidJson, 'utf8');
  t.after(() =>
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    })
  );

  assert.throws(() => readJsonFile(filePath), /读取JSON文件失败/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), invalidJson);
});

test('extractFromVue scans both script and script setup blocks', () => {
  const source = `
    <script>const legacyText = '普通脚本词条';</script>
    <script setup>const setupText = '组合式脚本词条';</script>
  `;

  const entries = extractFromVue(source);

  assert.equal(entries.has('普通脚本词条'), true);
  assert.equal(entries.has('组合式脚本词条'), true);
});

test('getNearestHolidays includes a holiday occurring today', () => {
  const data = {
    year: 2026,
    region: 'CN',
    dates: [
      { date: '2026-07-27', name: '测试假期', type: 'public_holiday' },
      { date: '2026-07-28', name: '测试假期', type: 'public_holiday' },
    ],
  };

  const holidays = getNearestHolidays(data, 3, new Date('2026-07-27T18:30:00'));

  assert.equal(holidays.length, 1);
  assert.equal(holidays[0].daysUntil, 0);
  assert.deepEqual(holidays[0].holidayDates, ['2026-07-27', '2026-07-28']);
});

test('createImageProcessor preserves all animated GIF frames', async () => {
  const redFrame = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: '#ff0000',
    },
  })
    .png()
    .toBuffer();
  const blueFrame = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: '#0000ff',
    },
  })
    .png()
    .toBuffer();

  const input = await sharp([redFrame, blueFrame], {
    join: { animated: true },
  })
    .gif({ delay: [50, 50] })
    .toBuffer();
  const output = await createImageProcessor(input)
    .gif({ effort: 1 })
    .toBuffer();

  const metadata = await sharp(output, { animated: true }).metadata();
  assert.equal(metadata.pages, 2);
});

test('createImageProcessor strips EXIF metadata by default', async () => {
  const input = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: '#ffffff',
    },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: 'td-web-cli-test' } } })
    .toBuffer();

  const before = await sharp(input).metadata();
  const output = await createImageProcessor(input).jpeg().toBuffer();
  const after = await sharp(output).metadata();

  assert.equal(Boolean(before.exif), true);
  assert.equal(Boolean(after.exif), false);
});
