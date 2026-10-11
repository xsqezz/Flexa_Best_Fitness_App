import { test, expect } from '@playwright/test'
import { openAdd } from './add'
import { expandedCatalogExample } from './catalog-fixture'

test.use({ serviceWorkers: 'allow' })

test('the app is installable and the demo opens offline after the first visit', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Service worker behaviour does not depend on the viewport.')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json() as {
    name: string; start_url: string; display: string; icons: { src: string; sizes: string; purpose: string }[]; shortcuts: { url: string }[]
  }
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('./')
  expect(manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`)).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
  expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toContain('./plan')
  for (const icon of manifest.icons) expect((await page.request.get(`/${icon.src}`)).ok()).toBe(true)

  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: 'Cele', level: 1, exact: true })).toBeVisible()
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const shell = names.find((name) => name.startsWith('flexa-shell-'))
    return shell ? (await (await caches.open(shell)).keys()).map((request) => new URL(request.url).pathname) : []
  })
  expect(cached).toContain('/')
  expect(cached.some((path) => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(true)

  await context.setOffline(true)
  await page.goto('/meals')
  await expect(page.getByRole('heading', { name: 'Posiłki', exact: true })).toBeVisible()
  await context.setOffline(false)
})

test('the worker never caches account data or API calls', async ({ page }) => {
  const source = await (await page.request.get('/sw.js')).text()
  expect(source).not.toContain('__VERSION__')
  expect(source).not.toContain('__ASSETS__')
  expect(source).toContain("path.startsWith('api/')")
  expect(source).toContain('url.origin !== self.location.origin')
})

test('a stale 7,499-product runtime cache cannot hide the content-versioned expanded catalogue, including offline', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Cache keys do not depend on the viewport.')
  const { name } = expandedCatalogExample()
  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: 'Cele', level: 1, exact: true })).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload()
  const cached = await page.evaluate(async () => {
    const shellName = (await caches.keys()).find((value) => value.startsWith('flexa-shell-'))!
    const shell = await caches.open(shellName)
    const request = (await shell.keys()).find((value) => new URL(value.url).pathname.endsWith('/data/polish-products.json'))!
    const data = await (await shell.match(request))!.json()
    const old = { ...data, products: data.products.filter((record: { food: { barcode: string } }) => record.food.barcode !== '3083680592857').slice(0, 7499) }
    const runtime = await caches.open('flexa-runtime-v1')
    await runtime.put('/data/polish-products.json', new Response(JSON.stringify(old), { headers: { 'content-type': 'application/json' } }))
    return { version: new URL(request.url).searchParams.get('v'), count: data.products.length, oldCount: old.products.length }
  })
  expect(cached.version).toMatch(/^[a-f0-9]{64}$/)
  expect(cached.count).toBe(32987)
  expect(cached.oldCount).toBe(7499)
  await context.setOffline(true)
  const offlineCount = await page.evaluate(async (version) => {
    const response = await fetch(`/data/polish-products.json?v=${version}`)
    return (await response.json()).products.length
  }, cached.version)
  expect(offlineCount).toBe(32987)
  await openAdd(page, 'Posiłek')
  const drawer = page.getByRole('dialog')
  const foodResult = drawer.locator('.food-result').filter({ has: page.getByText(name, { exact: true }) })
  await drawer.getByRole('textbox', { name: 'Nazwa produktu', exact: true }).fill(name)
  await drawer.getByRole('button', { name: 'Szukaj', exact: true }).click()
  await expect(foodResult).toBeVisible()
  await expect(foodResult).toContainText('28 kcal')
  await drawer.getByRole('button', { name: 'Kod kreskowy', exact: true }).click()
  await drawer.getByLabel('Kod EAN lub UPC').fill('3083680592857')
  await drawer.getByRole('button', { name: 'Szukaj', exact: true }).click()
  await expect(foodResult).toBeVisible()
  await expect(foodResult).toContainText('28 kcal')
  await expect(drawer.getByText(/Nie udało się sprawdzić oceny/)).toBeVisible()
  await context.setOffline(false)
})
