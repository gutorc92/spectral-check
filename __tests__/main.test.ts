/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

const writeFileMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
jest.unstable_mockModule('node:fs/promises', () => ({ writeFile: writeFileMock }))
jest.unstable_mockModule('@actions/core', () => core)

let fetchMock: ReturnType<typeof jest.fn>

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    fetchMock = jest.fn()
    ;(globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock

    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((name: string) =>
      name === 'host_api' ? '' : ''
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Sets the time output when host_api is empty', async () => {
    await run()

    expect(core.setOutput).toHaveBeenCalledWith(
      'time',
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}/)
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('When host_api is provided, fetches file and sets spec_path output', async () => {
    const specUrl = 'https://example.com/openapi.json'
    const specBody = '{"openapi":"3.0.0"}'
    core.getInput.mockImplementation((name: string) =>
      name === 'host_api' ? specUrl : ''
    )
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(specBody)
    })

    await run()

    expect(fetchMock).toHaveBeenCalledWith(specUrl)
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('openapi.json'),
      specBody,
      'utf-8'
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'spec_path',
      expect.stringContaining('openapi.json')
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'time',
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}/)
    )
  })

  it('Sets a failed status when fetch returns non-ok response', async () => {
    const specUrl = 'https://example.com/openapi.json'
    core.getInput.mockImplementation((name: string) =>
      name === 'host_api' ? specUrl : ''
    )
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      `Failed to fetch API spec from ${specUrl}: 404 Not Found`
    )
    expect(writeFileMock).not.toHaveBeenCalled()
  })
})
