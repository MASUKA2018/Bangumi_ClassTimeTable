# 安全与密钥管理

本仓库公开的是 MIT 许可的客户端源码，不包含维护者的签名私钥、私钥密码、GitHub 令牌、bgm.wiki 令牌或用户的 Bangumi 登录令牌。

## 公钥可以公开，私钥不能公开

- `src-tauri/tauri.conf.json` 中的更新公钥用于验证官方更新，是公开信息。安装包的 `.sig` 文件同样可以公开。
- Tauri 更新签名私钥必须保存在仓库之外，或只放入 GitHub Actions Secrets。通过 `TAURI_SIGNING_PRIVATE_KEY` 和可选的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 提供给受信任的签名构建，不要写入源码、Issue、日志、构建产物或提交记录。
- `.gitignore` 忽略环境文件、签名目录和常见私钥文件，只保留不含秘密的 `.env.example`。忽略规则不能删除已经提交的秘密，发布前仍须检查 Git 历史。

## 构建与贡献

普通贡献者不需要维护者的私钥。验证客户端功能可以使用本地开发模式；构建不签更新的安装包时使用：

```bash
# Windows EXE（非官方签名更新包）
npm run desktop:build -- --bundles nsis --config src-tauri/tauri.unsigned.conf.json

# macOS 应用（必须在 Mac 上构建）
npm run desktop:build -- --bundles app --config src-tauri/tauri.unsigned.conf.json
```

自行发行的分支应使用自己的更新地址和自己的密钥对，不要索取官方私钥，也不要把自行构建的文件当作官方更新发布。公开 PR 不应接触维护者的 Secrets；签名和发布只应在审核过的受信任提交上进行。

## 服务令牌与个人数据

- `BGM_WIKI_TOKEN` 仅供配套数据仓库同步公开放送数据，使用 GitHub Actions Secrets 配置。用户运行客户端不需要这个令牌。
- Bangumi 个人令牌由用户自己在本机添加，不随源码或安装包发布。诊断问题时不要提交本机账号数据、含令牌的存储文件或浏览器导出。
- `VITE_*` 变量会进入前端构建，只能放公开配置，不能用来保存秘密。
- 公开 Issue 中不要贴密钥或令牌；若怀疑泄露，应先停止使用并撤销／轮换相关凭据。仅删除最新文件不能消除历史泄露。
