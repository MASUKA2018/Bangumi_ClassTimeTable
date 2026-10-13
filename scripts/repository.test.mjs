import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path) => readFileSync(path, 'utf8')
const repo = 'https://github.com/MASUKA2018/Bangumi_ClassTimeTable'

// These workflows use quoted paths and ordered positive/negative filters.
function eventPaths(workflow, event) {
  const block = workflow.split(`\n  ${event}:\n`)[1]?.split(/\n(?:  \w|\w)/)[0]
  if (!block) throw new Error(`Missing ${event} event`)
  return [...block.matchAll(/^      - "([^"]+)"$/gm)].map(match => match[1])
}

function selected(paths, filename) {
  let included = false
  for (const path of paths) {
    const negative = path.startsWith('!')
    const pattern = negative ? path.slice(1) : path
    const regex = '^' + pattern.split('**').map(part => part.split('*').map(segment => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$'
    if (new RegExp(regex).test(filename)) included = !negative
  }
  return included
}

describe('unified repository compatibility', () => {
  it('keeps existing clients on their original update endpoint and public key', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json'))
    expect(config.plugins.updater.endpoints).toEqual([`${repo}/releases/latest/download/latest.json`])
    expect(createHash('sha256').update(config.plugins.updater.pubkey).digest('hex')).toBe('5f77a0d23e04743f458618a67a6d53b292ebfb2c877e8aeadd2a811d43ab4e64')
    expect(config.identifier).toBe('com.bangumi.classtimetable')
    expect(config.version).toBe(JSON.parse(read('package.json')).version)
    expect(read('src/lib/merge.ts')).toContain('MASUKA2018/Bangumi_ClassTimeTable@main/public/data/enhance.json')
  })

  it('does not rebuild Windows or macOS for data-only commits', () => {
    for (const platform of ['windows', 'macos']) {
      const workflow = read(`.github/workflows/${platform}-client.yml`).replace(/\r\n/g, '\n')
      for (const event of ['push', 'pull_request']) {
        const paths = eventPaths(workflow, event)
        expect(paths.indexOf('!public/data/**')).toBeGreaterThan(paths.indexOf('public/**'))
        expect(selected(paths, 'public/data/enhance.json')).toBe(false)
        expect(selected(paths, 'public/data/season-202610.json')).toBe(false)
        expect(selected(paths, 'src/App.tsx')).toBe(true)
        expect(selected(paths, 'src-tauri/src/lib.rs')).toBe(true)
        expect(selected(paths, 'public/icon-512.png')).toBe(true)
        expect(selected(paths, 'README.md')).toBe(false)
      }
      expect(workflow).not.toContain('BGM_WIKI_TOKEN')
      expect(workflow).not.toContain('pull_request_target:')
      expect(workflow).toContain('contents: read')
    }
    const dataWorkflow = read('.github/workflows/refresh-data.yml')
    expect(dataWorkflow).toContain("cron: '20 22 * * *'")
    expect(dataWorkflow).toContain('secrets.BGM_WIKI_TOKEN')
    expect(dataWorkflow).not.toContain('gh workflow run')
    expect(dataWorkflow).not.toContain('npm run desktop')
    expect(dataWorkflow).not.toContain('TAURI_SIGNING_PRIVATE_KEY')
  })

  it('retains upstream attribution, unified feedback, and secret ignore rules', () => {
    const ignore = read('.gitignore').split(/\r?\n/)
    for (const rule of ['.env', '.env.*', '!.env.example', 'signing/', '*.key', '*.pem', '*.p12', '*.pfx']) expect(ignore).toContain(rule)
    expect(read('LICENSE')).toContain('Copyright (c) 2026 Miint-Sunny')
    const about = read('src/components/AboutModal.tsx')
    expect(about).toContain(`const REPO = '${repo}'`)
    expect(about).toContain("const UPSTREAM_REPO = 'https://github.com/Miint-Sunny/Bangumi_ClassTimeTable'")
  })
})
