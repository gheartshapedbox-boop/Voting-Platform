import { createApp } from './app.js';
import { databaseUrl } from './db/index.js';
import { DEFAULT_PASSCODE, adminPasscode } from './auth.js';

const port = Number(process.env.PORT) || 3001;

if (adminPasscode() === DEFAULT_PASSCODE) {
  console.warn(`[warn] ADMIN_PASSCODE is unset -- using the default "${DEFAULT_PASSCODE}".`);
}
if (!databaseUrl() && !process.env.DB_DIR) {
  console.warn('[warn] No DATABASE_URL or DB_DIR -- running on an in-memory database. Data is lost on restart.');
}

createApp().listen(port, () => {
  console.log(`Strategy voting on http://localhost:${port}`);
});
