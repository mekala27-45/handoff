import { defineConfig } from 'vite';
export default defineConfig({base:process.env.SITE_BASE??'./',build:{outDir:'dist',sourcemap:false},server:{host:'127.0.0.1',port:5173,strictPort:true}});
