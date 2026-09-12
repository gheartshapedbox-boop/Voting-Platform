// Vercel serverless entry: the whole Express app behind one function.
import { createApp } from '../server/app.js';

export default createApp({ serveClient: false });
