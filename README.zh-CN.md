# BeadRelief

在浏览器本地把任意图片转换为可编辑、多色 3MF 拼豆浮雕。

[打开在线演示](https://pgp00.github.io/beadrelief/) · [下载爱心 3MF](samples/beadrelief-heart-p2s.3mf) · [English](README.md)

![BeadRelief 爱心源图预览](samples/beadrelief-heart-source.png)

- **本地处理：** 图片和生成文件留在浏览器中。
- **导出前可编辑：** 图片转换后仍可逐格修正。
- **分组 3MF：** 导出文件已包含 Bambu 项目耗材颜色和零件分配。

## 60 秒快速开始

1. 打开[在线演示](https://pgp00.github.io/beadrelief/)。
2. 上传 JPG、PNG 或 WebP 图片。
3. 选择最多四种颜色，按需编辑格子并检查 3D 浮雕预览。
4. 导出分组 3MF。

## Bambu Studio 三步

1. 将导出的 `.3mf` 导入 Bambu Studio。
2. 选择 Bambu Lab P2S 和 `0.4 mm` 喷嘴，检查文件中已包含的项目耗材颜色和零件分配；打印前确认它们对应实际 AMS 槽位。
3. 切片并在打印前检查颜色预览。

## 爱心样例

用同一个小爱心走完可编辑项目流程：

- [源 PNG](samples/beadrelief-heart-source.png)
- [可编辑项目 JSON](samples/beadrelief-heart-project.json)
- [分组 3MF](samples/beadrelief-heart-p2s.3mf)

## 验证状态

CI 会重新生成仓库内样例、检查每个 3MF，并验证文件内的项目耗材颜色和零件分配。当前爱心文件尚未完成实体打印，因此打印前仍需确认 AMS 槽位映射和切片预览。精确哈希与兼容性记录见 [Bambu Studio 验证](docs/verification/bambu-studio-p2s.md)。

如果 BeadRelief 帮你做出了作品，点个 GitHub Star 可以帮助更多创作者发现它。

## 本地运行

需要 Node.js 22.9 或更高版本。

```bash
npm ci
npm run dev
```

在浏览器打开 http://127.0.0.1:5174/。

## 已知限制

- Solid 模式导出一个分组浮雕；Layered 模式使用从底到顶的单一全局耗材顺序，不是 Bambu Studio Mixed Filament 元数据。
- 一个项目最多使用四种材料。
- 3MF 导出限制为 32 × 32 格。
- 导出文件已包含项目耗材颜色和零件分配；打印前请在 Bambu Studio 中确认实际 AMS 槽位映射。

## 隐私

图片处理和生成文件都留在浏览器中；应用不会把它们上传到服务器。当前可编辑草稿可能保存在浏览器本地存储中，直到被替换或清除。

## 上游与许可

BeadRelief 基于 MIT 许可的 [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator)。导入的提交和项目改动见 [UPSTREAM.md](UPSTREAM.md)。本仓库采用 [MIT License](LICENSE) 发布。

## 参与贡献

本地设置、验证命令和复现附件说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。
