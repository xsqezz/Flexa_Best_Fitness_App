import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('both builds fingerprint the actual catalogue contents in app and offline worker', () => {
  const source = readFileSync(join('app', 'public', 'data', 'polish-products.json'))
  const hash = createHash('sha256').update(source).digest('hex')
  for (const output of ['dist', 'dist-pages']) {
    const directory = join('app', output)
    assert.deepEqual(readFileSync(join(directory, 'data', 'polish-products.json')), source)
    const html = readFileSync(join(directory, 'index.html'), 'utf8')
    const entry = html.match(/assets\/([^" ]+\.js)/)?.[1]
    assert.ok(entry, `${output}: main script exists`)
    assert.ok(readFileSync(join(directory, 'assets', entry), 'utf8').includes(hash), `${output}: client uses content hash`)
    const worker = readFileSync(join(directory, 'sw.js'), 'utf8')
    assert.ok(worker.includes(`data/polish-products.json?v=${hash}`), `${output}: offline cache uses the same version`)
    assert.ok(worker.includes("path === 'data/polish-products.json' && url.searchParams.has('v')"))
  }
})
