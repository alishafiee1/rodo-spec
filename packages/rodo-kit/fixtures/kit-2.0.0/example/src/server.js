// Minimal placeholder server for the example. A real project would serve the shop pages here.
import http from 'node:http';
http.createServer((_, res) => res.end('gol-maryam')).listen(3000);
