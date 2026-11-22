import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { APP_VERSION } from './version.js';

const config = loadConfig();
const app = await buildApp(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ version: APP_VERSION }, 'Self-Notes API started');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
