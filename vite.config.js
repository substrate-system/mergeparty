import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import postcssNesting from 'postcss-nesting'

// https://vitejs.dev/config/
export default defineConfig({
    define: {
        global: 'globalThis'
    },
    root: 'example',
    plugins: [
        preact({
            devtoolsInProd: false,
            prefreshEnabled: true,
            babel: {
                sourceMaps: 'both'
            }
        })
    ],
    // https://github.com/vitejs/vite/issues/8644#issuecomment-1159308803
    esbuild: {
        logOverride: { 'this-is-undefined-in-esm': 'silent' }
    },
    publicDir: '_public',
    css: {
        postcss: {
            plugins: [
                postcssNesting
            ],
        },
    },
    server: {
        port: 8888,
        host: true,
        open: true,
    },
    build: {
        minify: false,
        outDir: '../public',
        emptyOutDir: true,
        sourcemap: 'inline'
    }
})
