# 多语言 Excel 转 JSON 及语言检测工具

该工具实现从多语言 Excel 文件批量生成对应的 JSON 翻译文件，并对所有词条进行语言检测，生成语言检测结果的 Excel 文件，方便多语言项目的词条管理与质量控制。

---

## 主要功能

1. **配置文件加载**
   - 读取本地 `setting.json` 配置，获取默认语言、语言映射及语言长代码。
   - 支持在线获取语言列表并覆盖配置中的语言长代码，提高检测准确性。

2. **Excel 文件读取与解析**
   - 交互式输入 Excel 文件路径，支持 `.xls` 和 `.xlsx` 格式。
   - 读取第一个工作表，解析表头和数据行。
   - 根据配置匹配表头语言列，支持大小写不敏感和语言名称模糊匹配。

3. **多语言词条提取与重复 Key 处理**
   - 以默认语言列的词条作为 JSON Key。
   - 若 Key 重复，自动添加随机6位编码前缀，确保唯一性。
   - 其他语言词条对应相同 Key，若重复也会重新编码。

4. **批量语言检测**
   - 将每种语言的所有词条拼接成字符串，一次调用语言检测接口，减少请求次数。
   - 解析检测结果，拆分到每条词条对应的错误信息。

5. **生成多语言 JSON 文件**
   - 为每个非默认语言生成对应的 JSON 文件，存放于 `lang_时间戳/语言KEY/translate.json`。
   - 默认语言不生成 JSON 文件，词条作为 Key 使用。

6. **生成语言检测结果 Excel 文件**
   - 生成包含所有语言检测错误信息的 Excel 文件，表头对应原 Excel 表头语言列。
   - 每行对应原 Excel 中一条数据，便于查看和修正。

7. **日志与异常处理**
   - 详细日志记录配置加载、文件解析、语言检测及文件生成过程。
   - 异常时记录日志并安全退出。

---

## 使用说明

1. 准备符合格式的 Excel 文件，第一行为表头，包含语言列（如 `en`, `cn` 等）。
2. 配置好 `setting.json` 文件，包含国际化相关配置。
3. 运行工具，输入 Excel 文件路径。
4. 程序自动解析 Excel，生成多语言 JSON 文件和语言检测结果 Excel。
5. 结果文件输出在 Excel 文件所在目录的 `lang_时间戳` 文件夹中。

---

## 代码结构简述

- **loadConfig(configPath: string): I18nConfig**  
  读取并校验配置文件，返回国际化配置对象。

- **matchLangKey(colName: string, langs: Record<string, string[]>): string | null**  
  根据表头列名匹配语言 KEY，支持大小写和语言名称模糊匹配。

- **batchCheckTexts(texts: string[], language: string): Promise<(CheckResult | null)[]>**  
  批量调用语言检测接口，减少请求次数。

- **parseCheckResultPerEntry(checkResult: CheckResult, texts: string[]): string[]**  
  将语言检测结果拆分到对应词条的错误描述数组。

- **excel2json(program: Command)**  
  主流程函数，完成配置加载、Excel 解析、语言检测、JSON 文件及检测结果 Excel 生成。

---

## 备注

- 默认语言的 JSON 文件不生成，默认语言词条作为 Key 使用。
- 语言检测依赖在线服务，若获取语言列表失败则使用本地配置。
- 重复 Key 处理确保生成的 JSON 文件中键名唯一，避免冲突。
- 语言检测结果 Excel 方便翻译人员集中查看和修正错误。

---

欢迎使用和反馈！
