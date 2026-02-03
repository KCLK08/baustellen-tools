<script>
  import { onMount } from 'svelte';
  import {
    addEntry,
    listEntries,
    loadSettings,
    saveSettings,
    clearEntries,
    clearSettings,
    addExport,
    listExports,
    deleteExport,
    addTemplate,
    listTemplates
  } from '$lib/db';
  import { compressImage, blobToObjectUrl } from '$lib/image';
  import { exportToXlsx, exportToXlsxShare } from '$lib/export';
  import { isNativePlatform, shareXlsx } from '$lib/native';

  const defaultColumns = [
    { name: 'Bilder', type: 'text', isPhoto: true },
    { name: 'Kilometer', type: 'number', isPhoto: false },
    { name: 'Beschreibung', type: 'text', isPhoto: false },
    { name: 'Status', type: 'text', isPhoto: false }
  ];

  let view = 'start';

  let projectName = 'Baustellen-Protokoll';
  let protocolDate = today();
  let protocolDescription = '';

  let columns = [...defaultColumns];

  let newColName = '';
  let newColType = 'text';

  let entries = [];
  let exportsList = [];
  let templates = [];
  let selectedTemplateId = '';
  let templateName = '';
  let entryDraft = {
    fields: {},
    photoFile: null,
    photoPreview: ''
  };

  let fieldIndex = 0;

  let isSaving = false;
  let isExporting = false;
  let isSharing = false;
  let settingsSaved = false;
  let nativeAvailable = false;
  let saveError = '';
  let downloadError = '';
  let selectedExports = new Set();
  let selectionMode = false;
  let closeError = '';

  onMount(async () => {
    nativeAvailable = isNativePlatform();

    const saved = await loadSettings();
    if (saved) {
      projectName = saved.projectName ?? projectName;
      protocolDescription = saved.protocolDescription ?? protocolDescription;
      columns = saved.columns ?? columns;
    }
    protocolDate = today();

    const storedEntries = await listEntries();
    entries = storedEntries.map((e) => ({
      ...e,
      photoPreview: e.photoBlob ? blobToObjectUrl(e.photoBlob) : ''
    }));

    exportsList = await listExports();
    templates = await listTemplates();
  });

  const addColumn = () => {
    if (!newColName.trim()) return;
    columns = [...columns, { name: newColName.trim(), type: newColType, isPhoto: false }];
    newColName = '';
    newColType = 'text';
  };

  const removeColumn = (name) => {
    const target = columns.find((c) => c.name === name);
    if (!target || target.isPhoto) return;
    columns = columns.filter((c) => c.name !== name);
  };

  const persistSettings = async () => {
    await saveSettings({ projectName, protocolDate, protocolDescription, columns });
    settingsSaved = true;
    setTimeout(() => {
      settingsSaved = false;
    }, 1600);
  };

  const applyTemplate = () => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    columns = tpl.columns?.length ? tpl.columns : columns;
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    const record = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      name: templateName.trim(),
      columns: columns.map((c) => ({ ...c }))
    };
    await addTemplate(record);
    templates = [record, ...templates];
    selectedTemplateId = record.id;
    templateName = '';
  };

  const startProtocol = async () => {
    await persistSettings();
    view = 'main';
  };

  const startEntry = () => {
    entryDraft = { fields: {}, photoFile: null, photoPreview: '' };
    fieldIndex = 0;
    view = 'photo';
  };

  const handlePhoto = async (e) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    entryDraft.photoFile = compressed;
    entryDraft.photoPreview = blobToObjectUrl(compressed);
    goToNextField();
  };

  const fieldColumns = () => columns.filter((c) => !c.isPhoto);

  const goToNextField = () => {
    if (fieldColumns().length === 0) {
      finalizeEntry();
      return;
    }
    view = 'field';
  };

  const nextField = async () => {
    if (fieldIndex < fieldColumns().length - 1) {
      fieldIndex += 1;
    } else {
      await finalizeEntry();
    }
  };

  const finalizeEntry = async () => {
    if (isSaving) return;
    isSaving = true;
    saveError = '';

    try {
      const entryId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : fallbackId();
      const snapshot = {
        id: entryId,
        createdAt: new Date().toISOString(),
        fields: { ...entryDraft.fields },
        photoBlob: entryDraft.photoFile ?? null
      };

      await addEntry(snapshot);

      entries = [
        {
          ...snapshot,
          photoPreview: snapshot.photoBlob ? blobToObjectUrl(snapshot.photoBlob) : ''
        },
        ...entries
      ];

      entryDraft = { fields: {}, photoFile: null, photoPreview: '' };
      fieldIndex = 0;
      view = 'main';
    } catch (err) {
      saveError = 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
      console.error(err);
    } finally {
      isSaving = false;
    }
  };

  function fallbackId() {
    return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  const runExport = async () => {
    if (isExporting) return;
    isExporting = true;
    const result = await exportToXlsx({ projectName, protocolDate, protocolDescription, columns, entries });
    await addExportRecord(result);
    isExporting = false;
  };

  const runShare = async () => {
    if (isSharing) return;
    isSharing = true;
    const result = await exportToXlsxShare({
      projectName,
      protocolDate,
      protocolDescription,
      columns,
      entries,
      shareFn: shareXlsx
    });
    await addExportRecord(result);
    isSharing = false;
  };

  const totalEntries = () => entries.length;

  const addExportRecord = async (result) => {
    if (!result) return;
    const { filename, base64 } = result;
    const record = {
      id: `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      filename,
      base64,
      projectName: projectName || '',
      protocolDate: protocolDate || ''
    };
    await addExport(record);
    exportsList = [record, ...exportsList];
  };

  const resetProtocol = async () => {
    await clearEntries();
    await clearSettings();
    entries = [];
    projectName = 'Baustellen-Protokoll';
    protocolDate = today();
    protocolDescription = '';
    columns = [...defaultColumns];
    view = 'start';
    selectionMode = false;
    clearSelection();
  };

  const closeProtocol = async () => {
    closeError = '';
    const ok = window.confirm(
      'Protokoll abschließen? Danach kannst du dieses Protokoll nicht mehr bearbeiten.'
    );
    if (!ok) return;
    if (isExporting) return;
    isExporting = true;
    try {
      const result = await exportToXlsx({ projectName, protocolDate, protocolDescription, columns, entries });
      await addExportRecord(result);
      await resetProtocol();
      view = 'exports';
    } catch (err) {
      closeError = 'Abschluss fehlgeschlagen. Bitte erneut versuchen.';
      console.error(err);
    } finally {
      isExporting = false;
    }
  };

  const cancelProtocol = async () => {
    const ok = window.confirm('Protokoll verwerfen? Alle bisherigen Einträge werden gelöscht.');
    if (!ok) return;
    await resetProtocol();
  };

  const goToExports = () => {
    downloadError = '';
    view = 'exports';
  };

  const goToStart = () => {
    selectionMode = false;
    clearSelection();
    view = 'start';
  };

  const downloadExport = (exp) => {
    if (!exp?.base64) {
      downloadError = 'Download nicht verfügbar.';
      return;
    }
    const byteString = atob(exp.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exp.filename || 'protokoll.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllExports = () => {
    if (exportsList.length === 0) {
      downloadError = 'Keine Protokolle zum Download.';
      return;
    }
    exportsList.forEach((exp) => downloadExport(exp));
  };

  const toggleExportSelection = (id) => {
    const next = new Set(selectedExports);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedExports = next;
  };

  const selectAllExports = () => {
    selectedExports = new Set(exportsList.map((e) => e.id));
  };

  const clearSelection = () => {
    selectedExports = new Set();
  };

  const toggleSelectionMode = () => {
    selectionMode = !selectionMode;
    if (!selectionMode) {
      clearSelection();
    }
  };

  const downloadSelected = () => {
    if (selectedExports.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    exportsList
      .filter((e) => selectedExports.has(e.id))
      .forEach((exp) => downloadExport(exp));
  };

  const removeExport = async (id) => {
    await deleteExport(id);
    exportsList = exportsList.filter((e) => e.id !== id);
    if (selectedExports.has(id)) {
      const next = new Set(selectedExports);
      next.delete(id);
      selectedExports = next;
    }
  };

  const removeSelectedExports = async () => {
    if (selectedExports.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    const ok = window.confirm('Ausgewählte Protokolle wirklich löschen?');
    if (!ok) return;
    for (const id of selectedExports) {
      await deleteExport(id);
    }
    exportsList = exportsList.filter((e) => !selectedExports.has(e.id));
    clearSelection();
  };

  function today() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  }
</script>

<div class="page">
  <header class="hero">
    <div>
      <p class="eyebrow">Baustellen Tool</p>
      <h1>Protokoll App</h1>
      <p class="sub">Schrittweise Dokumentation mit Foto und XLSX-Export.</p>
    </div>
  </header>

  {#if view === 'start'}
    <section class="panel">
      <h2>Protokoll erstellen</h2>
      <label class="field">
        <span>Projektname</span>
        <input bind:value={projectName} placeholder="Projektname" />
      </label>

      <label class="field">
        <span>Beschreibung</span>
        <input type="text" placeholder="Kurzbeschreibung" bind:value={protocolDescription} />
      </label>

      <label class="field">
        <span>Datum</span>
        <div class="readonly-field">{protocolDate}</div>
      </label>

      <h3>Tabellenformat</h3>

      <div class="grid">
        <label class="field">
          <span>Gespeichertes Format</span>
          <select bind:value={selectedTemplateId} on:change={applyTemplate}>
            <option value="">Format auswählen</option>
            {#each templates as tpl}
              <option value={tpl.id}>{tpl.name}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Neues Format speichern</span>
          <div class="inline">
            <input bind:value={templateName} placeholder="Formatname" />
            <button type="button" on:click={saveTemplate}>Speichern</button>
          </div>
        </label>
      </div>

      {#if templates.length === 0}
        <p class="muted">Noch keine Tabellenformate gespeichert.</p>
      {/if}
      <div class="columns">
        {#each columns as col}
          <div class="col-card">
            <div class="col-title">{col.name}</div>
            <div class="col-meta">Typ: {col.type}</div>
            {#if !col.isPhoto}
              <button type="button" on:click={() => removeColumn(col.name)}>Spalte entfernen</button>
            {:else}
              <span class="photo-pill">Foto-Spalte</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="add-row">
        <input bind:value={newColName} placeholder="Spaltenname" />
        <select bind:value={newColType}>
          <option value="text">Text</option>
          <option value="number">Zahl</option>
        </select>
        <button type="button" on:click={addColumn}>Spalte hinzufügen</button>
      </div>

      <div class="cta-row">
        <button class="primary" type="button" on:click={startProtocol}>Protokoll starten</button>
        <button type="button" on:click={goToExports}>Protokolle anzeigen</button>
      </div>
    </section>
  {/if}

  {#if view === 'main'}
    <section class="panel">
      <h2>Protokoll läuft</h2>
      <div class="summary">
        <div>
          <div class="label">Datum</div>
          <div>{protocolDate}</div>
        </div>
        <div>
          <div class="label">Beschreibung</div>
          <div>{protocolDescription || '—'}</div>
        </div>
        <div>
          <div class="label">Einträge</div>
          <div>{totalEntries()}</div>
        </div>
      </div>

      <div class="cta-row">
        <button class="primary" type="button" on:click={startEntry}>Eintrag machen</button>
        <button type="button" disabled={isExporting} on:click={closeProtocol}>
          {isExporting ? 'Abschließen…' : 'Protokoll abschließen'}
        </button>
        <button type="button" on:click={cancelProtocol}>Protokoll verlassen</button>
      </div>
      {#if closeError}
        <p class="error">{closeError}</p>
      {/if}

      <div class="entries">
        {#if entries.length === 0}
          <p class="muted">Noch keine Einträge.</p>
        {:else}
          {#each entries as e}
            <div class="entry-card">
              {#if e.photoPreview}
                <img src={e.photoPreview} alt="Foto" />
              {/if}
              <div class="entry-body">
                <div class="entry-date">{new Date(e.createdAt).toLocaleString()}</div>
                <div class="entry-fields">
                  {#each Object.entries(e.fields) as [key, value]}
                    <div><strong>{key}:</strong> {value}</div>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if view === 'photo'}
    <section class="panel">
      <h2>Bild hinzufügen</h2>
      <label class="field">
        <span>Kamera öffnen / Datei auswählen</span>
        <input type="file" accept="image/*" on:change={handlePhoto} />
      </label>

      {#if entryDraft.photoPreview}
        <img class="preview" src={entryDraft.photoPreview} alt="Vorschau" />
      {/if}

      <button type="button" on:click={() => (view = 'main')}>Zurück</button>
    </section>
  {/if}

  {#if view === 'field'}
    <section class="panel">
      <h2>Eintrag</h2>
      {#if fieldColumns().length > 0}
        {#each [fieldColumns()[fieldIndex]] as col}
          <label class="field">
            <span>{col.name}</span>
            {#if col.type === 'number'}
              <input type="number" placeholder={col.name} bind:value={entryDraft.fields[col.name]} />
            {:else}
              <input type="text" placeholder={col.name} bind:value={entryDraft.fields[col.name]} />
            {/if}
          </label>
        {/each}

        <div class="cta-row">
          <button type="button" on:click={() => (view = 'main')}>Abbrechen</button>
          <button class="primary" type="button" disabled={isSaving} on:click={nextField}>
            {fieldIndex < fieldColumns().length - 1 ? 'Weiter' : 'Speichern'}
          </button>
        </div>
        {#if saveError}
          <p class="error">{saveError}</p>
        {/if}
      {/if}
    </section>
  {/if}


  {#if view === 'exports'}
    <section class="panel">
      <h2>Protokolle</h2>
      {#if exportsList.length === 0}
        <p class="muted">Noch keine Protokolle vorhanden.</p>
      {:else}
        <div class="exports">
          {#each exportsList as exp}
            <div class="export-card">
              {#if selectionMode}
                <label class="export-select">
                  <input
                    type="checkbox"
                    checked={selectedExports.has(exp.id)}
                    on:change={() => toggleExportSelection(exp.id)}
                  />
                </label>
              {/if}
              <div class="export-info">
                <div class="export-name">{exp.filename}</div>
                <div class="export-meta">
                  {new Date(exp.createdAt).toLocaleString()} · {exp.projectName} · {exp.protocolDate}
                </div>
              </div>
              <div class="export-actions">
                <button type="button" on:click={() => downloadExport(exp)}>Download</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if downloadError}
        <p class="error">{downloadError}</p>
      {/if}
      {#if exportsList.length > 0}
        <div class="cta-row">
          <button type="button" on:click={toggleSelectionMode}>
            {selectionMode ? 'Auswahl beenden' : 'Auswählen'}
          </button>
          {#if selectionMode}
            <button type="button" on:click={downloadSelected}>Auswahl herunterladen</button>
            <button type="button" on:click={selectAllExports}>Alle auswählen</button>
            <button type="button" class="danger" on:click={removeSelectedExports}>Löschen</button>
          {/if}
        </div>
      {/if}
      <div class="cta-row">
        <button type="button" on:click={goToStart}>Zur Startseite</button>
      </div>
    </section>
  {/if}
</div>

<style>
  .page {
    max-width: 980px;
    margin: 0 auto;
    padding: 32px 20px 80px;
  }

  .hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
  }

  .eyebrow {
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.14em;
    color: var(--muted);
    margin: 0 0 6px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 38px;
  }

  h3 {
    margin-top: 12px;
  }

  .sub {
    margin: 0;
    color: var(--muted);
  }

  .badge {
    background: var(--accent-2);
    color: white;
    padding: 10px 14px;
    border-radius: 999px;
    font-weight: 600;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 12px 30px rgba(23, 21, 18, 0.08);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  input, select {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 14px;
  }

  .readonly-field {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #f8f5f1;
    font-size: 14px;
    color: var(--ink);
    user-select: none;
  }

  button {
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: white;
    cursor: pointer;
    font-weight: 600;
  }

  button.primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .wide {
    width: 100%;
    margin-top: 12px;
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin: 12px 0 16px;
  }

  .col-card {
    padding: 12px;
    border: 1px dashed var(--border);
    border-radius: 12px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .col-title {
    font-weight: 700;
  }

  .col-meta {
    color: var(--muted);
    font-size: 13px;
  }

  .photo-pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: #eef2ff;
    color: var(--accent-2);
    font-size: 12px;
    font-weight: 600;
  }

  .add-row {
    display: grid;
    grid-template-columns: 1fr 150px 200px;
    gap: 10px;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }

  .saved {
    color: var(--accent-2);
    font-weight: 600;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }

  .label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .cta-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 12px 0 18px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .inline {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .preview {
    width: 100%;
    max-width: 320px;
    border-radius: 12px;
    border: 1px solid var(--border);
    margin-bottom: 14px;
  }

  .entries {
    display: grid;
    gap: 12px;
  }

  .entry-card {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
  }

  .entry-card img {
    width: 100%;
    border-radius: 10px;
    object-fit: cover;
  }

  .entry-date {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .entry-fields {
    display: grid;
    gap: 4px;
  }

  .export-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .exports {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }

  .export-card {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .export-select {
    display: flex;
    align-items: center;
  }

  .export-name {
    font-weight: 700;
  }

  .export-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    text-align: left;
  }

  .export-meta {
    color: var(--muted);
    font-size: 12px;
  }

  .export-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .danger {
    border-color: #ef4444;
    color: #b91c1c;
    background: #fff5f5;
  }

  .export-hint {
    margin-top: 4px;
    font-size: 12px;
    color: var(--muted);
  }

  .muted {
    color: var(--muted);
  }

  .error {
    color: #b91c1c;
    font-weight: 600;
    margin-top: 8px;
  }

  @media (max-width: 720px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }
    .add-row {
      grid-template-columns: 1fr;
    }
    .entry-card {
      grid-template-columns: 1fr;
    }
  }
</style>
