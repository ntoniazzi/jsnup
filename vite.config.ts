import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
    base: "/jsnup/",
    build: {
        outDir: "dist/",
        sourcemap: true,
        chunkSizeWarningLimit: 1024,
    },
    plugins: [vue()],
    publicDir: "resources/",
    define: {
        __VUE_PROD_DEVTOOLS__: true,
        __VUE_OPTIONS_API__: true,
    }
});
