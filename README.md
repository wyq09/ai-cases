# ai-cases

AI 生成案例集合 · 推送到 main 分支后由 GitHub Actions 自动部署到 [case.youyongai.com](https://case.youyongai.com)

首页：[index.html](./index.html) · 案例库入口

## 目录

| 案例 | 说明 | 访问 |
|------|------|------|
| [tibet-wild](./tibet-wild) | 荒原之上 · 藏南秘境 × 藏北无人区 · 私人自驾远征 PPT | https://case.youyongai.com/tibet-wild/ppt/ |

## 部署

- 服务器：175.178.188.217 · `/data/ai-cases`（rsync 同步，与仓库目录一致）
- Nginx 静态托管 + Let's Encrypt 证书（certbot.timer 自动续签，续签后自动 reload nginx）
- 流水线：[.github/workflows/deploy.yml](./.github/workflows/deploy.yml)
