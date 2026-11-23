// start.js – entry point for local development and Vercel
import app from './server.js';

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Switchly demo server listening on http://localhost:${PORT}`);
});
