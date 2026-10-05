import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseSync } from 'oxc-parser'

const [request, output] = process.argv.slice(2)
const { root, files } = JSON.parse(await readFile(request, 'utf8'))

const parsed = []
for (const file of files) {
  const source = await readFile(join(root, file), 'utf8')
  const result = parseSync(file, source)
  parsed.push({
    path: file,
    comments: result.comments.map((comment) => comment.value),
    errors: result.errors.length,
  })
}

await writeFile(output, JSON.stringify({ parser: 'oxc-parser', files: parsed }))
