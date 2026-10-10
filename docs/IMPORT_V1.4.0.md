# v1.4.0 初始导入

基线来自 sxwnl-modern-v1.4.0.zip，package.json 版本为 1.4.0。保留源码、原作备份、测试、文档、截图及离线产物。新增仓库说明和许可范围，未修改功能代码。

本次重新运行：TypeScript 检查通过；生产构建通过；自动测试 95 项，92 项通过，3 项失败。失败项：

- international moon events preserve exact engine instants while CN-only terms and date fields are excluded
- unsupported countries and years disclose missing coverage without importing Chinese holidays
- regional week and clock defaults can be explicitly overridden without changing the country

以上是导入时实际结果，原包文档中的历史验证记录不代表本次全部通过。仓库保留这些失败以供后续处理。
