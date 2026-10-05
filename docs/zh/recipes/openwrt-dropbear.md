---
description: "在没有 SFTP 的 OpenWrt 路由器和 Dropbear 上使用 node-scp：备份 /etc/config、推送配置文件、上传 sysupgrade 固件，并避开常见的坑。"
---

# OpenWrt 与 Dropbear

OpenWrt 路由器使用 Dropbear 作为 SSH 服务器。Dropbear 能运行 `scp`，但除非另外安装，否则没有 SFTP 服务器，所以大多数 SFTP 库都会报错 “Unable to start subsystem: sftp”。node-scp 会自动回退到 SCP。

## 备份配置 {#back-up-the-configuration}

```ts
import { download } from 'node-scp';

await download('root@192.168.1.1:/etc/config', `./backup/${Date.now()}`, {
  recursive: true,
  password: process.env.ROUTER_PASSWORD,
});
```

或者在 shell 中：

```sh
NODE_SCP_PASSWORD=secret npx node-scp -r root@192.168.1.1:/etc/config ./backup/
```

## 推送文件并应用 {#push-a-file-and-apply-it}

```ts
import { connect } from 'node-scp';

await using router = await connect({
  host: '192.168.1.1',
  username: 'root',
  password: process.env.ROUTER_PASSWORD,
});

await router.writeFile('/etc/config/wireless', wirelessConfig, { mode: 0o600 });

// 其他操作都通过 ssh2 客户端完成。
router.ssh.exec('wifi reload', (err, stream) => {
  if (err) throw err;
  stream.resume();
});
```

## 上传固件 {#upload-a-firmware-image}

固件文件很大，而 OpenWrt 上的 `/tmp` 是内存盘，也正是 `sysupgrade` 期望固件所在的位置：

```ts
await router.upload('./openwrt-sysupgrade.bin', '/tmp/sysupgrade.bin', {
  onProgress: (p) => process.stdout.write(`\r${Math.round((p.transferred / p.total!) * 100)}%`),
});
```

## 小贴士 {#tips}

- **远程父目录必须存在。** 递归上传会创建所复制内容内部的目录，但在 SCP 下，node-scp 无法创建目标路径中缺失的父目录。请上传到已存在的目录，或者先通过 `router.ssh.exec` 执行 `mkdir -p`。
- **跳过 SFTP 探测**：如果你清楚设备情况，可以设置 `protocol: 'scp'`。这样可以省去一次往返，也不会在路由器上留下一条日志。
- **用私钥代替密码。** 把你的公钥放进路由器上的 `/etc/dropbear/authorized_keys`，然后把 `privateKey` 传给 `connect`。
- **还是想用 SFTP？** 在路由器上安装 `openssh-sftp-server`（`opkg install openssh-sftp-server`，使用 apk 的版本则是 `apk add openssh-sftp-server`）。之后 node-scp 会自动选择 SFTP，`client.fs` 也随之可用。
- **旧版 Dropbear** 可能只提供旧的密钥交换算法。如果握手失败，可以通过 ssh2 的 `algorithms` 选项传入这些算法。
