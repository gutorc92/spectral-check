import { glob } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as rulesets from '@stoplight/spectral-rulesets'
import { bundleAndLoadRuleset } from '@stoplight/spectral-ruleset-bundler/with-loader'
import { Spectral, Document } from '@stoplight/spectral-core'
import { Json } from '@stoplight/spectral-parsers'
import * as github from '@actions/github'
import * as core from '@actions/core'
const SPEC_FILENAME = 'openapi.json'
import { bundleRuleset } from '@stoplight/spectral-ruleset-bundler'
/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const host_api: string = core.getInput('host_api')
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

    const response = await fetch(host_api)
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
        code: r.code,
        severity: r.severity,
        message: r.message,
        line: r.range.start.line + 1
      }))
    )

    // Set outputs for other workflow steps to use
  } catch (error) {
    // Fail the workflow run if an error occurs
    console.log('passou aqui ')
    if (error instanceof Error) core.setFailed(error.message)
  }
}
