import { FIXTURE, GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_TOKEN, ORIGIN, type World } from './harness.js'

const RELEASE_JSONC = `{
  "base": "main",
  "branch": "changeset-release/main",
  "changesetDir": ".changeset",
  "changelogDir": ".changeset/changelogs",
  "versioning": {
    "strategy": "surfaces",
    "manifest": "package.json",
    "changelog": "CHANGELOG.md",
    "surfaces": [
      { "kind": "json", "path": "packages/alpha/package.json" },
      { "kind": "json", "path": "packages/beta/package.json" }
    ]
  },
  "gate": { "strategy": "paths" },
  "pr": {
    "title": "chore(release): version packages",
    "body": "Consumes the pending .changeset intents."
  }
}
`

const ROOT_MANIFEST = `{
  "name": "@e2e/root",
  "private": true,
  "version": "1.0.0",
  "packageManager": "pnpm@11.25.0"
}
`

const WORKSPACE = `packages:
  - packages/*
`

const GITIGNORE = `node_modules/
`

const MEMBER_MANIFEST = (name: string): string =>
  `{
  "name": "${name}",
  "version": "1.0.0",
  "main": "index.js",
  "repository": { "type": "git", "url": "https://example.invalid/admin/fixture.git" }
}
`

const CHANGESET_README = `Intents live here: one markdown file per change, frontmatter naming
each package and its bump, body holding the one line a consumer reads.
`

export const MEMBERS = ['@e2e/alpha', '@e2e/beta'] as const

export const setupFixture = async (world: World): Promise<void> => {
  await world.must(`rm -rf ${FIXTURE} ${ORIGIN} && mkdir -p ${FIXTURE}/packages/alpha ${FIXTURE}/packages/beta`)
  await world.must(`mkdir -p ${FIXTURE}/.changeset/changelogs`)

  const [, name] = GITHUB_REPOSITORY.split('/')
  const seed = btoa('# fixture\n')
  await world.must(
    `curl -fsS -X POST -H 'Authorization: Bearer ${GITHUB_TOKEN}' ` +
      `-H 'content-type: application/json' -d '{"name":"${name}"}' ${GITHUB_API_URL}/user/repos`,
  )
  await world.must(
    `curl -fsS -X PUT -H 'Authorization: Bearer ${GITHUB_TOKEN}' ` +
      `-H 'content-type: application/json' ` +
      `-d '{"message":"chore: fixture","content":"${seed}"}' ` +
      `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/contents/README.md`,
  )

  await world.write(`${FIXTURE}/release.jsonc`, RELEASE_JSONC)
  await world.write(`${FIXTURE}/package.json`, ROOT_MANIFEST)
  await world.write(`${FIXTURE}/pnpm-workspace.yaml`, WORKSPACE)
  await world.write(`${FIXTURE}/.gitignore`, GITIGNORE)
  await world.write(`${FIXTURE}/.changeset/README.md`, CHANGESET_README)
  await world.write(`${FIXTURE}/CHANGELOG.md`, '# Changelog\n')

  for (const member of ['alpha', 'beta']) {
    await world.write(`${FIXTURE}/packages/${member}/package.json`, MEMBER_MANIFEST(`@e2e/${member}`))
    await world.write(`${FIXTURE}/packages/${member}/index.js`, `export const ${member} = 1\n`)
  }

  await world.must(
    [
      'git init -q -b main',
      'git config user.email e2e@example.invalid',
      'git config user.name e2e',
      'git config commit.gpgsign false',
      'git add -A',
      'git commit -q -m "chore: fixture"',
    ].join('\n'),
    { cwd: FIXTURE },
  )

  await world.must(`git init -q --bare ${ORIGIN}`)
  await world.must(
    [
      `git remote add origin ${ORIGIN}`,
      'git push -q -u origin main',
      ...MEMBERS.map((member) => `git tag "${member}@v1.0.0"`),
      'git push -q origin --tags',
    ].join('\n'),
    { cwd: FIXTURE },
  )

  await world.must('pnpm install --silent', { cwd: FIXTURE })
  await world.must('git add -A && git commit -q -m "chore: lockfile"', { cwd: FIXTURE })
}

export const headSha = async (world: World): Promise<string> =>
  (await world.must('git rev-parse HEAD', { cwd: FIXTURE })).stdout.trim()
