import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'

export default {
  // Use index.ts as the ONLY entry point
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'cjs',
    exports: 'auto',
    sourcemap: false,
    // CRITICAL: This forces Rollup to merge everything into one file
    inlineDynamicImports: true,
    // Ensure it doesn't try to preserve the src/ folder structure
    preserveModules: false
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      // This helps Rollup find your local files correctly
      exportConditions: ['node'],
      mainFields: ['module', 'main']
    }),
    typescript({
      // Prevent TS from creating separate files that Rollup then follows
      declaration: false,
      module: 'ESNext',
      target: 'ES2022'
    }),
    commonjs(),
    json()
  ],
  // Ensure this is strictly empty so it doesn't skip your main.ts
  external: []
}
