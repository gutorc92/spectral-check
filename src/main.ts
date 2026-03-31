import { glob } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as rulesets from '@stoplight/spectral-rulesets'
import { bundleAndLoadRuleset } from '@stoplight/spectral-ruleset-bundler/with-loader'
import { Spectral, Document } from '@stoplight/spectral-core'
import { Json } from '@stoplight/spectral-parsers'
import * as github from '@actions/github'
import * as core from '@actions/core'
import { BlobServiceClient } from '@azure/storage-blob'
const SPEC_FILENAME = 'openapi.json'
import { bundleRuleset } from '@stoplight/spectral-ruleset-bundler'
import { Agent } from 'undici'

function safeTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0')

  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())

  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())

  // ISO-like but filesystem-safe
  return `${day}-${month}-${year}_${hours}-${minutes}-${seconds}`
}
/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 *
 */
export async function run(): Promise<void> {
  try {
    const host_api: string = core.getInput('host_api')
    const connection_string: string = core.getInput('connection_string')
    const container_name: string = core.getInput('container_name')
    const spectral_ruleset: string = core.getInput('spectral_ruleset')

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Host to use ${host_api} ...`)
    core.debug(`Spectral ruleset to use ${spectral_ruleset} ...`)

    const workspace = process.env.GITHUB_WORKSPACE

    if (!workspace) {
      core.setFailed('GITHUB_WORKSPACE is not defined')
      return
    }

    core.debug(`Github workspace ${workspace} ...`)

    core.debug(`Spectral rulesets: ${Object.keys(rulesets)}`)

    if (!host_api) {
      core.setFailed('Host API is required')
      return
    }
    const fullRepoName =
      github.context.repo.owner + '/' + github.context.repo.repo
    const { owner, repo } = github.context.repo

    core.debug(`Running Spectral on repository: ${fullRepoName}`)
    core.debug(`Owner: ${owner}`)
    core.debug(`Repository: ${repo}`)
    const rulesetFiles = []
    for await (const entry of glob('.spectral.{json,yaml}', {
      cwd: workspace
    })) {
      core.debug(`Ruleset file found: ${entry}`)
      rulesetFiles.push(path.join(workspace, entry))
    }

    if (rulesetFiles.length === 0) {
      core.error('No ruleset found matching .spectral.{json,yaml}')
      core.setFailed('Spectral ruleset is required')
      return
    }

    const rulesetPath = rulesetFiles[0]

    const ruleset = await bundleAndLoadRuleset(rulesetPath, {
      fs: { promises: fs },
      fetch
    })
    const tls_verify = core.getInput('tls_verify') === 'true'

    const dispatcher = new Agent({
      connect: {
        rejectUnauthorized: tls_verify
      }
    })

    const response = await fetch(host_api, {
      dispatcher
    } as any)
    if (!response.ok) {
      core.setFailed(
        `Failed to fetch API spec from ${host_api}: ${response.status} ${response.statusText}`
      )
      return
    }
    const body = await response.text()

    const localPath = path.join(workspace, SPEC_FILENAME)

    await fs.writeFile(localPath, body, 'utf-8')

    core.setOutput('spec_path', localPath)

    const spectral = new Spectral({
      resolver: undefined
    })
    spectral.setRuleset(ruleset)
    // 2. Read the file content as a UTF-8 string
    const fileContent = await fs.readFile(localPath, 'utf8')

    // 3. Initialize the Spectral Document
    // The third argument (source) is crucial for accurate error reporting
    const myDocument = new Document(fileContent, Json, localPath)
    const results = await spectral.run(myDocument)

    console.table(
      results.map((r) => ({
        repo: repo,
        org: owner,
        path: r.path,
        code: r.code,
        severity: r.severity,
        message: r.message
      }))
    )

    const csvHeader = 'org,repo,code,severity,message,path\n'

    const csvRows = results.map((r) => {
      const path = r.path ?? ''
      const code = r.code ?? ''
      const severity = r.severity ?? ''
      const message = (r.message ?? '').replace(/"/g, '""') // escape quotes

      return `"${owner}","${repo}","${code}","${severity}","${message}","${path}"`
    })

    const csvContent = csvHeader + csvRows.join('\n')

    const fileName = `${owner}_${repo}_${safeTimestamp()}.csv`

    const csvPath = path.join(workspace, fileName)

    await fs.writeFile(csvPath, csvContent, 'utf8')

    if (connection_string && container_name) {
      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connection_string)

      // Get container
      const containerClient =
        blobServiceClient.getContainerClient(container_name)

      // Ensure container exists
      await containerClient.createIfNotExists()

      // Create blob client
      const blockBlobClient = containerClient.getBlockBlobClient(fileName)

      // Upload file
      const uploadResponse = await blockBlobClient.uploadFile(csvPath)

      console.log('Upload successful:', uploadResponse.requestId)
    }

    core.setOutput('csv_report', csvPath)

    core.info(`CSV report generated at: ${csvPath}`)

    // Set outputs for other workflow steps to use
  } catch (error) {
    // Fail the workflow run if an error occurs
    console.log('Error: ', error)
    if (error instanceof Error) core.setFailed(error.message)
  }
}
