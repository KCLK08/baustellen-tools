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

db.version(4).stores({
  settings: '&id',
  entries: 'id, createdAt',
  exports: 'id, createdAt, protocolId',
  templates: 'id, createdAt, name',
  protocols: 'id, createdAt, updatedAt'
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

export async function deleteEntry(id) {
  await db.entries.delete(id);
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

export async function upsertExportByProtocol(record) {
  const existing = await db.exports.where('protocolId').equals(record.protocolId).first();
  if (existing) {
    await db.exports.put({ ...existing, ...record, id: existing.id });
    return { ...existing, ...record, id: existing.id };
  }
  await db.exports.put(record);
  return record;
}

export async function deleteExportsByProtocol(protocolId) {
  const matches = await db.exports.where('protocolId').equals(protocolId).toArray();
  for (const exp of matches) {
    await db.exports.delete(exp.id);
  }
}

export async function listProtocols() {
  return db.protocols.orderBy('updatedAt').reverse().toArray();
}

export async function addProtocol(record) {
  await db.protocols.put(record);
}

export async function getProtocol(id) {
  return db.protocols.get(id);
}

export async function deleteProtocol(id) {
  await db.protocols.delete(id);
}

export async function listTemplates() {
  return db.templates.orderBy('createdAt').reverse().toArray();
}

export async function addTemplate(record) {
  await db.templates.put(record);
}
