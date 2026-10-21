# 115-Jav

115 网盘一条龙：识别番号 → 刮削 → 在 115 上整理成 `演员/番号` → 生成 STRM（302 直链播放）→ 接入 Emby。

本项目 fork 自 [ppxb/miyabi](https://github.com/ppxb/miyabi)，在它的刮削、订阅、STRM 和 Emby 支持基础上，补上了 115 端的整理入库和一些日常使用上的改进。

## 相比 Miyabi 新增的功能

- **115 整理入库**：选一个「整理前」目录，新片放进去（包括离线下载完成的）会自动识别番号、刮削，移动到「整理后」目录的 `演员/番号/` 下，NFO 和封面图也一起放到 115。1–3 位演员用逗号连接，4 位以上进「多人作品」，没有演员进「未知演员」；识别失败的移到失败目录，空文件夹和垃圾文件删到 115 回收站。
- **整理页**：查看失败目录里的片子和原因，手动填番号重新整理；整理日志可按状态筛选。
- **演员目录合并**：找出同一演员不同写法的目录（简繁日、别名），在 115 上合并，NFO 里的演员名同步改掉，之后的新片自动进保留的目录。
- **本地 STRM 和 115 同结构**：导出目录同样是 `演员/番号/`，保留 `-C` 等后缀文件名，115 上挪动后本地跟着挪。
- **导入已有 NFO**：115 上已经有 NFO 的片子直接读取，不再重新刮削。
- **快速同步**：只扫有变化的目录，上千部片子几秒完成；开机时的 Emby 本地目录检查也会跳过没改动的片子。
- **媒体库搜索**：按番号、标题、演员搜索，只看中字，多种排序。
- **任务列表写清楚类型和用时**，设置页按功能分标签。

## 项目预览

![媒体库](./screenshots/ScreenShot_2026-09-19_131853_357.png)
![发现](./screenshots/ScreenShot_2026-09-19_132213_340.png)
![搜索](./screenshots/ScreenShot_2026-09-19_132227_063.png)
![设置](./screenshots/ScreenShot_2026-09-19_132249_331.png)

## Docker 部署

> \[!TIP]
> 您可以借助 AI 完成项目的部署，如果要对公网访问，请注意网络安全。

镜像（支持 amd64 / arm64）：

```text
ghcr.io/sonthyr/115-jav
```

[`deploy/docker-compose.example.yml`](./deploy/docker-compose.example.yml) 是一份 115-Jav + Emby 的完整示例，复制为 `docker-compose.yml`、改掉密码、Token 和 IP 即可使用。

### 1. 使用 Docker CLI 运行

请将 `/path/to/data` 替换为主机上的数据持久化目录，并将 `change-this-password` 替换为自定义密码：

```bash
docker run -d \
  --name miyabi \
  --restart unless-stopped \
  --security-opt no-new-privileges:true \
  -p 8080:8080 \
  -v /path/to/data:/app/data \
  -e MIYABI_ACCESS_PASSWORD='change-this-password' \
  -e MIYABI_PUBLIC_URL='http://<宿主机IP>:8080' \
  -e MIYABI_STRM_TOKEN='change-this-token' \
  ghcr.io/sonthyr/115-jav:latest
```

> [!NOTE]
> 如果配合 Emby 使用，生成的 STRM 播放直链与元数据默认输出在 `/app/data/emby`（对应宿主机目录 `/path/to/data/emby`）。您可将该目录挂载至 Emby 容器作为媒体库。

### 2. 使用 Docker Compose（推荐）

创建 `docker-compose.yml` 文件：

```yaml
services:
  miyabi:
    image: ghcr.io/sonthyr/115-jav:latest
    container_name: miyabi
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    ports:
      - "8080:8080"
    volumes:
      - /path/to/data:/app/data
    environment:
      - MIYABI_ACCESS_PASSWORD=change-this-password
      - MIYABI_PUBLIC_URL=http://<宿主机IP>:8080
      # 开了访问密码时必须设置，Emby 播放 STRM 时用它鉴权
      - MIYABI_STRM_TOKEN=change-this-token
      # 可选：直接通过环境变量预设 Emby 集成（也可启动后在 Web 设置页中配置）
      # - MIYABI_EMBY_ENABLED=true
      # - MIYABI_EMBY_SERVER_URL=http://<Emby_IP>:8096
      # - MIYABI_EMBY_API_KEY=your-emby-api-key
      # - MIYABI_EMBY_MEDIA_PATH=/media
```

执行启动：

```bash
docker compose up -d
```

启动后访问 `http://<服务器IP>:8080`。

查看日志：

```bash
docker logs -f miyabi
```

### 升级镜像

升级时先拉取新镜像，再重新创建容器：

```bash
docker pull ghcr.io/sonthyr/115-jav:latest
docker stop miyabi
docker rm miyabi
```

然后重新执行 `docker run` 命令（或在 Compose 目录下执行 `docker compose up -d`），沿用原访问密码和数据目录。

## 启动配置

启动配置统一使用环境变量，未设置时采用默认值。监听地址与数据目录显式设为空时会报错。

通过 `MIYABI_ACCESS_PASSWORD` 配置访问密码。未配置密码或将密码设为空时关闭门禁。**强烈建议您开启门禁**。

| 环境变量                 | 用途                                                  | 默认值                                        |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| `MIYABI_ACCESS_PASSWORD` | Web 入口访问密码                                      | 空，关闭门禁（强烈建议配置）                  |
| `MIYABI_PUBLIC_URL`      | 外部访问 Miyabi 的根地址，用于生成 STRM 播放直链      | 默认根据监听端口推导                          |
| `MIYABI_LISTEN`          | HTTP 监听地址                                         | `:8080`                                       |
| `MIYABI_DATA_DIR`        | SQLite 与图片缓存目录                                 | 容器内为 `/app/data`，二进制为 `./data`       |
| `MIYABI_EMBY_DIR`        | STRM 与媒体导出目录                                   | `$MIYABI_DATA_DIR/emby`                       |
| `MIYABI_EMBY_ENABLED`    | 是否启用 Emby 集成通知刷新                            | 配置了服务器或密钥时自动为 `true`             |
| `MIYABI_EMBY_SERVER_URL` | Emby 服务器访问地址（如 `http://192.168.1.100:8096`） | 空，可在 Web 界面动态配置                     |
| `MIYABI_EMBY_API_KEY`    | Emby API 密钥（在 Emby「高级」→「API 密钥」中生成）   | 空，可在 Web 界面动态配置                     |
| `MIYABI_EMBY_MEDIA_PATH` | Emby 容器内挂载的媒体库路径（如 `/media`）            | 空（默认使用本地路径），可在 Web 界面动态配置 |
| `MIYABI_STRM_TOKEN`      | STRM 播放直链访问鉴权 Token（开了访问密码时需要设置） | 空，未启用 Token 鉴权                         |

> [!TIP]
> Emby 相关配置（服务器地址、API Key、媒体库路径等）除通过环境变量在容器初始化时配置外，也可以在服务启动后随时通过 Web 界面「设置」→「Emby」中进行可视化配置与连通性测试。

## NSFW 警告

本软件可能存在裸露、暴力、色情或冒犯等不适宜公众场合的内容，请勿在公共场合使用本软件，避免不必要的纷争。

## 特别鸣谢

感谢 [ppxb/miyabi](https://github.com/ppxb/miyabi) 及其作者，本项目的大部分功能来自 Miyabi。以下是 Miyabi 原有的鸣谢：

感谢 [莫愁](https://github.com/zk020106) 的 token，感谢 [老罗](https://github.com/luoqiz) 的115账号。

## 致谢

本项目参考了以下项目的部分实现，在此表示衷心的感谢！

- [javdb-cli](https://github.com/FlanChanXwO/javdb-cli)

同时感谢社区 [LinuxDO](https://linux.do) 的帮助。

## 免责声明

本项目仅供学习、研究和技术交流使用。项目作者与任何第三方服务、原始应用或内容提供方无关。
使用者应自行遵守当地法律法规以及相关服务条款。因使用本项目产生的任何法律、版权、账号、数据或财务风险均由使用者自行承担。

## License

与上游 Miyabi 相同，遵循 [GNU GPL v3](./LICENSE) 协议。
