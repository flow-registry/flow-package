# SPCX 行情

SpaceX（usSPCX.OQ）腾讯行情 cell。每 5 分钟取数一次：

1. `net.fetch` → `spcx_kline.json`（12 日 qfqkline + qt 实时段）
2. `net.fetch` → `spcx_news.json`（最新 5 条快讯）
3. `js: quote.render` → 解析成 `{title, summary, extra, sparkline, news, plotly}`

输出字段遵循 `output.*` 词表：`summary` 是「收 $X (±Y%)」，`extra` 是盘后价
（没有盘后数据时退化为当日开/高/低），`plotly` 走宿主的原生图表投影。

数据源为公开行情接口，仅供演示；无鉴权、无写操作。
