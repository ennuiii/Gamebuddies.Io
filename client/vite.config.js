import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    envPrefix: 'REACT_APP_',
    server: {
        port: 3032,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3033',
                ws: true,
                changeOrigin: true
            },
            '/api': {
                target: 'http://localhost:3033',
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: 'build',
    }
});
