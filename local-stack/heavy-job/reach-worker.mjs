import { request } from 'node:http'

const response = await new Promise((resolve, reject) => {
  request({ socketPath: '/run/endgame/worker.sock', path: '/llms.txt', headers: { host: 'localhost:1337' } }, resolve)
    .on('error', reject)
    .end()
})
response.resume()
console.log(`heavy-job: GET /llms.txt through the Worker socket answered ${response.statusCode}`)
process.exitCode = response.statusCode === 200 ? 0 : 1
