# wg-ui-plus 中文增强版

基于 [wg-ui-plus v2.0.11](https://github.com/vijaygill/wg-ui-plus/tree/v2.0.11)。增加了中文版客户端面板、逐节点实时速率、独立的流量重置、撤销待应用配置，以及节点级 DNS 设置和扫码预览。

## Docker Compose 部署

准备一台支持 WireGuard 的 Linux 主机，装好 Git、Docker Engine 和 Docker Compose 插件。拉取项目并复制配置模板。

```bash
git clone https://github.com/wenguge/wg-ui-plus-lan.git
cd wg-ui-plus-lan
cp .env.example .env
```

在 `.env` 里填写公网端点 `WG_HOST_NAME_EXTERNAL`（IP 或域名，无需协议和端口）、要保护的内网网段 `WG_LOCAL_NETWORKS`，并把 `openssl rand -hex 32` 的输出填入 `DJANGO_SECRET_KEY`。按需调整 UDP 端口和 VPN 网段，避免和已有子网重叠。

```bash
docker compose up -d --build
```

公网入站只需要放行配置中的 WireGuard UDP 端口。网页默认只监听服务器的回环地址，从管理电脑用已有 SSH 账号转发后打开面板。

```bash
ssh -N -L 8000:127.0.0.1:8000 user@your-server
```

打开 `http://127.0.0.1:8000/`，首次使用上游默认的 `admin` / `admin` 登录，并修改密码。若修改了 `WG_UI_PORT`，同步调整 SSH 转发的远端端口。

## 配置内网分流

1. 在「访问目标」添加要访问的主机、端口或网段。
2. 在「节点分组」创建访问组并选择目标，再为终端创建节点，选中相应分组。
3. 在节点编辑页选定客户端 DNS 和是否允许访问 VPN 服务端隧道地址。仅访问内网时，DNS 可沿用设备设置。
4. 点「应用更改」，核对二维码中的端点、路由和 DNS，再导入客户端。

若部署在云 VPS，VPS 到家庭设备还需要一条可达的路由。本文的 Compose 部署提供手机接入和管理面板。家庭网关、站点隧道与防火墙规则由安装者按自己的拓扑配置。部署前，可从容器检查它是否能连接你的实际目标端口。

## 保留数据

配置和数据库保存于 `config` 与 `data` 命名卷。升级前备份这两个卷。容器日志可用 `docker compose logs --tail 100 wireguard` 查看。
