# PersonaBuddy

浏览器插件 + Web应用，基于用户规则对推荐内容进行 LLM 过滤与重排（知乎/B站/头条）。当前重点测试头条平台。

## 运行

### 后端 (Django, localhost:8000)

```bash
cd /Users/xinzijie/科研/小猪毕设/news_code_lyt

# 激活虚拟环境（注意 macOS 可能有 alias python=python3.13 覆盖 venv，用绝对路径更保险）
source .venv/bin/activate

# 首次或模型变更后执行
.venv/bin/python manage.py migrate

# 启动
.venv/bin/python manage.py runserver  # localhost:8000
```

LLM API 配置在 `agent/prompt/api.json`，需填入通义千问 API key。

### 前端 build（浏览器扩展）

```bash
cd /Users/xinzijie/科研/小猪毕设/news_code_lyt/my-profile-buddy-frontend

npm install   # 首次执行
npm run build # 生成 build/ 目录
```

### 加载浏览器扩展

1. Chrome -> `chrome://extensions/` -> 开启开发者模式
2. "加载已解压的扩展程序" -> 选择 `my-profile-buddy-frontend/build/` 目录
3. 已有扩展时点刷新按钮即可更新
4. 打开头条/知乎/B站页面验证效果

> 后端必须先启动，扩展才能正常工作。

## API 配置

`agent/prompt/api.json`:

```json
{
    "bailian": {
        "api": "sk-xxx",
        "model": "qwen-turbo",
        "dialog": "qwen-max"
    },
    "rah": {
        "update_interval_min": 15
    }
}
```

## References

- [DEVLOG.md](./DEVLOG.md) - 开发日志
- [CLAUDE.md](./CLAUDE.md) - 项目架构与关键文件索引
