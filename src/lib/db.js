import Dexie from 'dexie';

export const db = new Dexie('protokoll_app');

db.version(1).stores({
  settings: '&id',
  entries: 'id, createdAt'
});

db.version(2).stores({
  settings: '&id',
  entries: 'id, createdAt',
  exports: 'id, createdAt'
});

db.version(3).stores({
  settings: '&id',
  entries: 'id, createdAt',
  exports: 'id, createdAt',
  templates: 'id, createdAt, name'
});

export async function loadSettings() {
  const row = await db.settings.get('current');
  return row?.value ?? null;
}

export async function saveSettings(value) {
  await db.settings.put({ id: 'current', value });
}

export async function clearSettings() {
  await db.settings.delete('current');
}

export async function listEntries() {
  return db.entries.orderBy('createdAt').reverse().toArray();
}

export async function addEntry(entry) {
  await db.entries.put(entry);
}

export async function clearEntries() {
  await db.entries.clear();
}

export async function listExports() {
  return db.exports.orderBy('createdAt').reverse().toArray();
}

export async function addExport(record) {
  await db.exports.put(record);
}

export async function deleteExport(id) {
  await db.exports.delete(id);
}

export async function listTemplates() {
  return db.templates.orderBy('createdAt').reverse().toArray();
}

export async function addTemplate(record) {
  await db.templates.put(record);
}
