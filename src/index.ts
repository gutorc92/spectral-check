/**
 * The entrypoint for the action. This file simply imports and runs the action's
 * main logic.
 */
import '@stoplight/spectral-functions'
import '@stoplight/spectral-rulesets'
import '@stoplight/spectral-runtime'
import { run } from './main.js'

/* istanbul ignore next */
run()
