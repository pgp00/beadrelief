# Pingdou 3MF

本地图片转拼豆质感 3D 打印工具。上传 JPG、PNG 或 WebP 后，应用会把图片转换为最多 4 种 AMS 颜色的可编辑圆形拼豆浮雕，并导出一个可在 Bambu Studio 中分配材料的分组 3MF。

图片、项目和 3MF 全部在浏览器本地处理，不会上传到服务器。

## 本地运行

需要 Node.js 20 或更新版本。

```bash
npm ci
npm run dev
```

打开：

```text
http://127.0.0.1:5174/
```

## 使用流程

1. 上传 JPG、PNG 或 WebP 图片。
2. 选择 1–4 个 AMS 颜色；可修改显示色和材料名称。
3. 调整最长边格数，默认 32，范围 8–50。
4. 用画笔、背景橡皮、填充、撤销和换色工具修整图案。
5. 调整格距、底板、浮雕和中心凹点尺寸，在右侧检查真实打印几何预览。
6. 修正面板中的尺寸错误后，点击“导出 AMS 分件 3MF”。

默认打印参数：

| 参数 | 默认值 |
| --- | ---: |
| 格距 | 5.0 mm |
| 底板厚度 | 1.2 mm |
| 拼豆浮雕高度 | 0.8 mm |
| 中心凹点直径 | 1.2 mm |
| 中心凹点深度 | 0.2 mm |

应用将 X/Y 限制为 250 mm，为 Bambu Lab P2S 的 256 × 256 mm 平台保留边界。

## Bambu Studio

1. 导入导出的 `.3mf`；Bambu Studio 会将它载入为一个对象的多个零件。
2. 选择 `Bambu Lab P2S`、`0.4 mm` 喷嘴和 `0.20 mm Standard` 工艺。
3. 若项目中只有一种耗材，先添加需要的 AMS 耗材槽位。
4. 在对象列表中给底板和各颜色零件分配槽位。3MF 内部名称为 `Base` 与 `Beads_<颜色名>`；当前 Bambu Studio 可能把第三方 3MF 的子零件显示为 `Pingdou`、`Pingdou_2` 等，可用选中高亮辨认。
5. `Base` 可以与其中一种拼豆颜色共用同一个 AMS 槽，因此最多只需要 4 种材料。
6. 切片并检查颜色预览；应用不会登录、上传或直接发送打印任务。

仓库内的固定验收样品是 [`samples/pingdou-p2s-sample.3mf`](samples/pingdou-p2s-sample.3mf)：5 个零件、4 种材料、20 × 20 × 2 mm。

## 验证

```bash
npm run verify
unzip -t samples/pingdou-p2s-sample.3mf
```

`npm run verify` 会构建应用、运行 Node 原生测试并重新生成固定 3MF 样品。

## 来源与许可

本项目基于 MIT 许可的 [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator)。固定上游提交及改动范围见 [UPSTREAM.md](UPSTREAM.md)，原始 [LICENSE](LICENSE) 保持不变。
