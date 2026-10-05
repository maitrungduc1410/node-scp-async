---
description: "把固件和配置文件复制到只支持 SCP 的路由器、交换机和专用设备，并介绍厂商差异、旧算法和常见错误的应对方法。"
---

# 路由器、交换机与专用设备

很多网络设备接受 SSH 登录，但只实现了一个很小的 SCP 服务器，用来传输固件和配置文件。没有 SFTP，往往也没有 shell，有时路径看起来像 `flash:image.bin`，而不是 Unix 路径。

## 直接用 SCP 连接 {#connect-with-scp-directly}

跳过 SFTP 探测，并给设备留出响应的时间：

```ts
import { connect } from 'node-scp';

await using device = await connect({
  host: '10.0.0.10',
  username: 'admin',
  password: process.env.DEVICE_PASSWORD,
  protocol: 'scp',
  readyTimeout: 30_000,
});

await device.upload('./firmware.bin', 'flash:firmware.bin');
await device.download('config.txt', './backup/config.txt');
```

主机后面的部分会原样传给设备，所以只要设备能识别，`flash:firmware.bin` 或 `bootflash:` 这类设备专用的名称都可以使用。只包含字母、数字和 `_@%+=:,./-` 的路径会不加引号直接发送，这正是没有 shell 的设备所期望的。

## 不同厂商的差异 {#things-that-differ-between-vendors}

- **先启用 SCP 服务器。** 很多设备出厂时是关闭的。例如 Cisco IOS 需要执行 `ip scp server enable`。
- **复制目录**（`recursive: true`）往往不受支持。请逐个复制文件。
- **保留时间**（`preserve: true`）会额外发送 `T` 记录，有些设备会拒绝。请不要开启。
- **旧算法。** 较老的设备只提供旧的加密算法或密钥交换算法。请通过 ssh2 的 `algorithms` 选项显式启用它们，例如：

  ```ts
  await connect({
    host: '10.0.0.10',
    username: 'admin',
    password,
    protocol: 'scp',
    algorithms: { kex: { append: ['diffie-hellman-group14-sha1'] } },
  });
  ```

- **Keyboard-interactive 登录。** 有些设备通过 keyboard-interactive 方式询问密码。设置 `tryKeyboard: true`，并在 `beforeConnect` 中应答：

  ```ts
  await connect({
    host,
    username,
    tryKeyboard: true,
    protocol: 'scp',
    beforeConnect: (ssh) =>
      ssh.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) =>
        finish(prompts.map(() => password)),
      ),
  });
  ```

## 出错时 {#when-something-fails}

| 错误 | 常见原因 |
| --- | --- |
| `ERR_SCP_UNAVAILABLE` | SCP 服务器被禁用，或者设备只允许 SFTP。 |
| `ERR_SCP_PROTOCOL` | 设备的响应不符合预期。试试去掉 `recursive` 和 `preserve`。 |
| `ERR_PERMISSION_DENIED` | 账号没有传输文件所需的权限级别。 |
| `ERR_TIMEOUT` | 设备接受登录的速度很慢；请调大 `readyTimeout`。 |

如果你的设备还需要别的支持，欢迎提交 issue，并附上设备型号和错误消息。
