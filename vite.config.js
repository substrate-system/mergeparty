import 'dotenv/config'
import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

// https://vitejs.dev/config/
export default defineConfig({
    define: {
        global: 'globalThis'
    },
    root: 'example',  // https://vite.dev/config/shared-options.html#root
    plugins: [wasm()],
    // https://github.com/vitejs/vite/issues/8644#issuecomment-1159308803
    esbuild: {
        logOverride: { 'this-is-undefined-in-esm': 'silent' }
    },
    publicDir: '_public',  // see https://vite.dev/config/shared-options#publicdir
    css: {
        lightningcss: {
            bundling: true,  // bundle css via @import
            nesting: true,
            // see https://lightningcss.dev/transpilation.html#custom-media-queries
            customMedia: true,
            minify: process.env.NODE_ENV !== 'development'
        }
    },
    server: {
        port: 8888,
        host: true,
        open: true,
    },
    worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
    build: {
        cssMinify: 'lightningcss',
        minify: process.env.NODE_ENV !== 'development',
        outDir: '../public',
        emptyOutDir: true,
        sourcemap: 'inline'
    }
})
