# Pingdou

在浏览器本地把任意图片转换为可编辑、多色 3MF 拼豆浮雕。

[打开在线演示](https://pgp00.github.io/pingdou/) · [下载爱心 3MF](samples/pingdou-heart-p2s.3mf) · [English](README.md)

<!-- RELEASE_GATE: replace the source preview below with docs/pingdou-workflow-hero.webp after real slice and print assets are supplied. -->
![Pingdou 爱心源图预览](samples/pingdou-heart-source.png)

- **本地处理：** 图片和生成文件留在浏览器中。
- **导出前可编辑：** 图片转换后仍可逐格修正。
- **分组 3MF：** 导出的零件可在 Bambu Studio 中分配材料。

## 60 秒快速开始

1. 打开[在线演示](https://pgp00.github.io/pingdou/)。
2. 上传 JPG、PNG 或 WebP 图片。
3. 选择最多四种颜色，按需编辑格子并检查 3D 浮雕预览。
4. 导出分组 3MF。

## Bambu Studio 三步

1. 将导出的 `.3mf` 导入 Bambu Studio。
2. 选择 Bambu Lab P2S 和 `0.4 mm` 喷嘴，然后手动为各零件分配耗材槽位。
3. 切片并在打印前检查颜色预览。

## 爱心样例

用同一个小爱心走完可编辑项目流程：

- [源 PNG](samples/pingdou-heart-source.png)
- [可编辑项目 JSON](samples/pingdou-heart-project.json)
- [分组 3MF](samples/pingdou-heart-p2s.3mf)

## P2S 发布验证

爱心样例尚未在真实 Bambu Studio GUI 会话中完成验证，也没有实体打印照片。导入、耗材分配、层高/工艺配置、预计时间、切片结果和实际打印用时都仍等待实测证据。详见[验证记录](docs/verification/bambu-studio-p2s.md)，其中列出了文件哈希和发布门槛状态。

目标环境：Bambu Studio `v02.08.02.61`、Bambu Lab P2S、`0.4 mm` 喷嘴。

如果 Pingdou 帮你做出了作品，点个 GitHub Star 可以帮助更多创作者发现它。

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
- 在 Bambu Studio 中必须手动分配耗材。

## 隐私

图片处理和生成文件都留在浏览器中；应用不会把它们上传到服务器。当前可编辑草稿可能保存在浏览器本地存储中，直到被替换或清除。

## 上游与许可

Pingdou 基于 MIT 许可的 [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator)。导入的提交和项目改动见 [UPSTREAM.md](UPSTREAM.md)。本仓库采用 [MIT License](LICENSE) 发布。

## 参与贡献

本地设置、验证命令和复现附件说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。
