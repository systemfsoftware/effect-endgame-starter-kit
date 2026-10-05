import { writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'

const [listen, readyFile, ...declared] = process.argv.slice(2)

const allowed = declared.map((entry) => {
  const [host, port = '443'] = entry.split(':')
  return { host: host.toLowerCase(), port: Number(port) }
})

const permits = (host, port) =>
  allowed.some((rule) =>
    rule.port === port && (rule.host === host || (rule.host.startsWith('*.') && host.endsWith(rule.host.slice(1))))
  )

const refuse = (socket, status) => {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
}

const server = createServer((client) => {
  client.once('data', (head) => {
    const line = head.toString('latin1').split('\r\n', 1)[0]
    const match = /^CONNECT ([^\s:]+):(\d+) HTTP\/1\.[01]$/.exec(line)
    if (match === null) return refuse(client, '405 Only CONNECT tunnels leave the sandbox')
    const host = match[1].toLowerCase()
    const port = Number(match[2])
    if (!permits(host, port)) {
      process.stderr.write(`sandbox: egress to ${host}:${port} refused (not declared)\n`)
      return refuse(client, '403 Egress not declared')
    }
    const upstream = connect(port, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', () => refuse(client, '502 Upstream unreachable'))
    client.on('error', () => upstream.destroy())
  })
})

const onListening = () => {
  const address = server.address()
  writeFileSync(readyFile, typeof address === 'string' ? address : `127.0.0.1:${address.port}`)
}

if (listen === 'tcp') server.listen(0, '127.0.0.1', onListening)
else server.listen(listen, onListening)
