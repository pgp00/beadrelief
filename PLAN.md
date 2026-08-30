# BeadRelief 稳定版实施计划

> 审计日期：2026-08-29
> 当前定位：可用 Alpha。当前没有线上故障级 P0，但离“可以放心交给用户打印”的稳定版，只剩 Bambu 切片/打印契约和实机验证。

## 当前基线

已验证：

- 构建通过。
- 106/106 自动测试通过。
- `npm audit` 为 0 个已知漏洞。
- 三个样例 SHA-256 与验证文档一致。
- GitHub Pages 当前构建成功。
- 现有 3MF 测试覆盖闭合网格、退化三角形、颜色映射和样例确定性。

当前测试证明代码按现有定义工作，但还没有证明最终 3MF 一定按 UI 承诺的方式被 Bambu Studio 切片并打印。

## 稳定版发布阻断项

### 1. Layered 0.08 mm 元数据已写入，仍待当前 Bambu 实切确认

分层模型按照 `0.08 mm × 每种耗材 4 层` 生成，且 [`src/print/threeMf.ts`](src/print/threeMf.ts) 已只为 Layered 写入普通层高和首层高度。自动测试能确认元数据存在，但不能证明当前 Bambu Studio 一定采用，因此仍保留外部实切门槛。

处理：

- [ ] 用当前 Bambu Studio 创建一份最小参考工程，确认真正生效的配置键。
- [x] 只对 Layered 3MF 写入 `0.08` 普通层高和首层高度。
- [x] Solid 模式不覆盖用户层高。
- [x] 在实切验证完成前把 Layered 标成实验功能。
- [ ] 如果精简 3MF 无法让 Bambu 接受这些参数，则加入必要的 process 配置。

验收：

- 单测解析 3MF 配置并检查两个 `0.08`。
- Bambu Studio 实际切片确认每色恰好 4 层、3 次换色、色带边界正确。

### 2. 打印参数可以绕过 UI 限制

[`src/PrintSettingsPanel.tsx`](src/PrintSettingsPanel.tsx) 定义了最小/最大值，但输入写入和 [`src/print/validation.ts`](src/print/validation.ts) 没有统一检查。直接导入 JSON 可以使用超界参数并成功导出。

处理：

- [x] 把现有范围放到唯一共享校验入口。
- [x] UI 输入负责规范化，最终模型和导出仍独立验证。
- [x] 覆盖五个打印参数及参数间关系。
- [x] 明确 32×32 和 50×50 的产品契约：暂时将 3MF 限制在 32×32，33–50 明确标注“仅 2D 导出”。

### 3. JSON 导入的类型守卫不安全

[`src/project.ts`](src/project.ts) 目前只浅查尺寸、cells 和 layer 数量。`layers: [null]`、非数组 `amsColors`、数字材料名称、重复 layer ID、非法 opacity、board size 和 `beadsPerPack: 0` 都可能穿过检查。

处理：

- [x] 不引入 schema 框架，使用小型 `isRecord`、数组和枚举检查。
- [x] 让 `normalizeProject` 接受 `unknown`，集中完成类型检查、范围限制和唯一 ID 生成。
- [x] 导入失败时保留当前项目、undo/redo 和草稿。
- [x] Solid 模式遇到未知颜色 ID 时阻止导出，不能静默替换为底色。
- [x] 拒绝 NaN/Infinity 顶点和 XML 1.0 非法控制字符。

验收：所有异常输入都得到可理解错误，且不能生成 validator 自称有效、实际不可解析的 3MF。

### 4. 用户可能导出旧模型

图片生成有防抖延迟和异步转换，但 [`src/App.tsx`](src/App.tsx) 的导出按钮没有完整绑定 scheduled/running 状态。因此新图片仍在生成时，用户可能下载上一个模型。

处理：

- [x] 用统一的“内容正在更新”状态覆盖防抖等待和实际生成。
- [x] 在新项目提交前禁用所有依赖内容的导出，并在 handler 再次检查 scheduled/running 状态。
- [x] 增加 scheduled/running 导出门禁与项目替换回归测试。
- [x] 让 “Replace project” 真正创建新的单层项目；如需导入到当前层，以后再提供独立入口。

### 5. 缺少真实黄金路径

现有 UI 测试 [`tests/task-5-ui.test.mjs`](tests/task-5-ui.test.mjs) 主要匹配源码字符串，不会真的启动浏览器。样例生成脚本也是手工网格，没有覆盖“PNG → 转换 → 编辑 → 3MF”。

处理：

- [x] 从 [`src/imageToBeads.ts`](src/imageToBeads.ts) 只提取纯 RGBA → bead grid 核心。
- [x] 使用微型透明、半透明和白底测试图验证转换。
- [x] 增加一条 Chrome E2E：上传 heart PNG → 生成 → 修改一格 → 预览 → 下载 JSON/PNG/PDF/XLSX/3MF。
- [x] 检查浏览器无 console error、文件 magic、ZIP 必需条目、3MF XML 和 XLSX 工作表。
- [x] CI 暂时只跑一个 Chrome，不增加浏览器矩阵和覆盖率平台。

## 分阶段实施

### Phase 0：确定产品契约（0.5 天）

- [x] 3MF 最大尺寸暂定 32×32。
- [x] Replace 表示真正替换整个项目。
- [x] Solo 只影响视图，不隐式影响打印范围。
- [x] Layered 在完成切片验证前标记 Experimental。

完成标准：README、UI 文案和代码行为只有一个解释。

### Phase 1：打印安全与输入边界（2–3 天）

- [x] 集中校验打印参数范围。
- [x] Layered 写入 0.08 mm 配置；是否被 Bambu 采用仍待外部验收。
- [x] 收紧 JSON 导入、唯一 layer ID 和未知颜色处理。
- [x] 检查有限坐标、网格尺寸和 XML 合法字符。
- [x] 生成期间阻止导出。
- [x] 修正 Replace 行为。
- [x] 达到图层上限时禁用新增/复制并给出提示，不能静默截断。

完成标准：所有异常输入都得到明确错误，不能生成损坏的 3MF。

### Phase 2：状态和导出一致性（1.5–2 天）

- [x] Layered XLSX 使用现有 `summarizeLayeredUsage`，输出 AMS 顺序和 layer cells，不伪造重量/包数。
- [x] 自定义 AMS 名称在 UI、XLSX、3MF 中保持一致。
- [x] 修复 Excel sheet 名大小写冲突、首尾 `'` 和 `History`。
- [x] `project.name` 成为唯一项目名来源，所有文件名和标题复用它。
- [x] AMS 修改纳入一次性 Undo，避免颜色拖动产生大量历史记录。
- [x] New、Import、Replace 共用一个小型 session reset，清除旧参考图、剪贴板、工具状态和昵称。
- [x] Solo 不再修改真实 `layer.visible`，导出范围单独明确。
- [x] 隐藏层不可盲编辑。
- [x] 锁定层选择图片时明确拒绝，或在解锁后自动继续。
- [x] 缩小画布会裁剪非空内容时要求确认，Undo 能恢复。

### Phase 3：浏览器和导出测试（1–2 天）

- [x] 增加纯图片转换测试，包括透明边缘、白底合成、NaN 参数和 JPG MIME 别名。
- [x] 增加 PNG/PDF/XLSX/3MF 结构测试。
- [x] 增加一条真实 Chrome/Chromium 黄金路径。
- [x] 对导入失败、异步生成竞争、双层 Replace、Solo 导出范围加入回归测试。

完成标准：106 个测试全部通过；CI 缺少 Chrome/Chromium 时明确失败，不能静默跳过主流程。

### Phase 4：性能（1.5–2 天）

当前实测：

- 32×32 Solid 3MF：约 24.5 MB、1.24 秒、RSS 约 268 MB。
- 32×32 满 Layered：约 49 MB、2.36 秒、RSS 约 307 MB。
- 原生 raw-DEFLATE 已用于实际下载；32×32 满 Layered 实测 4.38 MB，构模约 91 ms，总压缩约 1.67 秒。

按收益排序：

1. [x] 编辑时不重建完整 24 段打印模型；空闲后预览，导出时才建全精度模型。
2. [x] autosave 防抖。
3. [x] Three.js 按模型、相机或尺寸变化渲染，停止永久 RAF。
4. [x] topology 直接索引，去掉每三角形 `slice()`；复用已有查表 CRC。
5. [x] 验证浏览器原生压缩能产出 ZIP 所需 raw-DEFLATE，不增加 ZIP 依赖。
6. [x] 图片选择增加 25 MB 字节上限和一亿像素解码上限，工作画布最长边保持 4096。
7. [x] 生产构建复制 minified Three 文件，关闭不需要的生产 source map。

目标：

- [x] 50×50 连续绘制不因每个 pointer event 重建完整模型。
- [x] Chromium `PerformanceObserver` 回归测试确认连续编辑没有超过 50 ms 的长任务。
- [x] 32×32 满 Layered 3MF 为 4.38 MB，并显示明确的构建/压缩进度。

### Phase 5：可用性和无障碍（2–3 天）

- [x] 1366×768 下工具栏可滚动，所有工具可访问。
- [x] README 明确桌面优先和 980 px 最小完整工作区宽度。
- [x] Canvas 增加焦点、方向键、Space/Enter 绘制、Delete 擦除和坐标状态。
- [x] 图层选择改为真正的按钮，提供非拖拽的上移/下移。
- [x] 3D 预览使用原生 `<dialog>`，支持 Escape、焦点恢复和 WebGL 失败提示。
- [x] 忽略非 primary multi-pointer。
- [x] 修正 reference opacity 的反向显示。
- [x] keep-background 模式隐藏无效的容差控件。
- [x] 错误信息使用稳定错误码，在 UI 层翻译，避免混合中英文导出内容。

### Phase 6：切片和实物（跳过，等待设备）

- [ ] 使用当前样例哈希，在固定版本 Bambu Studio/P2S/0.4 mm 中重新导入和切片。
- [ ] 至少打印一个 Solid heart；最好再打印 Layered。未打印 Layered 就继续标记 Experimental。
- [ ] 保存 Bambu 版本、设置、截图、照片、尺寸和结果到 [`docs/verification/bambu-studio-p2s.md`](docs/verification/bambu-studio-p2s.md)。

### Phase 7：工程和发布准备

- [x] CI 权限最小化：build 只需 `contents: read`，Pages/OIDC 只给 deploy job。
- [x] 对齐 React 18 与类型版本，把 TypeScript 和 `@types/three` 放回 devDependencies。
- [x] 删除重复的 TypeScript 构建步骤和双重 HTML 来源。
- [x] 增加 `.gitattributes`，固定样例 JSON 为 LF，避免 Windows 假脏和哈希漂移。
- [x] 增加 `SECURITY.md`、bug/export issue 模板。
- [x] 增加 `release:prepare` 和受 CI 检查的 `SHA256SUMS`。

实际创建 `v0.1.0` tag 和 GitHub Release 只在干净提交上执行，不对当前未提交工作树打标签。

## 暂时不做

- 不重写 `App.tsx`，不引入状态管理框架。
- 不迁移 Vite。
- 不增加后端、账号、云同步、PWA 或分析平台。
- 不一次性加入 ESLint、Prettier、CodeQL、覆盖率和多浏览器矩阵。
- 在没有性能和实物证据前，不把 3MF 上限从 32 提到 50。

## 预计排期

- 内部 Alpha 补到 Phase 3：约 5–7 个开发日。
- 公开稳定版完成全部阶段：约 10–14 个开发日，另加切片和实物打印时间。
