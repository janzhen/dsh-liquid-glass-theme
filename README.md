# dsh-liquid-glass-theme

DSH Web 界面的液态玻璃皮肤：极光渐变背景 + 半透明玻璃表面，亮/暗双配色。

## 特性

- **全量 `--dsw-*` 令牌重映射**（22 个 × 亮/暗），纯标准 CSS，零哈希选择器
- **菜单与浮层跟随产品的通透**：rc.2 把公共菜单材料拆成了 `--dsw-menu-surface-fill`（`MenuSurface` 那层带 40px 模糊的 `.material` 画的填充），并让 `--dsw-specific-menu` 做它的别名 —— 这样一张菜单和**从菜单内部**借用同一个填充的元素（模型下拉的吸顶分组标题、触发菜单的底边渐隐）不会各说各话。只覆盖别名恰好把这条不变量打断：菜单吃产品的填充、那些条带吃我们的，条带于是在自己的菜单上显出一道接缝。现在两个令牌写同一个值、且用产品自己的别名拼写（`--dsw-specific-menu: var(--dsw-menu-surface-fill)`），取主题自己的色相、产品的 alpha（亮 0.58 / 暗 0.45），也就是**跟随产品的通透**而不是塞一个近不透明填充 —— 这在本主题里是安全的，因为这对令牌的每一个消费者都已经被产品自己的 40px 材料滤镜（`--dsw-menu-backdrop-filter`）虚化过背景。实测菜单栈最差正文对比度亮 **15.77** / 暗 **13.86**（`tools/aurora.mjs` 的「菜单 menu」栈，200 次构建），离 AA 4.5 很远；把同一栈换成产品自己的中性灰填充（`248,249,250,0.58` / `67,69,74,0.45`）量到的是亮 15.56 / 暗 10.27 —— 主题的深蓝更暗，所以在跟随通透的同时反而比产品原值更高。顺带把菜单拉进了卡片同一档通透度（输入卡 0.50、菜单 0.58/0.45），不再是一个近不透明的例外。darwin 桌面下产品会以 (0,1,2) 给「没有菜单底层」的浮层重新压回近不透明 —— 那是它的取舍，没动
- **浮动输入框与交互卡片磨砂玻璃（`backdrop-filter`）**：为输入框卡片（皮肤落在 `::before` 上，原因见下一条）及交互提示卡注入轻度高斯模糊（6px blur + 180% saturation），历史内容穿过输入框下方时被柔和虚化，消除字迹锐利重叠的同时保留极高的半透明通透与光影流动感
- **输入框那层磨砂画在 `::before` 上，不画在卡片上（踩过坑）**：容器上的 `backdrop-filter` 除过滤之外还有两个副作用 —— 它形成 **backdrop root**（把后代的 backdrop 收窄到容器内部画过的东西），并且成为 fixed/absolute 后代的**包含块**。输入框卡片两样都躲不开，因为它不是叶子：它承载 `conversation.input.overlay` 槽位，`/` 与 `@` 触发菜单就渲染在它内部（`MenuSurface` 的 `.surface` 内联渲染，只有 darwin 的 `.backing` 走 portal），而卡片自己的 Tooltip 气泡是视口坐标的 `position: fixed` 且 `portal` 默认为 false（线上 bundle 实测）。于是菜单自己的 `blur(40px)` 材料无从过滤：背景以 58% 填充的**透光率、原样清晰**地穿过菜单 —— `tools/menu-blur.mjs` 实测菜单区高频能量是未过滤背景的 **43%**（≈ 1−0.58），把材料的 blur 删掉数字一模一样；同时卡片内一个 `position: fixed` 探针落在卡片原点 **320,672** 而不是 `0,0`。把过滤移到 `::before` 后两个副作用都消失：卡片照旧磨砂（0.4%）、菜单恢复模糊（**2%**）、fixed 后代回到视口。填充仍留在卡片上（主题只虚化背景、不动产品令牌），所以伪元素自己不画底色 —— 它的 backdrop 里已经含了卡片填充，再画一遍等于叠两次；判定里有一行专门守这条（与"过滤挂在卡片上"的旧形状比卡片区均色，漂移 1.0）。`z-index: 0` 是承重而不是洁癖：卡片只是 `position: relative`、没有堆叠上下文，`z-index: -1` 的伪元素会跑进最近祖先堆叠上下文、被会话面板自己的 `bg-base` 盖住 —— 去掉它以后卡片区高频能量从 0.13 退回未过滤的 **15.24**，与"干脆没有过滤"那一行完全相同；`isolation: isolate` 也能定住层级，但它本身就是 backdrop root，正是要拆掉的东西。只改了输入框卡片：另外三个提示卡框架是静态元素、内部没有菜单也没有 fixed 后代，给它们上伪元素就得先把它们变成定位元素 —— 没有对应的 bug 就不做这个包含块变更
- **全屏右侧边栏整屏磨砂，画在伪元素上且只在真的展开时（踩过两个坑）**：右栏的 `fullscreen` 呈现铺满视口（`.panel` 绝对定位 `top: 0 / bottom: 0 / right: 0`、宽 `100vw`，dockkit 的 dock 层由 `--dsh-dockkit-dock-layer: 40` 抬起）并沿用 `bg-base` 的面板，而 `bg-base` 的 alpha 是按「框架 + 会话根」两层消费校准的 —— 这第三层大面积消费者压住的是**正文**，底下字迹会直接叠上来。只对该面板注入 `blur(16px) saturate(150%)`：全局通透度不动，被盖住的内容被虚化到不可读（`body [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]::before` 用 (0,1,1) 压过产物的 `.class` 规则，不依赖样式表注入顺序；`data-sidebar-right-panel` 与 `data-sidebar-right-open` 都是稳定产品钩子而非哈希类名）。
  **滤镜落在 `::before` 上而不是面板上（踩过坑，回归：最大化后输入框浮在面板之上）**：面板自己是 `position: absolute` + `z-index: auto`，它不是堆叠上下文 —— 压住对话的那一层来自它内部的 dockkit cell（`z-index: var(--dsh-dockkit-dock-layer)` = 40），而产品挑 40 正是因为会话的 composer seat 在**同一个**堆叠上下文里只有 `z-index: 7`（带触发菜单时 9）。`backdrop-filter` 挂在面板上会让面板本身变成堆叠上下文，里面的 cell 只能按面板自己的层级（`auto`，DOM 顺序）画，40 再也压不过 7，纸面于是落到输入框底下 —— 最大化之后输入框就浮在面板上方。挂到面板的 `::before` 上两个副作用一起消失：伪元素不把父元素变成堆叠上下文，也不做面板内 `position: fixed` 后代（dockkit 的浮动面板）的包含块；`z-index: var(--dsh-dockkit-dock-layer, 40)` 把产品自己的 dock 层读回来，于是磨砂和 cell 同层、只靠树序分先后（伪元素是面板的第一个子节点，纸面自己的文字照旧画在磨砂之上）。模糊本身没动，还是 16px/150%。实测（`tools/fullscreen-sheet.mjs`：真实 Chromium、产物自己的面板/dock/session 布局、极光 seed 7、亮暗双色）——被盖住的输入框卡片保留未遮挡时锐度的：挂面板 **100.8%（亮）/ 112.7%（暗）**，挂伪元素 **0.8% / 2.2%**；同一张表里产物自己的纸（不带磨砂）是 **65.4% / 74.1%**，也就是"盖住但字还清楚"的原状，作为仪表的灵敏度参照（差分锐度是比值，底下纸面的局部反差一变就会轻微越过 100%，"≥100%"读作"和没被盖住一样锐"）
  **`[data-sidebar-right-open]` 是承重而不是装饰**：面板元素整个会话都挂在 DOM 里，而「是不是全屏」不是「有没有展开」的函数 —— 产物按视口宽度推导它，`autoFullscreen = viewportWidth < 768`（`dsh-client-ui-sidebar-right`）。窄过 768px 时面板**关着**也是 `fullscreen`：一个铺满视口的**透明盒子**，产品只把它内部的 dock 子元素移出屏幕并 `visibility: hidden`。`backdrop-filter` 不需要自己的背景色就会过滤背后，于是裸钩子把整页糊了一遍 —— 真实 GUI、390×844、面板关闭（`aria-hidden="true"`、矩形 `0,0,390,844`、背景 `rgba(0,0,0,0)`）实测：对话正文的高频能量掉到未过滤时的 **1.8%**、左栏 **5.6%**、纯极光 **2.1%**，而输入框 **100.2%**、视图标签行 **93.5%** —— 它们画在这层之上，这正是那句「除了输入框全糊」的来历。产物本来就发布了正确的开关：`data-sidebar-right-open` 由 `expanded` 得到，正是它自己让那批子元素可见的条件，所以守卫跟的是「这张纸在显示」而不是「视口很窄」。收窄后同一处实测：关着的手机端正文回到未过滤的 **94.2%**、左栏 **100.1%**、输入框不变；桌面最大化照旧（1440×900 实测 `0,0,1440,900` 且带该属性，背后内容被压到 **2.3% / 14.8%**）；`push` 呈现不受影响（`1140,0,300,900`，`filter: none`）；手机把面板真正打开时也照旧（背后 **1.9%**）。一个明知的取舍：`expanded` 在关闭开始时立刻清掉，磨砂随关闭动画一起结束，而不是等它走完

- **改动文件 diff 悬停浮层磨砂**：改动文件卡片（turn tail）悬停某一行时弹出的对比浮层，是 `bg-layer-1` 的一张纸（亮 0.55 / 暗 0.40），而它浮在**这一轮对话的正文之上** —— 这个令牌是按「站在内容后面的面板」校准的，于是 diff 行和底下的正文字迹直接互相穿插，两层字叠着没法读。修法与全屏侧边栏同源：只虚化背景，令牌不动。12px 是实测曲线的拐点（真实 Chromium、极光 seed 7、亮暗双色、`tools/preview-glass.mjs`）：被盖住内容在卡片内的**最坏透出**从亮 2.84:1 / 暗 5.83:1 掉到 1.16 / 1.32；亮色下卡片背后极光的**大尺度变化**仍保留「无卡片」时的 51% 振幅 —— 卡片是半透明的，不是一块板子（暗色下那块背景本来就是平的，粗尺度 sd 只有 0.004，没有可透的结构，工具这里直接标 `flat`，而不是拿两个近零数相除给一个看着像结论的比值）；6px 还会把正文留成看得出笔画的糊影（1.35 / 1.75），20px 只多买 0.04（亮）/ 0.08（暗）的抑制、却要再让出 4 个点的极光。浮层自己的 diff 正文一点没动（最弱行类亮 3.1 / 暗 6.4，前后一致），因为 `backdrop-filter` 只画元素背后的东西。钩子用预览根上的稳定属性 `data-changes-hover-preview`，靠 `:has()` 反向选中原件 portal 到 `document.body` 的那张卡（那张卡的类名是构建哈希，产物自己的样式表也用这个写法：`:has(> [data-code-block-banner])`）；`body >` 前缀把规则钉死在 portal 出来的那张卡上 —— 光写 `:has()` 会连 `body` 一起匹配，等于把整个应用糊掉
- **极光背景**：`body` 渐变底 + `body::before` 固定光斑层，内容滚动时光斑不动
- **极光几何与色相每次加载重掷**：几何收敛到**一个旋钮** `TRAVEL`（0–1）—— 每个光斑在作色锚点 `at` 周围、按「满行程 `reach` × TRAVEL」取随机数，半径与淡出停点也按 TRAVEL 收缩（`TRAVEL = 0` 几何完全钉死、只剩色相变化，`= 1` 为满行程）。色相走**整体相干旋转**：`PALETTE_HUE` 一次滚出 ±30° 加到全部光斑，`BLOB_HUE` 再给每斑 ±7° 偏移，饱和度与亮度取自作色值、不参与旋转，alpha 与叠放顺序固定。亮暗共用同一次掷点，切主题不会重新洗牌。当前 `TRAVEL = 0.35`，实测相邻两次加载的逐点覆盖差 0.052（满行程 0.099、只换色 0）、光团质心位移 4.9% 视口（满行程 10.1%）、画面平均覆盖 0.066–0.110、死区 42%–67%（满行程为 0.030–0.128 与 29%–81%）—— 比满行程明显收敛，同时保住"色块真的会走位"。色相带宽由配色识别度而非对比度决定：配对实测（同几何、色相开/关，200 次构建）旋转对正文对比度平均中性（亮 100.7%、暗 98.7%，任何一层表面栈的均值位移都在 1.7% 以内），当前 ±30° 下最弱会话栈仍有暗 10.34 / 亮 11.06，离 WCAG AA 的 4.5 底线很远 —— 所以带宽是留给识别度的额度。限制它的是绿色：再宽一转，557.7 nm 的绿就滑向黄绿或青绿、630.0 nm 的红开始偏橙，越出这几条谱线所属的色域。只在"构建样式表"时掷一次，页面加载期间数值冻结 —— 没有任何动画
- **极光配色由真实谱线决定**：六个光斑是极光的高度分层，色相取自谱线而不是审美 —— 原子氧绿线 557.7 nm（100–200 km，最强辐射，占左侧重块、底部带与核心三行）、同一原子的红线 630.0/636.4 nm（要 ≥200 km 的稀薄高空才发得出来，落在两个上角）、N₂⁺ 第一负带 427.8 nm（电子能量高、位置低时帷幕下缘的蓝，占右侧重块）、以及 100 km 以下氧线被碰撞淬灭后只剩的氮即时辐射（右上与蓝相接的玫红边缘）。**权重同样跟着证据走**：绿行拿表里最高的 alpha（暗 0.70 / 0.58 / 0.40），红与玫红最低（0.40 / 0.36）—— 真实极光是绿帷幕加一层淡淡的红晕，而一块和互补的品红均分面积的柔光斑只会混成橄榄色。色相也不是照抄波长：屏幕再现单色谱线时会被叠在下面的层去饱和，所以作色的帷幕绿比 557.7 nm 的色相（~101°）高一点（118°，核心 104°），保证谱线本身仍落在 ±30° 的掷点范围内。亮色整份压淡（S 46–52 对暗色 62–66）：白昼极光本来就淡，同时避免亮色变成一整片绿野。亮度是唯一的对比度旋钮、alpha 不是：绿色在亮度上是最亮的色相，又同时拿着最高的 alpha 和最大的面积，所以暗色的三行绿被压在亮度轴下段（L 28 / 26 / 38，亮色是 44 / 46 / 52），而不是把这行调淡。压到哪由**两块重色块的实测配平**决定 —— 这正是这份配色一直没配平的地方：停在 L 42 / 40 / 52 时，暗色绿块合成后的亮度是对角蓝块的 **4.92 倍**（200 次构建，跨色相掷点 3.40–6.54），帷幕比屏幕上任何东西都亮；压到 L 28 / 26 / 38（−14 个亮度点）→ **2.26 倍**（1.56–2.99），蓝块读得出是平级的色块，而绿在任何一次掷点里都不会比蓝暗。再往下 1.73 倍（δ18）、1.24 倍（δ22）也量过，后者的掷点下界 0.85 已经翻到「蓝比绿亮」，等于把原来那个问题反过来，所以停在 2.26。压暗是抬高而不是压低底线：最弱会话栈暗 **10.34** / 亮 11.06、单纸暗 8.50 / 亮 8.96（压之前是 7.57 / 11.06 与 5.54 / 8.96）。亮色本来就平（1.10 倍，0.95–1.29），未动。覆盖 0.294 / 0.321、死区 0–3% 不变 —— `node tools/aurora.mjs measure` 会把两个配平值一并打出来。取舍讲清楚：这是"一眼认得出是极光"的取向 —— 暗色是绿帷幕配红晕，亮色是偏薄荷/淡玫的粉彩，并不中性。以上数字与配图的复现命令见「复现测量」
- **Trajectory 视图按「页面」而非「卡片」重新锚定表面层级**：Trajectory 标签页是产物里表面层级最深的消费者 —— 框架与会话根已经各画一层 `bg-base`，其上的视图根、记录表容器、记录表又各画一层 `bg-layer-1`。令牌是按「单张纸」而不是「整摞纸」校准的，五层叠起来覆盖率达到亮 96% / 暗 88%，极光只剩 3.9% / 11.8%（聊天区是 42.3% / 54.8%）—— 这就是那里看着跟没装主题一样的原因。修法不是逐层去压，而是在视图内重新锚定层级：视图根不再画纸（它本身就是内容区，和聊天消息列表一样），并把该子树里的 `bg-layer-1` 降到页面档。记录表于是只剩两层纸压在两层底之上，极光落到聊天区的三分之二（200 次构建：极光贡献量 mean ΔRGB 亮 4.7 / 暗 9.3，聊天区 7.0 / 13.9，改前 0.6 / 3.0），正文最差对比度仍远在 4.5 之上（最差一次构建亮 12.7 / 暗 8.7，改前那摞近乎不透明的纸是 16.7 / 12.8 —— 主题为根本用不到的对比度付了钱）。嵌套详情面板仍读得出层次（3.8 / 7.6 ΔRGB），行悬停与选中的半透明产物色照旧。`data-conversation-composer-overlay` 是产物为「请求浮层 composer」设的稳定钩子，只有 Trajectory 一个视图设置它（已跨全部已挂载客户端包核对过）；`body` 前缀 (0,1,1) 稳压视图自己的 `.class` (0,1,0)，与样式表注入顺序无关。副作用：轮次竖线与激活轮次标签的色值由 `color-mix(蓝 22%, bg-layer-1)` 得到，层级变薄后它们跟着变淡（亮 49.4 → 43.8 ΔRGB，保留 89%；暗保留 98%），仍在清晰可见的范围
- **Trajectory 的时间概览带同样降一档，但不成洞**：Overview 是视图里唯一的嵌套面，画布用的是 `bg-layer-2`（同一个令牌还被工具栏搜索框和记录类型气泡消费）。它按同一条规则再降一级 —— 落到记录表极光可见度的三分之二（透过率 19.0% / 24.7%，记录表是 28.4% / 36.8%），也就是在记录表之上再加 33% 覆盖，仍然读得出「一条带子」。带上时间条对 3:1 的图形对比度是 4.14 / 5.27
- **气泡必须只钉那一个（踩过坑）**：这个视图里的气泡来自共享 tooltip 原件 —— 原件画的是**深色气泡 + 白色文字**（`bg-tooltip-bg`），只有**记录类型**那一个气泡被视图自己换了面（`.kindSlot [role=tooltip]` 把它换成 `bg-layer-2` + `panel` 阴影 + `label-primary` 文字）。所以 `bg-layer-2` 降档后要钉回浮层档时，作用域必须收窄到那一个气泡：用 kind 标签上的稳定钩子 `[data-role-kind]`。只写 `[role=tooltip]` 会把浅色背景压到原件的白色文字底下 —— 亮色下白字对比度掉到 **1.02:1**（等于隐形），时间条与「加载更早」两个 tooltip 全部读不出来，这是已经发生并修掉的一次回归。收窄后原件气泡维持深色（白字对比 13.94 / 9.59），被换面的那个是 16.47 / 14.74，且仍遮挡 93.8% / 94.5% 的底下行
- 亮暗自动切换（主题展示器的 `body[data-ds-dark-theme]` 稳定属性）
- `bg-base` 的透明度按嵌套消费的复利校准（框架 + 会话根双层的组合透过率）

## 安装

```sh
dsh plugin --profile web add link:<本目录>
```

安装命令会自动把插件行加进 profile 的 bundle 栈，重启 profile 生效。

## 结构

```
package.json             # dsh.client 声明（./client 出口；playwright 只在 devDependencies）
cordis.patch.yml         # bundle patch：insert 一条插件行
lib/index.js             # 宿主半（空 apply，仅为加载器占位）
lib/client.js            # 浏览器半：令牌表 + 极光 + 玻璃表面 + diff 浮层 + Trajectory 表面处理，ctx.effect 生命周期挂载
tools/environment.mjs    # 三个浏览器工具共用的环境解析：驱动、浏览器、运行中的 dsh 安装，都不写死路径
tools/aurora.mjs         # 极光测量/渲染工具：加载真实 client 模块 → 求值产出的 CSS → 合成真实表面栈 → 对比度/覆盖数字 + PNG
tools/preview-glass.mjs  # diff 悬停浮层工具：真实 Chromium 里挂真实产物样式 + 真实 DOM → 透出/对比度/通透度数字 + 对照 PNG
tools/menu-blur.mjs      # 输入框磨砂守卫：真实 Chromium 里量容器上的 backdrop-filter 是否吃掉子菜单的模糊、是否平移 fixed 后代
tools/fullscreen-sheet.mjs # 全屏右侧边栏纸面工具：真实 Chromium 里拼产物自己的面板/dock/session 布局 → 量最大化后输入框是否仍被纸面盖住、磨砂是否还在 + 对照 PNG
```

## 复现测量

量测只用到 `playwright` 一个包，它落在 `devDependencies` 里，**发布产物仍然是零运行时依赖**：`npm pack` 出来的 tarball 只有 `package.json`、`cordis.patch.yml`、`lib/` 与 README 五个文件，装这个插件的人不会装到 Playwright。

```sh
npm i                                            # 驱动：仓库自己的 devDependency（playwright 1.55.0）
npx playwright install chromium-headless-shell   # 浏览器：约 190MB，进 Playwright 自己的缓存
```

驱动钉在 1.55.0 是 macOS 12 的唯一选择：Playwright 1.57 起改用 Chrome for Testing 构建、当前只支持 macOS 15+（14 条件支持），在 mac12 上装浏览器会直接报 `Playwright does not support chromium-headless-shell on mac12`。库和浏览器构建的版本不必一致（新版库能驱动旧构建，`chromium_headless_shell-1187` 就是 1.55.0 下的那一份），但 `npx playwright install` 用的是驱动自己的 revision，还会清掉不属于它的其他浏览器目录。更新系统或换机器后，把这条版本钉松开即可。

所有对比度、覆盖与配图都由 `tools/aurora.mjs` 产出，它不重写样式逻辑，而是把 `lib/client.js` 当作真实模块加载（假 `window.__ModuleLoader__` + 假 `document`），捕获 `apply()` 装上的样式表后自己求值：`body` 渐变 → 六个径向光斑（按 CSS 的叠放顺序自下而上）→ 令牌表里的表面栈。`Math.random` 被换成定种 PRNG，所以同一 `--seed` 下几何完全可复现。

```sh
# 每个表面栈的最差 / 平均对比度 + 覆盖与死区
node tools/aurora.mjs measure --builds=200

# 出一张配图：行 = 亮 / 暗，光斑几何由 --seed 定种
node tools/aurora.mjs render --seed=7 --sheets=bg-base,bg-base

# 色相掷点的中性度：把旋转钉成 0 再量一遍，与上面逐栈比均值
sed -e 's/const PALETTE_HUE = \[-30, 30\];/const PALETTE_HUE = [0, 0];/' \
    -e 's/const BLOB_HUE = \[-7, 7\];/const BLOB_HUE = [0, 0];/' lib/client.js > /tmp/nohue.js
node tools/aurora.mjs measure --file=/tmp/nohue.js --builds=200
```

表面栈按令牌消费方命名：`单纸 base×1` 在产物里不出现（`bg-base` 只被框架与会话根两层消费），列出来是诊断用；真正的地板是 `会话栈 base×2`。`菜单 menu` 那一栈消费的是产品自己的别名（`--dsw-specific-menu` → `--dsw-menu-surface-fill`），工具会解一层 `var()`，量到的是菜单材料真正合成出来的颜色，而不是某一处声明的字面量。

`backdrop-filter` 是合成器特性，算不出来，所以浮层那一项由 `tools/preview-glass.mjs` 在**真实无头 Chromium** 里量：它照样加载真实 client 模块取极光，同时把产物自己的样式表拼进来（静态 web CSS 里带着 HoverCard 的 `.preview` 规则，产物 bundle 里内联着 ChangedFiles/FileDiff 的模块 CSS），再按原件的算术摆好 portal 到 `document.body` 的那张卡 —— 24px 侧内缩、8px 锚点间距、420px 上限。每个状态截六张（原文 / 隐藏底字 / 隐藏 diff 字 / 文字全隐藏 / 整个 diff 体隐藏 / 无卡片），差值给出「透出」与「diff 自身对比度」，块均值给出极光还剩多少。

```sh
# 前后对照：列 = none（无规则）/ shipped（当前模块自己的 preview 表）
node tools/preview-glass.mjs --seed=7

# 选半径用的扫描：`--states` 会去掉模块自带的那张表，改用给它的声明
node tools/preview-glass.mjs --states="none|backdrop-filter:blur(6px) saturate(180%)|backdrop-filter:blur(12px) saturate(160%)|backdrop-filter:blur(20px) saturate(150%)"
```

工具都从**正在运行的 dsh 安装**解析产物包：profile 里依赖 `@deepseek-ai/dsh` 就从那里往下解析，否则沿 `$PATH` 找到 `dsh`、再用它自己的 package.json 解析（`$DSH_INSTALL` 可覆盖），所以量的是**正在跑的那一份**产物。不要改回从 profile 的扁平 `node_modules` 解析：两者不等价 —— 本机 `~/.my-dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-primitives` 是一条指向 npx 缓存的过期软链（0.1.0-rc.6，那个版本还没有 `MenuSurface`），照它量会量到一个远古菜单，这正是 `tools/menu-blur.mjs` 写完之后踩到的坑；它会把解析到的版本打印出来，便于核对。

驱动和浏览器同样不写死路径，三件事统一在 `tools/environment.mjs` 里：驱动先按包名 `import("playwright")`（Node 从工具文件所在目录解析，所以 `npm i` 装在仓库里就对，装全局或别处也不影响代码；`$PLAYWRIGHT` 可覆盖成任意实现或路径）；浏览器先看 `$CHROME_PATH`，否则去 Playwright 自己的缓存（`$PLAYWRIGHT_BROWSERS_PATH`，缺省 `~/Library/Caches/ms-playwright`）里按 `chrome-headless-shell-<arch>/…`、`chrome-mac/headless_shell`、`chrome-linux/headless_shell` 三种布局找，取最新 revision。缺东西时报的是"装什么、设哪个变量"，而不是某个别人机器上的绝对路径。

右侧边栏那一组数字量的是**真实 GUI**，不是上面那三个工具造的静态页：`playwright-cli` 开有头 Chromium，用带 token 的 URL 进本机 Web 会话（`http://127.0.0.1:3080/?token=…`），`resize 390 844` 切到手机视口，同一页截两张 —— 一张按当前模块的规则，一张把该面板的 `backdrop-filter` 用内联样式改成 `none` —— 再逐区算 `|dL/dx|` 均值。这一层只有真实合成器画得出来，而三个工具有各自的静态页面、都没有这条右栏；面板的开关也由产物自己驱动（`viewportWidth < 768` 触发 `autoFullscreen`），所以改一下窗口宽度就能同时量到关闭与打开两个状态，不需要真机。

输入框那一处由 `tools/menu-blur.mjs` 量，因为容器上 `backdrop-filter` 的两个副作用同样算不出来（合成器特性 + 包含块）。场景按真实结构搭：会话面板画 `bg-base`、卡片在面板内、`MenuSurface` 的 surface（`data-menu-material="translucent"`，类名是构建哈希）是卡片的 DOM 后代、一个 `position: fixed` 探针代表卡片内的 Tooltip 气泡；背景是 2px 条纹叠真实极光，指标是区域内的横向高频能量 —— 模糊生效时趋近 0，"背景原样穿过"时等于填充的透光率。0.2.1 起 MenuSurface 编译进 shell（`dsh-web-frontend/dist/assets/index-*.css`，primitives 包已不存在），工具不写死那些哈希、也不把规则抄进场景：它从 bundle 自己的常量里按角色（surface/material/backing/compact）取类名，再把静态表里命中这些类的规则挑出来 —— 与 `tools/fullscreen-sheet.mjs` 对 dockkit 的做法同源。

```sh
# 出货状态 + 五个对照：坑形（过滤挂卡片）、去掉堆叠上下文、去掉过滤、把菜单填充换成不透明的 0.94、删掉材料的 blur
node tools/menu-blur.mjs

# 换模块或换种子
node tools/menu-blur.mjs --file=lib/client.js --seed=7
```

它给出四行判定，出货行必须全过：卡片仍然磨砂、菜单恢复模糊、fixed 后代回到视口、卡片颜色与改动前一致（对照的是"过滤挂在卡片上"那一行，也就是要保留的那个观感）。六行对照落在 `.scratch/menu-blur-sheet.png`，顺序与表格相同。

判定看的是与未过滤能量的比值（阈值 10%），不是某个固定百分数：同一个 shape 在 0.2.0 上是卡片 0.4% / 菜单 2%，在 0.2.1-rc.2 上是 0.0% / 4%，而"过滤挂卡片"那一行两次都落在 43%（≈1−0.58，即填充自己的透光率）—— 恒等式的那一头比绝对值稳。

「谁盖住谁」这一问由 `tools/fullscreen-sheet.mjs` 量：它是堆叠上下文的事，算式算不出来，只能让真实合成器画。场景不是替身 —— 产物自己的面板（`panel` + `panelBody`）、dockkit 的 `surface`/`tabLayout`/`tabCell`/`tabHost`、会话壳（`root`/`body`/`scrollBody`/`composerHero`/输入卡）都取自**正在跑的 dsh 安装**的样式表与 CSS-module 映射（类名按角色查表，不写死构建哈希），输入卡的座位照产物自己的 `z-index: 7`、dock cell 照 `--dsh-dockkit-dock-layer: 40`，极光来自真实 client 模块的定种构建。指标是**差分锐度**：同一页拍两张，一张照常画对话的字，一张把这些字 `visibility: hidden`、但所有盒子照旧画，逐像素相减得到「对话自己贡献的像素」，再取这个差的平均 `|dL/dx|`。面板自己的文字在两张里一模一样、相减即消，所以这个数只描述被盖住的那一层；除以面板关着时的同一个数，就是「被盖住的内容还剩多少锐度」—— 浮在上面 ≈100%，盖住但没磨砂 ≈65%（纸面自己的透光率），磨砂后 ≈1%。

```sh
# 出货状态 + 四个对照：滤镜挂面板（回归形）、产物原样（没有本主题这张纸）、面板关着（锐度基准）、面板关着但去掉打开守卫
node tools/fullscreen-sheet.mjs

# 换模块、换种子、换配色（--dark 让 body 带 data-ds-dark-theme，极光几何不变、换另一套纸面 alpha）
node tools/fullscreen-sheet.mjs --file=lib/client.js --seed=7 --dark

# 试候选规则：注入的 --css 排在主题之后，可以先用 !important 卸掉出货那张纸再接自己的形状
node tools/fullscreen-sheet.mjs --css='body [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]::before{…}'
```

四项判定出货行必须全过：纸面盖住并磨掉了输入卡、盖住并磨掉了正文、仪表能区分「盖住」与「磨砂」（产物原样 65% 与回归形 100% 都必须明显锐）、打开守卫仍然承重（去掉它，关着的面板会把整页磨掉）。对照落在 `.scratch/fullscreen-sheet.png`，顺序与表格相同。这个工具和另外两个浏览器工具共用 `tools/environment.mjs` 的解析（见上），所以 `npm i` + 一条 `npx playwright install chromium-headless-shell` 之后，直接 `node tools/fullscreen-sheet.mjs` 就行，不必再导 `$PLAYWRIGHT` / `$CHROME_PATH`。
