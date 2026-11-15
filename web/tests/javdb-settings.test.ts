import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { onTestFinished, test, vi } from 'vitest'

import { javdbKeys, loginJavDBOptions, type JavDBAccount } from '@/api/javdb'

test('JavDB login posts the credentials and caches the returned account', async () => {
  const client = new QueryClient()
  onTestFinished(() => client.clear())
  const mutation = client.getMutationCache().build(client, loginJavDBOptions(client))
  const account: JavDBAccount = { configured: true, logged_in: true, username: 'alice' }
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(account)))
  vi.stubGlobal('fetch', fetchMock)

  const result = await mutation.execute({ username: 'alice', password: 'secret' })

  assert.deepEqual(result, account)
  assert.deepEqual(client.getQueryData(javdbKeys.account), account)
  assert.equal(fetchMock.mock.calls.length, 1)
  const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  assert.equal(path, '/api/settings/javdb')
  assert.equal(init.method, 'POST')
  assert.deepEqual(JSON.parse(String(init.body)), {
    username: 'alice',
    password: 'secret'
  })
})
