import fs from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
const db = await getDb();
try {
  await db.exec('begin');
  await db.exec(fs.readFileSync(path.join(REPO_ROOT, 'supabase/seed.sql'), 'utf8'));
  await db.exec('commit');
  console.log('Fictional Kaipara Readymix seeded');
} catch (e) { await db.exec('rollback'); throw e; } finally { await db.close(); }
