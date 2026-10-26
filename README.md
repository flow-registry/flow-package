# flow-package

AssistBox `.flow` 包的源码仓。[flow-registry](https://github.com/flow-registry/flow-registry) **只放索引**和浏览站；本仓库放包，并用 GitHub Release 分发 zip。

## 布局

```
flows/<id>/
├── VERSION            # semver x.y.z，不打进 zip
├── registry.yaml      # 索引里唯一要手写的字段：author / tags / seed / minApp
├── manifest.yaml      # name、description、steps —— 索引直接引用
├── scripts/*.js
├── views/*.yaml
└── README.md
catalog.json           # 生成物：官方 community-flows 条目，不要手改
```

`.flow` 是一个 zip，根上是 `manifest.yaml`、`scripts/`、`views/`、`README.md`。`VERSION` 和 `registry.yaml` 不进包。

`name` / `description` 取自 manifest，`capabilities` 从 `tool:` 步和脚本里的 `ct.tool.call` / `ct.storage` 扫出来，`version` / `distUrl` / `sha256` 由打包脚本写进 `catalog.json`。改包之后跑构建，把生成的 `catalog.json` 一起提交。

## 发布

推到 `main` 后，[Release 工作流](.github/workflows/release.yml) 给每个包发一个**不可变** release：

```
tag:   <id>-v<version>
asset: <id>.flow
url:   https://github.com/flow-registry/flow-package/releases/download/<id>-v<version>/<id>.flow
```

zip 用 store（不压缩）且时间戳固定，sha256 可复现。tag 已存在但字节不同时工作流失败——改了包就必须改 `flows/<id>/VERSION`。

本地复现：

```
npm install --no-save js-yaml
node .github/scripts/validate-flows.mjs
node .github/scripts/build-flows.mjs
```

flow-registry 不手写官方条目：`node .github/scripts/sync-index.mjs` 把本仓库的 `catalog.json` 和那边的 `external-flows.json` 合成 `community-flows.json`。客户端安装的是 release 附件，不是这个 git 树，也不是 Pages 上的 `dist/`。
