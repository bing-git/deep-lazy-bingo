import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-evidence-'))
const scoped = [
  'src/personal-tools/local.ts',
  'src/personal-tools/vault-engine.ts',
  'src/personal-tools/vault.worker.ts',
  'src/personal-tools/vault.ts',
  'src/personal-tools/membership.ts',
  'src/personal-tools/membership-api.ts',
  'src/personal-tools/notes.ts',
  'src/personal-tools/content.ts',
  'src/personal-tools/markdown.ts',
  'src/personal-tools/session.ts',
  'src/views/personal-tools/memberships.vue',
  'src/views/personal-tools/vault.vue',
  'src/views/personal-tools/notes.vue',
  'src/components/core/forms/art-wang-editor/index.vue',
  'scripts/personal-tools.test.ts',
  'scripts/membership-sync.test.ts',
  'scripts/vault.test.ts',
  'src/modules/local.ts',
  'src/modules/workbench.ts',
  'src/modules/knowledge.ts',
  'src/modules/administration.ts',
  'src/components/business/ModuleShell.vue',
  'src/views/workspace/functional.vue',
  'src/views/learning/manage.vue',
  'src/views/knowledge/index.vue',
  'src/views/ai/workspace.vue',
  'src/views/services/index.vue',
  'src/views/family/index.vue',
  'scripts/modules.test.ts',
  'scripts/workbench.test.ts',
  'scripts/knowledge.test.ts',
  'scripts/administration.test.ts',
  'scripts/modules-integration.test.ts',
  'src/learning/core.ts',
  'src/learning/api.ts',
  'src/learning/speech.ts',
  'src/learning/english.ts',
  'src/ai/models.ts',
  'src/views/learning/EnglishPractice.vue',
  'src/views/ai/models.vue',
  'src/views/workspace/domain.vue',
  'src/components/business/AiSceneStatus.vue',
  'src/views/learning/library.vue',
  'src/health/core.ts',
  'src/health/catalog.ts',
  'src/views/health/index.vue',
  'src/config/family.ts',
  'src/config/preview.ts',
  'src/store/modules/worktab.ts',
  'src/main.ts',
  'src/router/modules/index.ts',
  'src/router/core/ComponentLoader.ts',
  'scripts/learning.test.ts',
  'scripts/english.test.ts',
  'scripts/ai-models.test.ts',
  'scripts/health.test.ts',
  'scripts/health-sources.test.ts',
  'scripts/health-sources.ts',
  'scripts/health-sync.ts',
  'scripts/family-shell.test.ts',
  'scripts/learning-connector.ts',
  'scripts/learning-check.ts',
  'vite.config.ts',
  'package.json'
]
const modes = process.argv.slice(2)
const fix = modes.includes('fix')
const commands: [string, string, string[]][] = [
  [
    'test',
    'tsx/dist/cli.mjs',
    [
      '--test',
      '--test-concurrency=1',
      'scripts/personal-tools.test.ts',
      'scripts/membership-sync.test.ts',
      'scripts/vault.test.ts',
      'scripts/family-shell.test.ts',
      'scripts/learning.test.ts',
      'scripts/health.test.ts',
      'scripts/health-sources.test.ts',
      'scripts/english.test.ts',
      'scripts/ai-models.test.ts',
      'scripts/modules.test.ts',
      'scripts/workbench.test.ts',
      'scripts/knowledge.test.ts',
      'scripts/administration.test.ts',
      'scripts/modules-integration.test.ts'
    ]
  ],
  ['typecheck', 'vue-tsc/bin/vue-tsc.js', ['--noEmit']],
  ['build', 'vite/bin/vite.js', ['build']],
  ['lint', 'eslint/bin/eslint.js', scoped.filter((file) => /\.(ts|vue)$/.test(file))],
  [
    'style',
    'stylelint/bin/stylelint.mjs',
    [
      ...(fix ? ['--fix'] : []),
      'src/views/personal-tools/memberships.vue',
      'src/views/personal-tools/vault.vue',
      'src/views/personal-tools/notes.vue',
      'src/components/core/forms/art-wang-editor/index.vue',
      'src/views/learning/library.vue',
      'src/views/health/index.vue',
      'src/views/learning/EnglishPractice.vue',
      'src/views/ai/models.vue',
      'src/views/workspace/domain.vue',
      'src/components/business/AiSceneStatus.vue',
      'src/components/business/ModuleShell.vue',
      'src/views/workspace/functional.vue',
      'src/views/learning/manage.vue',
      'src/views/knowledge/index.vue',
      'src/views/ai/workspace.vue',
      'src/views/services/index.vue',
      'src/views/family/index.vue'
    ]
  ],
  ['format', 'prettier/bin/prettier.cjs', [fix ? '--write' : '--check', ...scoped]]
]
const sha = (file: string) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, file)))
    .digest('hex')
const snapshot = () =>
  Object.fromEntries([...scoped, 'pnpm-lock.yaml'].map((file) => [file, sha(file)]))
const result = {
  startedAt: new Date().toISOString(),
  node: process.version,
  before: snapshot(),
  commands: [] as object[],
  sources: [] as object[],
  server: {} as object,
  after: {}
}
console.log(`EVIDENCE_DIRECTORY=${out}`)
let failed = false
if (modes.includes('textbooks')) {
  try {
    const { collectTextbooks } = await import('./learning-connector')
    const catalog = await collectTextbooks()
    result.sources.push({ id: 'textbooks', status: 'success', ...catalog })
    console.log(
      JSON.stringify(
        {
          fetchedAt: catalog.fetchedAt,
          version: catalog.version,
          officialCount: catalog.officialCount,
          matchedCount: catalog.matchedCount,
          returnedBooks: catalog.books.length,
          sample: catalog.books
            .slice(0, 8)
            .map(({ title, grade, edition, publisher, coverUrl }) => ({
              title,
              grade,
              edition,
              publisher,
              coverUrl
            }))
        },
        null,
        2
      )
    )
  } catch (issue) {
    failed = true
    result.sources.push({ id: 'textbooks', status: 'failed', error: String(issue) })
    console.error(String(issue))
  }
}
if (modes.includes('sources')) {
  const { collectSource, approvedSources } = await import('./learning-connector')
  for (const id of Object.keys(approvedSources)) {
    try {
      const rows = await collectSource(id)
      result.sources.push({
        id,
        url: approvedSources[id].url,
        status: rows.length ? 'success' : 'empty',
        count: rows.length,
        rows
      })
    } catch (issue) {
      result.sources.push({
        id,
        url: approvedSources[id].url,
        status: 'failed',
        error: issue instanceof Error ? issue.message : String(issue)
      })
    }
  }
  console.log(JSON.stringify(result.sources, null, 2))
}
if (modes.includes('server')) {
  try {
    const response = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(6000) })
    result.server = {
      status: response.status,
      html: (await response.text()).includes('/src/main.ts')
    }
  } catch (issue) {
    result.server = { error: issue instanceof Error ? issue.message : String(issue) }
  }
  console.log(JSON.stringify(result.server))
}
for (const [label, binary, args] of commands) {
  if (fix ? !['style', 'format'].includes(label) : modes.length && !modes.includes(label)) continue
  const command = [path.join(root, 'node_modules', binary), ...args]
  const run = spawnSync(process.execPath, command, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20_000_000
  })
  const log = path.join(out, `${label}.log`)
  fs.writeFileSync(
    log,
    `${run.stdout || ''}${run.stderr || ''}\nFINAL_EXIT=${run.status}\n${run.error || ''}`
  )
  result.commands.push({
    label,
    command: [process.execPath, ...command],
    exitCode: run.status,
    log
  })
  failed ||= run.status !== 0
  console.log(`${label}: FINAL_EXIT=${run.status} LOG=${log}`)
  console.log((run.stdout || '').split(/\r?\n/).slice(-12).join('\n'))
  if (run.stderr) console.log(run.stderr.slice(-4000))
}
result.after = snapshot()
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2))
console.log(`FINAL_EXIT=${failed ? 1 : 0} RESULTS=${path.join(out, 'results.json')}`)
process.exitCode = failed ? 1 : 0
