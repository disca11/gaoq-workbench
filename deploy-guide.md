# 最短部署路径（你只需点几下）

> 代码我已经帮你 `git commit` 好了，配置（Render starter + 持久磁盘）也正确。
> 下面这 5 步里，需要**你本人**做的只有：过人机验证、生成 Token、绑信用卡、把验证码/地址发我。其余全自动。

---

## 第 1 步：注册 GitHub（约 1 分钟）
1. 打开 https://github.com/signup
2. 填：
   - 邮箱：**34282939@qq.com**
   - 密码：**Wb2026#Disca11**
   - 用户名：**disca11**
3. **手动过一下人机验证（CAPTCHA 拼图/复选框）** —— 这步机器过不去，得你点
4. GitHub 会给邮箱发 6 位验证码，去邮箱看后填回去 → 注册完成

## 第 2 步：生成 Token（用来推送代码）
1. 登录后打开 https://github.com/settings/tokens/new
2. Note 随便填（如 `workbench`）；Expiration 选 `90 days`
3. 权限里勾选 **repo**（把 repo 那一整组勾上）
4. 拉到底点 **Generate token**
5. **复制生成的 `ghp_xxx...` token**（只显示这一次，存好）

## 第 3 步：一键推送代码
1. 先在 GitHub 网页上点 **New repository** 建个空仓库（名字如 `gaoq-workbench`，公开/私有都行，**不要**勾 README）
2. 双击本目录的 **`deploy-helper.bat`**
3. 按提示输入：用户名(`disca11`)、仓库名、刚才复制的 token → 自动推送
4. 推送成功后，命令行会提示成功

## 第 4 步：注册 Render 并部署（约 2 分钟）
1. 打开 https://render.com → Sign Up，用 **34282939@qq.com** 注册（过邮箱验证）
2. 登录后点 **New → Blueprint**
3. 连接 GitHub，选中第 3 步推送的仓库
4. 确认配置：`plan: starter`、有持久磁盘 `/data` → 点 **Create**
5. **在 Render 绑定信用卡**（starter 必需，按页面提示填，不扣费只是验证）
6. 等 1–2 分钟，部署完拿到形如 `https://xxxx.onrender.com` 的地址

## 第 5 步：把地址发我
把拿到的 `xxxx.onrender.com` 地址发给我 → 我写进 `workbench-url.txt` → 你**双击 `install-desktop.bat`** 装好桌面版；手机扫安装弹窗里的码 / 添加到主屏幕即用。

---

### 你总共要做的：
- 注册 2 个账号（过人机验证）
- 生成 1 个 Token、复制粘贴
- 绑 1 张信用卡（Render，仅验证）
- 把验证码、最终地址发我

### 我已经做好的：
- 代码 `git commit` 就绪
- `render.yaml` 已配 starter + 持久磁盘
- `deploy-helper.bat` 一键推送
- 拿到地址后我写 `workbench-url.txt`，你双击即装
