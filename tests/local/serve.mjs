import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const toml=fs.readFileSync('netlify.toml','utf8');const csp=toml.match(/Content-Security-Policy = "([^"]+)"/)[1];
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
const root=p.startsWith('/legacy/')?'.':'public';const f=path.join(root,p);
if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Content-Security-Policy':csp,'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff'});fs.createReadStream(f).pipe(r)}).listen(8787);
