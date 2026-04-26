import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    optimizeDeps: {
        exclude: ["wasy"],
    },
    worker: {
        format: "es",
    },
});
