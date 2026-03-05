// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    exports: 'auto',
    inlineDynamicImports: true,
    preserveModules: false,
    sourcemap: false
  },
  plugins: [
    typescript({
      // 3. Prevent TS from emitting separate files
      declaration: false,
      outDir: undefined
    }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json()
  ],
  external: []
}

export default config
