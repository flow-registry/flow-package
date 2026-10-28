# FLOW_FORMAT v1：`.flow` 包格式规范

> `.flow` 的**规范性定义**。设备侧设计理由与实现事实见 AssistBox 仓库 `docs/FLOW_YAML_ZH.md`——本文件是单一事实源的格式契约，实现（Kotlin/Rust/JS）与打包器都对齐它。
>
> 一句话：**`.flow` = zip 单文件包（`manifest.yaml` + 分目录内容），宿主解包校验后物化成既有 `automator.register` 调用；kernel 永远看不到 zip/YAML/JS 源码，只看到 typed trigger + steps。**

## 1. 布局

```text
xxxxx.flow                   # zip 归档，扩展名约定 .flow
├── manifest.yaml            # 必需，根目录唯一入口清单（≤32 KiB，UTF-8）
├── vendor.lock              # 条件必需：vendor/ 非空时必须有，否则禁止出现
├── skills/                  # *.md  prompt 片段（面向模型）
├── scripts/                 # *.js  沙箱模块（面向引擎），js: 步按模块名调用
├── vendor/                  # *.js  vendored 库条目（VENDOR_FORMAT v1）
├── views/                   # *.yaml 声明式视图（可选）
├── data/                    # *.json 冻结参数表
├── knowledge/               # knowledge 文件
└── README.md                # 详情页正文（可选）
```

目录即角色：一个文件只有一个合法位置；各目录不嵌套；根目录只允许 `manifest.yaml`、`vendor.lock`、`README.md`。

## 2. zip 安全纪律（敌意输入处理）

| 约束 | 界 |
| --- | --- |
| entry 名 | 禁 `..`/`.`/绝对路径/盘符/反斜杠，fail-closed 不归一化 |
| 体积 | 通用单 entry ≤128 KiB、通用总量 ≤512 KiB、压缩比 ≤100×；**vendor/ 独立界**：≤1 MiB/条目、≤4 MiB 合计 |
| 条目数 | 总 ≤40；目录配额 skills 8 / scripts 16 / data 8 / vendor 8 |
| 字节序 | 先验 `PK\x03\x04`/`PK\x05\x06` |
| 构建确定性 | 打包器按名排序 + 固定时间戳输出：同一输入必得同一字节（指纹稳定的前提） |
| 落盘 | 包从不落盘；symlink 条目只是永不跟随的字节 |

## 3. manifest.yaml 键表

`flow: "1"` 格式版本，缺省即拒；未知字段 fail-closed。**纯加键不升版**，改既有键语义才升 `flow:`。

| 键 | 物化目标 |
|---|---|
| `flow` | 版本门禁 |
| `name` / `description` | 展示元数据（≤64 / ≤200 字符；description 不进指纹） |
| `trigger` `.at` / `.every` / `.on` | typed trigger：绝对时刻 / 周期（≥60s）/ event 信号 |
| `skill.prompt` | skills/*.md 按序拼接为模型 prompt |
| `data.files` | data/*.json 合并为冻结参数表（object、冲突即拒、物化时冻结） |
| `context` `.onStepError` / `.maxFires` | AutomationFlowContext |
| `knowledge` | knowledge 文件列表 |
| `import` | scripts/*.js 模块白名单，`js:` 步的模块解析范围 |
| `uses` | 依赖声明 `{name, minVersion}`：trusted 名查宿主表，vendor 名查 `vendor.lock`；导入期校验 |
| `steps` | typed steps（每步键：`tool:` / `js:` / `arguments:`，二选一互斥） |
| `flowView` `.cell` / `.detail` | views/*.yaml → 宿主编译 UiDocument |

## 4. JS 物化语义

- `js: mod.fn`：`mod` = import 路径 basename 去 `.js`；`fn` 为模块顶层导出函数；未在 `import:` 声明即物化失败（清单错误，不是 fire 错误）。
- **只拼被调用的模块**：每个 `js:` 步的 source 只含其模块全文（≤128 KiB 独立界）；包内模块互不可见。
- **vendor 触达**：`scripts/*.js` 内 `require("<vendor-name>")`——宿主物化期把 `uses:` 声明过的 vendor 条目包装为 CJS factory 注入 wrapper 并 shadow `require`（vendor 表先查、回落 runtime `require`，trusted 名永远可达；同名 vendor 条目导入期即拒）。运行时模块表恒空，JS runtime 零改动。
- **值不进源码**：`function`/`arguments`/`context` 走 dispatch payload 传值；`context.data` 冻结落在 `ct.context`。
- **副作用唯一出口** `ct.tool.call`：沙箱无 os/net/process/env，`require` 只能解析 trusted 名与注入的 vendor 名。

## 5. 指纹（幂等身份）

包级 SHA-256 覆盖：版本、名称、prompt、data、脚本内容、views 源文、trigger、策略、每个 step 与实参、**vendor 条目 + `vendor.lock`**。**不覆盖** `description`。指纹不是跨格式版本的稳定 ABI；幂等承诺只在同一 host 版本内、同一包字节上成立。对外身份是包级 digest。

## 6. 发布与索引

- 官方包在本仓库 `flows/<id>/` 以源形态维护，Release 工作流发不可变 release：tag `<id>-v<version>`、asset `<id>.flow`、distUrl 即 release 附件直链。
- 索引字段与客户端协议见 [flow-registry](https://github.com/flow-registry/flow-registry) `docs/INDEX_SCHEMA.md` / `docs/CLIENT_PROTOCOL.md`；manifest 字段参考见该仓 `docs/MANIFEST.md`（字段级文档，本文件是格式级规范）。
- vendored 库的生产与收录见 [flow-vendor](https://github.com/flow-registry/flow-vendor)：产物为 `vendor/` 条目 + `vendor.lock` 片段，由 `flow.package`/本仓构建脚本合并进包。

## 7. 版本规则

`flow: "1"` → 当前版本。`flow: "2"` 由 steps 执行语义变更引入（AssistBox ADR-0008，Draft）。vendor/`vendor.lock`/`uses:` 为纯添加，不升版——旧读取端对未知目录 fail-closed，兼容信号经索引 `minApp` 表达。
