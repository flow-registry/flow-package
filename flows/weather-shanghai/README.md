# 上海天气

腾讯 `wis.qq.com` 实况 + 8 日预报，10 分钟一刷。

- `summary`：当前天气/温度/风向风力
- `extra`：湿度、气压
- `sparkline`：8 日最高温
- `plotly`：最高/最低双折线
- `signal: "weather.updated"`：落定后 emit，下游 flow 用
  `trigger: {"on": "weather.updated"}` 订阅（QML 式 signal→slot）。

数据源为公开天气接口，仅供演示。
