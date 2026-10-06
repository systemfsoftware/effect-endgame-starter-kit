import { writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'

const [readyFile, secondSocket] = process.argv.slice(2)

const listening = (server, ...where) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(...where, resolve)
  })

const worker = createHttpServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('stand-in worker\n')
})
const otherPort = createServer((socket) => socket.end('other port\n'))
const otherSocket = createServer((socket) => socket.end('second socket\n'))

await listening(worker, 1337, '127.0.0.1')
await listening(otherPort, 3000, '127.0.0.1')
await listening(otherSocket, secondSocket)
await writeFile(readyFile, 'ready\n')
