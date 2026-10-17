import { createServer } from 'node:http';
import { lstat, readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT 必须是 1–65535 之间的整数。');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isWithinRoot(path) {
  const suffix = relative(root, path);
  return suffix === '' || (!suffix.startsWith('..') && !isAbsolute(suffix));
}

async function safeStat(path) {
  let current = root;
  let details = await lstat(current);
  for (const segment of relative(root, path).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    details = await lstat(current);
    if (details.isSymbolicLink()) {
      const error = new Error('不提供符号链接文件。');
      error.code = 'EACCES';
      throw error;
    }
  }
  return details;
}

function reply(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    reply(response, 405, '仅支持 GET 和 HEAD。');
    return;
  }

  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\') ||
        pathname.split('/').some((segment) => segment.startsWith('.'))) {
      reply(response, 403, '无法访问此路径。');
      return;
    }

    let path = resolve(root, `.${pathname}`);
    if (!isWithinRoot(path)) {
      reply(response, 403, '无法访问此路径。');
      return;
    }

    if ((await safeStat(path)).isDirectory()) {
      path = resolve(path, 'index.html');
      await safeStat(path);
    }

    const data = await readFile(path);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error instanceof URIError || error instanceof TypeError) {
      reply(response, 400, '请求地址无效。');
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      reply(response, 403, '无法访问此路径。');
    } else if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      reply(response, 404, '页面不存在。');
    } else {
      reply(response, 500, '暂时无法读取文件。');
      console.error(error);
    }
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请设置 PORT 后重试。` : error);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`数独之间已启动：http://127.0.0.1:${port}`);
  console.log('按 Ctrl+C 停止。');
});
