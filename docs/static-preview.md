# 静态体验与开发暂停

当前业务开发停在V0.96。用户已于2026-10-18要求关闭每4小时持续开发任务、暂停后续开发，并授权将当前成果合并到main；本次只准备静态体验和发布工作流。

- [x] 关闭原持续开发任务，保留历史记录。
- [x] 生成35个菜单区域的虚构只读样例，电脑/手机和项目子目录验证通过。
- [ ] 合并当前开发分支到main。
- [ ] 发布可直接打开的静态体验地址。
- [ ] GitHub Pages首次启用（需要仓库所有者设置权限）。

## 能体验什么

保留当前工作台的真实HTML/CSS/JavaScript，显示由全新独立虚构数据库、现有服务端只读接口生成的快照。可进入体验、浏览各菜单列表、已收录客户详情和六个流程样例；退出再进入可用。不需要API服务器，不打包SQLite、WAL、密码哈希、登录Cookie或真实客户数据。

保存、上传、状态变更以及未收录的筛选/详情会明确提示只读，不会假装成功，也不会向后台提交。浏览器中的“进入体验”不是正式账号登录。完整保存、权限、并发与恢复试用需运行本地Node后端。

## GitHub Pages工作流

文件：`.github/workflows/pages.yml`。main有提交时自动构建，也可在Actions中手动运行“Workbench Pages preview”。构建在独立临时库初始化虚构样例、截取真实界面/API快照，并执行静态电脑/手机验证；通过后上传Pages artifact。

本次连接调用创建Pages站点接口返回403 `Resource not accessible by integration`，没有仓库Pages设置权限。GitHub官方configure-pages说明首次启用需要额外的管理员/Pages写权限，不能由默认GITHUB_TOKEN代办。因此未启用时只生成可验证的产物，部署步骤明确跳过。

所有者一次性打开：https://github.com/wenjinliuu/optical-workbench/settings/pages ，将Build and deployment → Source设为 **GitHub Actions**，再在Actions手动运行一次该工作流。后续main提交会自动发布；GitHub标准地址预计为https://wenjinliuu.github.io/optical-workbench/，实际以Actions的deployment输出为准。

## 本地生成同一静态站点

```sh
npm ci
npm install --no-save playwright@1.56.1
npx playwright install chromium
PLAYWRIGHT_MODULE_PATH="$PWD/node_modules/playwright/index.mjs" npm run build:pages
PLAYWRIGHT_MODULE_PATH="$PWD/node_modules/playwright/index.mjs" npm run test:pages-browser
python3 -m http.server 8080 --directory pages-dist
```

`pages-dist/`为生成产物，不提交Git。构建只使用新建临时虚构库，不读取开发者既有DATABASE_PATH；浏览器捕获阶段拒绝业务写入。具体暂停、合并与发布回执见handover及static-preview-release.json。
