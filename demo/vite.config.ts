// vite.config.ts
import {defineConfig} from 'vite'
import ViteRails from "vite-plugin-rails"

export default defineConfig(
    {
        build: {
            target: "esnext",
            minify: false
        },
        clearScreen: false,
        plugins: [
            ViteRails({
                fullReload: {
                    additionalPaths: ["config/routes.rb", "app/views/**/*"],
                    delay: 300
                }
            }),
        ],
    }
)
