# dsh-liquid-glass-theme

DSH Web 界面的液态玻璃皮肤：极光渐变背景 + 半透明玻璃表面，亮/暗双配色。

## 特性

- **全量 `--dsw-*` 令牌重映射**（21 个 × 亮/暗），纯标准 CSS，零哈希选择器
- **浮动输入框与交互卡片磨砂玻璃（`backdrop-filter`）**：为 `[data-composer-card]` 及交互浮层注入轻度高斯模糊（6px blur + 180% saturation），历史内容穿过输入框下方时被柔和虚化，消除字迹锐利重叠的同时保留极高的半透明通透与光影流动感
- 极光背景：`body` 渐变底 + `body::before` 固定光斑层，内容滚动时光斑不动
- 亮暗自动切换（主题展示器的 `body[data-ds-dark-theme]` 稳定属性）
- `bg-base` 的透明度按嵌套消费的复利校准（框架 + 会话根双层的组合透过率）

## 安装

```sh
dsh plugin --profile web add link:<本目录>
```

安装命令会自动把插件行加进 profile 的 bundle 栈，重启 profile 生效。

## 结构

```
package.json        # dsh.client 声明（./client 出口）
cordis.patch.yml    # bundle patch：insert 一条插件行
lib/index.js        # 宿主半（空 apply，仅为加载器占位）
lib/client.js       # 浏览器半：令牌表 + 极光样式，ctx.effect 生命周期挂载
```
