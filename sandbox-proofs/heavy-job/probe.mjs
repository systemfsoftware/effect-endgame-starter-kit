import { lstat, readdir, readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { connect } from 'node:net'

const WORKER_SOCKET = '/run/endgame/worker.sock'
const UNWALKED = { '/proc': true, '/sys': true, '/dev': true }

const fetchWorker = () =>
  new Promise((resolve) => {
    request({ socketPath: WORKER_SOCKET, path: '/llms.txt', headers: { host: 'localhost' } }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }))
    })
      .on('error', (error) => resolve({ error: error.code ?? error.message }))
      .end()
  })

const reach = (address) =>
  new Promise((resolve) => {
    const separator = address.lastIndexOf(':')
    const socket = connect({ host: address.slice(0, separator), port: Number(address.slice(separator + 1)) })
    socket.on('connect', () => {
      socket.destroy()
      resolve('reached')
    })
    socket.on('error', (error) => resolve(error.code ?? error.message))
  })

const readOutcome = (path) => readFile(path, 'utf8').then(() => 'read', (error) => error.code ?? error.message)

const socketsUnder = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`
      if (UNWALKED[path]) return []
      const stats = await lstat(path).catch(() => undefined)
      if (stats?.isSocket()) return [path]
      if (stats?.isDirectory()) return socketsUnder(path)
      return []
    }),
  )
  return found.flat()
}

const targets = process.argv.slice(2)
const addresses = targets.filter((target) => target.startsWith('tcp:')).map((target) => target.slice(4))
const paths = targets.filter((target) => target.startsWith('path:')).map((target) => target.slice(5))

const report = {
  worker: await fetchWorker(),
  tcp: Object.fromEntries(await Promise.all(addresses.map(async (address) => [address, await reach(address)]))),
  paths: Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readOutcome(path)]))),
  sockets: (await socketsUnder('/')).sort(),
}
console.log(`HEAVY-JOB-REPORT ${JSON.stringify(report)}`)
