# conformance/

`.flow` 格式的语言无关断言集（FLOW_FORMAT v1 的第二个消费者视角）：

```text
valid/    # 合法包样本（或构造脚本 + 期望指纹段）
invalid/  # 拒例：zip-slip、超界、未知键、模块引用缺失、vendor.lock 双射破坏等
```

断言格式：`{input, expected: ok | reject:<规则>}`。

消费方：AssistBox Kotlin import gate（`flow/core`）、本仓构建脚本（`.github/scripts/`）、其他宿主实现。三方对同一 fixture 必须给出同一断言——「漂移防护靠 fixture 不靠共享源码」。

当前为骨架，随 FLOW_FORMAT v1 定稿与 `vendor/` 槽位落地补齐。
