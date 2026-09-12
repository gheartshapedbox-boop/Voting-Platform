import { openDb } from './db.js';
import { createApp } from './app.js';
import { configuredPasscode, DEV_PASSCODE } from './auth.js';

const port = Number(process.env.PORT ?? 3001);
const db = openDb();
const app = createApp(db);

app.listen(port, () => {
  console.log(`Voting platform API listening on http://localhost:${port}`);
  if (configuredPasscode() === DEV_PASSCODE) {
    console.log(`Admin passcode is the development default: "${DEV_PASSCODE}"`);
    console.log('Set ADMIN_PASSCODE in the environment before using this anywhere real.');
  }
});
