<ServerPicker>
<template #linux>

```ts
await connect({ host: 'example.com', username: 'deploy', privateKey });
```

</template>
<template #sftp-only>

```ts
await connect({ host: 'files.example.com', username: 'upload', password });
```

</template>
<template #openwrt>

```ts
await connect({
  host: '192.168.1.1',
  username: 'root',
  password,
  protocol: 'scp', // bỏ qua bước dò SFTP
});
```

</template>
<template #device>

```ts
await connect({
  host: '10.0.0.10',
  username: 'admin',
  password,
  protocol: 'scp',
  readyTimeout: 30_000, // thiết bị đăng nhập chậm
});
```

</template>
<template #windows>

```ts
await connect({ host: 'win-build', username: 'ci', privateKey, remoteOs: 'win32' });
```

</template>
</ServerPicker>
