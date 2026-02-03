<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { version as appVersion } from '$app/environment';
  import { flip } from 'svelte/animate';
  import {
    addEntry,
    listEntries,
    loadSettings,
    saveSettings,
    clearEntries,
    clearSettings,
    deleteEntry,
    addTemplate,
    listTemplates,
    updateTemplate,
    listProtocols,
    addProtocol,
    getProtocol,
    deleteProtocol,
    listExports,
    upsertExportByProtocol,
    deleteExportsByProtocol,
    deleteExport
  } from '$lib/db';
  import { compressImage, blobToObjectUrl } from '$lib/image';
  import { exportToXlsx, exportToXlsxData } from '$lib/export';

  const defaultColumns = [
    { name: 'Bilder', type: 'text', isPhoto: true },
    { name: 'Kilometer', type: 'number', isPhoto: false },
    { name: 'Beschreibung', type: 'text', isPhoto: false },
    { name: 'Status', type: 'text', isPhoto: false }
  ];

  let view = 'landing';

  let projectName = '';
  let protocolDate = today();
  let protocolDescription = '';
  let columns = [...defaultColumns];

  let newColName = '';
  let newColType = 'text';

  let entries = [];
  let entryDraft = {
    fields: {},
    photoFile: null,
    photoPreview: ''
  };
  let editingEntryId = null;

  let fieldIndex = 0;

  let templates = [];
  let selectedTemplateId = '';
  let templateName = '';
  let isCreatingFormat = false;
  let isEditingFormat = false;
  let formatMode = 'new';
  let formatReturnView = 'start';
  let formatBackup = null;
  let dragIndex = null;
  let editingColIndex = null;
  let editColName = '';
  let editColType = 'text';
  let touchDragIndex = null;
  let touchDragging = false;
  let touchTimer = null;

  let protocolsList = [];
  let exportsList = [];

  let activeProtocolId = null;
  let activeProtocolCreatedAt = null;

  let isSaving = false;
  let isExporting = false;
  let saveError = '';
  let closeError = '';
  let downloadError = '';
  let isDirty = false;
  let selectionModeProtocols = false;
  let selectedProtocols = new Set();
  let selectionModeExports = false;
  let selectedExports = new Set();
  let updateAvailable = false;
  let confirmDialog = {
    open: false,
    title: '',
    message: '',
    primaryLabel: '',
    secondaryLabel: '',
    onPrimary: null,
    onSecondary: null
  };
  let lastView = view;
  let suppressHistory = false;

  onMount(async () => {
    const saved = await loadSettings();
    if (saved) {
      protocolDescription = saved.protocolDescription ?? protocolDescription;
      columns = saved.columns ?? columns;
      selectedTemplateId = saved.selectedTemplateId ?? selectedTemplateId;
    }
    projectName = '';
    protocolDate = today();

    const storedEntries = await listEntries();
    entries = storedEntries.map((e) => ({
      ...e,
      photoPreview: e.photoBlob ? blobToObjectUrl(e.photoBlob) : ''
    }));

    templates = await listTemplates();
    protocolsList = await listProtocols();
    exportsList = await listExports();

    const checkForUpdate = async () => {
      try {
        const res = await fetch(`${base}/_app/version.json`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.version && data.version !== appVersion) {
          updateAvailable = true;
        }
      } catch {
        // ignore network errors
      }
    };

    await checkForUpdate();
    const interval = setInterval(checkForUpdate, 300000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);

    const onPopState = (event) => {
      if (event.state?.view) {
        suppressHistory = true;
        view = event.state.view;
        lastView = view;
        suppressHistory = false;
      }
    };
    history.replaceState({ view }, '');
    window.addEventListener('popstate', onPopState);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('popstate', onPopState);
    };
  });

  $: if (view !== lastView) {
    if (!suppressHistory) {
      history.pushState({ view }, '');
    }
    lastView = view;
  }

  const persistSettings = async () => {
    await saveSettings({ projectName, protocolDate, protocolDescription, columns, selectedTemplateId });
  };

  const addColumn = () => {
    if (!newColName.trim()) return;
    columns = [...columns, { name: newColName.trim(), type: newColType, isPhoto: false }];
    newColName = '';
    newColType = 'text';
    isDirty = true;
  };

  const removeColumn = (name) => {
    const target = columns.find((c) => c.name === name);
    if (!target || target.isPhoto) return;
    columns = columns.filter((c) => c.name !== name);
    isDirty = true;
  };

  const applyTemplate = () => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    columns = tpl.columns?.length ? tpl.columns : columns;
    isDirty = true;
    persistSettings();
    isCreatingFormat = false;
    isEditingFormat = false;
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
    persistSettings();
    isCreatingFormat = false;
    isEditingFormat = false;
    isDirty = true;
    formatBackup = null;
    view = formatReturnView;
  };

  const startNewFormat = () => {
    formatReturnView = view;
    formatBackup = {
      columns: columns.map((c) => ({ ...c })),
      selectedTemplateId
    };
    isCreatingFormat = true;
    isEditingFormat = false;
    formatMode = 'new';
    selectedTemplateId = '';
    templateName = '';
    columns = [defaultColumns[0]];
    newColName = '';
    newColType = 'text';
    view = 'format-builder';
  };

  const startEditFormat = () => {
    if (!selectedTemplateId) return;
    formatReturnView = view;
    formatBackup = {
      columns: columns.map((c) => ({ ...c })),
      selectedTemplateId
    };
    isEditingFormat = true;
    isCreatingFormat = false;
    formatMode = 'edit';
    view = 'format-builder';
  };

  const saveEditedFormat = async () => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    const updated = {
      ...tpl,
      columns: columns.map((c) => ({ ...c }))
    };
    await updateTemplate(updated);
    templates = templates.map((t) => (t.id === updated.id ? updated : t));
    isEditingFormat = false;
    persistSettings();
    isDirty = true;
    formatBackup = null;
    view = formatReturnView;
  };

  const cancelFormatEdit = () => {
    if (formatBackup) {
      columns = formatBackup.columns.map((c) => ({ ...c }));
      selectedTemplateId = formatBackup.selectedTemplateId;
    }
    isCreatingFormat = false;
    isEditingFormat = false;
    formatBackup = null;
    view = formatReturnView;
  };

  const reorderColumns = (from, to) => {
    if (from === null || to === null || from === to) return;
    const next = columns.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    columns = next;
    isDirty = true;
  };

  const startEditColumn = (idx) => {
    const col = columns[idx];
    if (!col) return;
    editingColIndex = idx;
    editColName = col.name;
    editColType = col.type;
  };

  const saveEditColumn = () => {
    if (editingColIndex === null) return;
    if (!editColName.trim()) return;
    columns = columns.map((col, idx) => {
      if (idx !== editingColIndex) return col;
      if (col.isPhoto) {
        return { ...col, name: editColName.trim() };
      }
      return { ...col, name: editColName.trim(), type: editColType };
    });
    isDirty = true;
    editingColIndex = null;
    editColName = '';
    editColType = 'text';
  };

  const cancelEditColumn = () => {
    editingColIndex = null;
    editColName = '';
    editColType = 'text';
  };

  const startTouchDrag = (idx) => {
    clearTimeout(touchTimer);
    touchDragIndex = idx;
    touchTimer = setTimeout(() => {
      touchDragging = true;
    }, 250);
  };

  const moveTouchDrag = (event) => {
    if (!touchDragging) return;
    event.preventDefault();
    const touch = event.touches?.[0];
    if (!touch) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = target?.closest?.('.col-card');
    if (!card) return;
    const idx = Number(card.dataset.index);
    if (Number.isNaN(idx)) return;
    reorderColumns(touchDragIndex, idx);
    touchDragIndex = idx;
  };

  const endTouchDrag = () => {
    clearTimeout(touchTimer);
    touchDragging = false;
    touchDragIndex = null;
  };

  const startProtocol = async () => {
    activeProtocolId = null;
    activeProtocolCreatedAt = null;
    await clearEntries();
    entries = [];
    await persistSettings();
    isDirty = false;
    view = 'main';
  };

  const saveSetup = async () => {
    await persistSettings();
    isDirty = true;
    view = 'main';
  };

  const openProtocol = async (id) => {
    const protocol = await getProtocol(id);
    if (!protocol) return;
    activeProtocolId = protocol.id;
    activeProtocolCreatedAt = protocol.createdAt;
    projectName = protocol.projectName || '';
    protocolDate = protocol.protocolDate || today();
    protocolDescription = protocol.protocolDescription || '';
    columns = protocol.columns?.length ? protocol.columns : [...defaultColumns];
    entries = (protocol.entries || []).map((e) => ({
      ...e,
      photoPreview: e.photoBlob ? blobToObjectUrl(e.photoBlob) : ''
    }));

    await clearEntries();
    for (const e of entries) {
      await addEntry({
        id: e.id,
        createdAt: e.createdAt,
        fields: e.fields,
        photoBlob: e.photoBlob ?? null
      });
    }

    isDirty = false;
    editingEntryId = null;
    view = 'protocol-view';
  };

  const startEntry = () => {
    editingEntryId = null;
    entryDraft = { fields: {}, photoFile: null, photoPreview: '' };
    fieldIndex = 0;
    view = 'photo';
  };

  const editEntry = (entry) => {
    editingEntryId = entry.id;
    entryDraft = {
      fields: { ...entry.fields },
      photoFile: entry.photoBlob ?? null,
      photoPreview: entry.photoPreview ?? ''
    };
    fieldIndex = 0;
    view = 'field';
  };

  const removeEntryItem = async (entryId) => {
    entries = entries.filter((e) => e.id !== entryId);
    await deleteEntry(entryId);
    isDirty = true;
  };

  const handlePhoto = async (e) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    entryDraft.photoFile = compressed;
    entryDraft.photoPreview = blobToObjectUrl(compressed);
    isDirty = true;
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
      const entryId = editingEntryId || fallbackId();
      const snapshot = {
        id: entryId,
        createdAt: editingEntryId ? entryDraft.createdAt || new Date().toISOString() : new Date().toISOString(),
        fields: { ...entryDraft.fields },
        photoBlob: entryDraft.photoFile ?? null
      };

      await addEntry(snapshot);

      if (editingEntryId) {
        entries = entries.map((e) =>
          e.id === editingEntryId
            ? { ...snapshot, photoPreview: snapshot.photoBlob ? blobToObjectUrl(snapshot.photoBlob) : '' }
            : e
        );
      } else {
        entries = [
          {
            ...snapshot,
            photoPreview: snapshot.photoBlob ? blobToObjectUrl(snapshot.photoBlob) : ''
          },
          ...entries
        ];
      }

      isDirty = true;
      entryDraft = { fields: {}, photoFile: null, photoPreview: '' };
      editingEntryId = null;
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

  const buildProtocolRecord = () => {
    const now = new Date().toISOString();
    return {
      id: activeProtocolId || `protocol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: activeProtocolCreatedAt || now,
      updatedAt: now,
      projectName: projectName || '',
      protocolDate: protocolDate || today(),
      protocolDescription: protocolDescription || '',
      columns: columns.map((c) => ({ ...c })),
      entries: entries.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        fields: e.fields,
        photoBlob: e.photoBlob ?? null
      }))
    };
  };

  const saveAndExportProtocol = async () => {
    const protocolRecord = buildProtocolRecord();
    await addProtocol(protocolRecord);
    isDirty = false;

    const result = await exportToXlsxData({
      projectName: protocolRecord.projectName,
      protocolDate: protocolRecord.protocolDate,
      protocolDescription: protocolRecord.protocolDescription,
      columns: protocolRecord.columns,
      entries: protocolRecord.entries
    });

    let exportRecord = null;
    if (result) {
      exportRecord = await upsertExportByProtocol({
        id: `export_${protocolRecord.id}`,
        protocolId: protocolRecord.id,
        createdAt: protocolRecord.createdAt,
        updatedAt: new Date().toISOString(),
        filename: result.filename,
        base64: result.base64,
        projectName: protocolRecord.projectName,
        protocolDate: protocolRecord.protocolDate
      });
    }

    return { protocolRecord, exportRecord };
  };

  const closeProtocol = () => {
    closeError = '';
    if (isExporting) return;

    // If existing protocol and no changes, just return to list without prompt
    if (activeProtocolId && !isDirty) {
      resetProtocol();
      view = 'protocols';
      return;
    }

    confirmDialog = {
      open: true,
      title: 'Vorgang abschließen',
      message: 'Excel jetzt direkt herunterladen?',
      primaryLabel: 'Ja, downloaden',
      secondaryLabel: 'Nein',
      onPrimary: async () => {
        if (isExporting) return;
        isExporting = true;
        try {
          const { exportRecord } = await saveAndExportProtocol();
          protocolsList = await listProtocols();
          exportsList = await listExports();
          if (exportRecord) await downloadExport(exportRecord);
          await resetProtocol();
          view = 'protocols';
          closeConfirm();
        } catch (err) {
          closeError = 'Abschluss fehlgeschlagen. Bitte erneut versuchen.';
          console.error(err);
        } finally {
          isExporting = false;
        }
      },
      onSecondary: async () => {
        if (isExporting) return;
        isExporting = true;
        try {
          await saveAndExportProtocol();
          protocolsList = await listProtocols();
          exportsList = await listExports();
          await resetProtocol();
          view = 'protocols';
          closeConfirm();
        } catch (err) {
          closeError = 'Abschluss fehlgeschlagen. Bitte erneut versuchen.';
          console.error(err);
        } finally {
          isExporting = false;
        }
      }
    };
  };

  const resetProtocol = async () => {
    await clearEntries();
    await clearSettings();
    entries = [];
    projectName = '';
    protocolDate = today();
    protocolDescription = '';
    columns = [...defaultColumns];
    activeProtocolId = null;
    activeProtocolCreatedAt = null;
    isDirty = false;
    view = 'start';
  };

  const cancelProtocol = () => {
    if (activeProtocolId && !isDirty) {
      resetProtocol();
      return;
    }
    confirmDialog = {
      open: true,
      title: 'Protokoll verlassen',
      message: 'Möchtest du die aktuellen Daten speichern oder verwerfen?',
      primaryLabel: 'Speichern',
      secondaryLabel: 'Verwerfen',
      onPrimary: async () => {
        const protocolRecord = buildProtocolRecord();
        await addProtocol(protocolRecord);
        const result = await exportToXlsxData({
          projectName: protocolRecord.projectName,
          protocolDate: protocolRecord.protocolDate,
          protocolDescription: protocolRecord.protocolDescription,
          columns: protocolRecord.columns,
          entries: protocolRecord.entries
        });
        if (result) {
          await upsertExportByProtocol({
            id: `export_${protocolRecord.id}`,
            protocolId: protocolRecord.id,
            createdAt: protocolRecord.createdAt,
            updatedAt: new Date().toISOString(),
            filename: result.filename,
            base64: result.base64,
            projectName: protocolRecord.projectName,
            protocolDate: protocolRecord.protocolDate
          });
        }
        protocolsList = await listProtocols();
        exportsList = await listExports();
        await resetProtocol();
        view = 'protocols';
        isDirty = false;
        closeConfirm();
      },
      onSecondary: async () => {
        await resetProtocol();
        closeConfirm();
      }
    };
  };

  const closeConfirm = () => {
    confirmDialog = {
      open: false,
      title: '',
      message: '',
      primaryLabel: '',
      secondaryLabel: '',
      onPrimary: null,
      onSecondary: null
    };
  };

  const goToProtocols = async () => {
    protocolsList = await listProtocols();
    selectionModeProtocols = false;
    selectedProtocols = new Set();
    view = 'protocols';
  };

  const goToExports = async () => {
    exportsList = await listExports();
    selectionModeExports = false;
    selectedExports = new Set();
    view = 'exports';
  };

  const goToStart = () => {
    view = 'landing';
  };

  const downloadExport = async (exp) => {
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
    const filename = buildFilename(exp.projectName, exp.protocolDate);

    if (navigator?.canShare) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename, text: 'Baustellen-Protokoll' });
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const downloadProtocolExport = async (protocol) => {
    let exp = exportsList.find((e) => e.protocolId === protocol.id);
    if (!exp) {
      const result = await exportToXlsx({
        projectName: protocol.projectName,
        protocolDate: protocol.protocolDate,
        protocolDescription: protocol.protocolDescription,
        columns: protocol.columns,
        entries: protocol.entries
      });
      if (result) {
        exp = await upsertExportByProtocol({
          id: `export_${protocol.id}`,
          protocolId: protocol.id,
          createdAt: protocol.createdAt,
          updatedAt: new Date().toISOString(),
          filename: result.filename,
          base64: result.base64,
          projectName: protocol.projectName,
          protocolDate: protocol.protocolDate
        });
        exportsList = await listExports();
      }
    }
    if (exp) {
      await downloadExport(exp);
    }
  };


  const toggleProtocolsSelection = (id) => {
    const next = new Set(selectedProtocols);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedProtocols = next;
  };

  const toggleExportsSelection = (id) => {
    const next = new Set(selectedExports);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedExports = next;
  };

  const toggleSelectionModeProtocols = () => {
    selectionModeProtocols = !selectionModeProtocols;
    if (!selectionModeProtocols) {
      selectedProtocols = new Set();
    }
  };

  const toggleSelectionModeExports = () => {
    selectionModeExports = !selectionModeExports;
    if (!selectionModeExports) {
      selectedExports = new Set();
    }
  };

  const selectAllProtocols = () => {
    selectedProtocols = new Set(protocolsList.map((p) => p.id));
  };

  const selectAllExports = () => {
    selectedExports = new Set(exportsList.map((e) => e.id));
  };

  const downloadSelectedProtocols = async () => {
    if (selectedProtocols.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    for (const protocol of protocolsList.filter((p) => selectedProtocols.has(p.id))) {
      await downloadProtocolExport(protocol);
    }
  };

  const downloadSelectedExports = async () => {
    if (selectedExports.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    for (const exp of exportsList.filter((e) => selectedExports.has(e.id))) {
      await downloadExport(exp);
    }
  };

  const deleteSelectedProtocols = async () => {
    if (selectedProtocols.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    const ok = window.confirm('Ausgewählte Vorgänge wirklich löschen?');
    if (!ok) return;
    for (const protocol of protocolsList.filter((p) => selectedProtocols.has(p.id))) {
      await deleteProtocol(protocol.id);
    }
    protocolsList = await listProtocols();
    exportsList = await listExports();
    selectedProtocols = new Set();
    selectionModeProtocols = false;
  };

  const deleteSelectedExports = async () => {
    if (selectedExports.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    const ok = window.confirm('Ausgewählte Exporte wirklich löschen?');
    if (!ok) return;
    for (const exp of exportsList.filter((e) => selectedExports.has(e.id))) {
      await deleteExport(exp.id);
    }
    exportsList = await listExports();
    selectedExports = new Set();
    selectionModeExports = false;
  };

  function today() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  }

  function buildFilename(name, date) {
    const cleanName = sanitizeFilename(name || 'protokoll');
    const cleanDate = sanitizeFilename(date || today());
    return `${cleanName}_${cleanDate}.xlsx`;
  }

  function sanitizeFilename(value) {
    return String(value).replace(/[^a-z0-9\\-_. ]/gi, '_').trim() || 'protokoll';
  }
</script>

<div class="page">
  {#if updateAvailable}
    <div class="update-banner">
      <span>Neue Version verfügbar.</span>
      <button type="button" class="primary" on:click={() => location.reload()}>Aktualisieren</button>
    </div>
  {/if}
  <header class="hero">
    <div>
      <p class="eyebrow">Baustellen Tool</p>
      <h1>Protokoll App</h1>
      <p class="sub">Schrittweise Dokumentation mit Foto und XLSX-Export.</p>
    </div>
    {#if view === 'start' || view === 'edit-setup'}
      <button class="toolbox-link" type="button" on:click={() => (view = 'landing')}>Zur Startseite</button>
    {:else if view === 'landing'}
      <a class="toolbox-link" href="/baustellen-tools/">Zur Toolbox</a>
    {/if}
  </header>

  {#if view === 'landing'}
    <section class="panel landing">
      <h2>Protokoll starten</h2>
      <p class="muted">Lege einen neuen Vorgang an oder öffne bestehende Protokolle.</p>
      <div class="cta-row">
        <button class="primary full-width" type="button" on:click={() => (view = 'start')}>
          Neues Protokoll starten
        </button>
      </div>
      <div class="cta-row split">
        <button type="button" on:click={goToProtocols}>Protokolle anzeigen</button>
        <button type="button" on:click={goToExports}>Exports anzeigen</button>
      </div>
    </section>
  {/if}

  {#if view === 'start' || view === 'edit-setup'}
    <section class="panel">
      <h2>{view === 'edit-setup' ? 'Vorgang bearbeiten' : 'Protokoll erstellen'}</h2>
      <div class="section">
        <h3>Stammdaten</h3>
        <label class="field">
          <span>Projektname</span>
          <input bind:value={projectName} placeholder="Trag den Projektnamen ein" on:input={() => (isDirty = true)} />
        </label>

        <label class="field">
          <span>Beschreibung</span>
          <input
            type="text"
            placeholder="Kurzbeschreibung"
            bind:value={protocolDescription}
            on:input={() => (isDirty = true)}
          />
        </label>

        <label class="field">
          <span>Datum</span>
          <div class="readonly-field">{protocolDate}</div>
        </label>
      </div>

      <div class="section">
        <h3>Tabellenformat</h3>

        <div class="grid">
          <label class="field">
            <span>Format auswählen</span>
            <select bind:value={selectedTemplateId} on:change={applyTemplate}>
              <option value="">Format auswählen</option>
              {#each templates as tpl}
                <option value={tpl.id}>{tpl.name}</option>
              {/each}
            </select>
            {#if templates.length === 0}
              <span class="muted">Noch kein Format vorhanden. Bitte zuerst erstellen.</span>
            {/if}
          </label>
          <div class="field">
            <span>Neues Format</span>
            <button type="button" on:click={startNewFormat}>Neues Format anlegen</button>
          </div>
        </div>
        {#if selectedTemplateId}
          <div class="format-preview">
            <div class="muted">Tabellenvorschau</div>
            <div class="table-preview">
              <table>
                <thead>
                  <tr>
                    {#each columns as col}
                      <th>{col.name}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {#each columns as col}
                      <td class:cell-number={col.type === 'number'}>
                        {#if col.isPhoto}
                          Foto
                        {:else if col.type === 'number'}
                          123
                        {:else}
                          Beispiel
                        {/if}
                      </td>
                    {/each}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="cta-row">
            <button type="button" on:click={startEditFormat}>Format bearbeiten</button>
          </div>
        {/if}
      </div>

      <div class="cta-row">
        {#if view === 'edit-setup'}
          <button class="primary" type="button" on:click={saveSetup}>Änderungen speichern</button>
          <button type="button" on:click={() => (view = 'main')}>Zurück</button>
        {:else}
          <button class="primary full-width" type="button" on:click={startProtocol}>Protokoll starten</button>
        {/if}
      </div>
    </section>
  {/if}

  {#if view === 'format-builder'}
    <section class="panel">
      <h2>{formatMode === 'edit' ? 'Format bearbeiten' : 'Neues Tabellenformat'}</h2>
      <p class="muted">
        Lege fest, welche Informationen pro Eintrag abgefragt werden. Die Foto-Spalte ist immer dabei und wird automatisch
        in die Excel übernommen.
      </p>

      {#if formatMode === 'new'}
        <label class="field">
          <span>Formatname</span>
          <input bind:value={templateName} placeholder="z. B. Standard Baustelle" />
        </label>
      {/if}

      <div class="section">
        <h3>Spalten definieren</h3>
        <div class="columns">
          {#each columns as col, idx (col.name)}
            <div
              class:dragging={dragIndex === idx}
              class:touch-dragging={touchDragging}
              class="col-card"
              draggable="true"
              data-index={idx}
              animate:flip={{ duration: 180 }}
              on:dragstart={() => (dragIndex = idx)}
              on:dragend={() => (dragIndex = null)}
              on:dragover|preventDefault
              on:drop={() => {
                reorderColumns(dragIndex, idx);
                dragIndex = null;
              }}
              on:touchstart={() => startTouchDrag(idx)}
              on:touchmove|preventDefault={moveTouchDrag}
              on:touchend={endTouchDrag}
              on:touchcancel={endTouchDrag}
            >
              <span class="drag-handle" aria-hidden="true">⋮⋮</span>
              {#if editingColIndex === idx}
                <div class="edit-col">
                  <input bind:value={editColName} placeholder="Spaltenname" />
                  <select bind:value={editColType} disabled={col.isPhoto}>
                    <option value="text">Text</option>
                    <option value="number">Zahl</option>
                  </select>
                  <div class="edit-actions">
                    <button class="primary" type="button" on:click={saveEditColumn}>Speichern</button>
                    <button type="button" on:click={cancelEditColumn}>Abbrechen</button>
                  </div>
                </div>
              {:else}
                <div class="col-title">{col.name}</div>
                <div class="col-meta">Typ: {col.type}</div>
                <div class="col-actions">
                  <button type="button" on:click={() => startEditColumn(idx)}>Bearbeiten</button>
                  {#if !col.isPhoto}
                    <button type="button" on:click={() => removeColumn(col.name)}>Spalte entfernen</button>
                  {:else}
                    <span class="photo-pill">Foto-Spalte</span>
                  {/if}
                </div>
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
      </div>

      <div class="cta-row">
        {#if formatMode === 'edit'}
          <button class="primary" type="button" on:click={saveEditedFormat}>Änderungen speichern</button>
        {:else}
          <button class="primary" type="button" on:click={saveTemplate}>Format speichern</button>
        {/if}
        <button type="button" on:click={cancelFormatEdit}>Abbrechen</button>
      </div>
    </section>
  {/if}

  {#if view === 'main'}
    <section class="panel">
      <h2>{projectName || 'Protokoll'}</h2>
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
          <div>{entries.length}</div>
        </div>
      </div>

      <div class="cta-row">
        <button class="primary" type="button" on:click={startEntry}>Eintrag machen</button>
        <button type="button" on:click={() => (view = 'edit-setup')}>Stammdaten bearbeiten</button>
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
                <div class="entry-actions">
                  <button type="button" on:click={() => editEntry(e)}>Bearbeiten</button>
                  <button type="button" class="danger" on:click={() => removeEntryItem(e.id)}>Löschen</button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if view === 'protocol-view'}
    <section class="panel">
      <h2>{projectName || 'Protokoll'}</h2>
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
          <div>{entries.length}</div>
        </div>
      </div>

      <div class="cta-row">
        <button class="primary" type="button" on:click={() => (view = 'main')}>Bearbeiten</button>
        <button type="button" on:click={() => downloadProtocolExport(buildProtocolRecord())}>Download</button>
        <button type="button" on:click={goToProtocols}>Zurück</button>
      </div>

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
        <button type="button" on:click={goToNextField}>Weiter</button>
      {/if}

      <div class="cta-row">
        <button type="button" on:click={() => (view = 'main')}>Zurück</button>
        {#if !entryDraft.photoPreview}
          <button class="primary" type="button" on:click={goToNextField}>Weiter ohne Bild</button>
        {/if}
      </div>
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
              <input
                type="number"
                placeholder={col.name}
                bind:value={entryDraft.fields[col.name]}
                on:input={() => (isDirty = true)}
              />
            {:else}
              <input
                type="text"
                placeholder={col.name}
                bind:value={entryDraft.fields[col.name]}
                on:input={() => (isDirty = true)}
              />
            {/if}
          </label>
        {/each}

        <div class="cta-row">
          {#if fieldIndex === 0}
            <button type="button" on:click={() => (view = 'photo')}>Zurück</button>
          {:else}
            <button type="button" on:click={() => (fieldIndex -= 1)}>Zurück</button>
          {/if}
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

  {#if view === 'protocols'}
    <section class="panel">
      <h2>Protokolle</h2>
      {#if protocolsList.length === 0}
        <p class="muted">Noch keine Protokolle vorhanden.</p>
      {:else}
        <div class="exports">
          {#each protocolsList as protocol}
            <div class="export-card">
              {#if selectionModeProtocols}
                <label class="export-select">
                  <input
                    type="checkbox"
                    checked={selectedProtocols.has(protocol.id)}
                    on:change={() => toggleProtocolsSelection(protocol.id)}
                  />
                </label>
              {/if}
              <div class="export-info">
                <div class="export-name">{protocol.projectName || 'Ohne Namen'}</div>
                <div class="export-meta">
                  {protocol.protocolDate} · {protocol.protocolDescription || '—'} · {protocol.entries?.length || 0} Einträge
                </div>
              </div>
              <div class="export-actions">
                <button type="button" on:click={() => openProtocol(protocol.id)}>Öffnen</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if protocolsList.length > 0}
        <div class="cta-row">
          <button type="button" on:click={toggleSelectionModeProtocols}>
            {selectionModeProtocols ? 'Auswahl beenden' : 'Auswählen'}
          </button>
          {#if selectionModeProtocols}
            <button type="button" on:click={downloadSelectedProtocols}>Auswahl herunterladen</button>
            <button type="button" on:click={selectAllProtocols}>Alle auswählen</button>
            <button type="button" class="danger" on:click={deleteSelectedProtocols}>Löschen</button>
          {/if}
        </div>
      {/if}
      <div class="cta-row">
        <button type="button" on:click={goToStart}>Zur Startseite</button>
        <button type="button" on:click={goToExports}>Exports anzeigen</button>
      </div>
    </section>
  {/if}

  {#if view === 'exports'}
    <section class="panel">
      <h2>Exports</h2>
      {#if exportsList.length === 0}
        <p class="muted">Noch keine Exporte vorhanden.</p>
      {:else}
        <div class="exports">
          {#each exportsList as exp}
            <div class="export-card">
              {#if selectionModeExports}
                <label class="export-select">
                  <input
                    type="checkbox"
                    checked={selectedExports.has(exp.id)}
                    on:change={() => toggleExportsSelection(exp.id)}
                  />
                </label>
              {/if}
              <div class="export-info">
                <div class="export-name">{exp.filename}</div>
                <div class="export-meta">
                  {new Date(exp.updatedAt || exp.createdAt).toLocaleString()} · {exp.projectName} · {exp.protocolDate}
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
          <button type="button" on:click={toggleSelectionModeExports}>
            {selectionModeExports ? 'Auswahl beenden' : 'Auswählen'}
          </button>
          {#if selectionModeExports}
            <button type="button" on:click={downloadSelectedExports}>Auswahl herunterladen</button>
            <button type="button" on:click={selectAllExports}>Alle auswählen</button>
            <button type="button" class="danger" on:click={deleteSelectedExports}>Löschen</button>
          {/if}
        </div>
      {/if}
      <div class="cta-row">
        <button type="button" on:click={goToStart}>Zur Startseite</button>
        <button type="button" on:click={goToProtocols}>Protokolle anzeigen</button>
      </div>
    </section>
  {/if}

  {#if confirmDialog.open}
    <div class="modal-backdrop" on:click={closeConfirm}></div>
    <div class="modal">
      <h3>{confirmDialog.title}</h3>
      <p class="muted">{confirmDialog.message}</p>
      <div class="cta-row">
        <button class="primary" type="button" on:click={confirmDialog.onPrimary}>Speichern</button>
        <button class="danger" type="button" on:click={confirmDialog.onSecondary}>
          {confirmDialog.secondaryLabel}
        </button>
        <button type="button" on:click={closeConfirm}>Abbrechen</button>
      </div>
    </div>
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

  .toolbox-link {
    border: 1px solid var(--border);
    padding: 8px 12px;
    border-radius: 999px;
    text-decoration: none;
    color: var(--ink);
    font-weight: 600;
    background: #fff;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 12px 30px rgba(23, 21, 18, 0.08);
  }

  .section {
    border: 1px dashed var(--border);
    border-radius: 14px;
    padding: 14px;
    margin: 14px 0;
    background: #fff;
  }

  .update-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: #fff7ed;
    color: #7c2d12;
    margin-bottom: 16px;
    font-weight: 600;
  }

  .landing {
    text-align: left;
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

  .full-width {
    width: 100%;
    justify-content: center;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
    cursor: grab;
    position: relative;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .col-card:active {
    cursor: grabbing;
  }

  .col-card.dragging {
    opacity: 0.6;
    border-style: solid;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  }

  .col-card.touch-dragging {
    touch-action: none;
  }

  .drag-handle {
    position: absolute;
    top: 8px;
    right: 10px;
    color: var(--muted);
    font-size: 14px;
    letter-spacing: -2px;
  }

  .col-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .edit-col {
    display: grid;
    gap: 8px;
  }

  .edit-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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

  .format-preview {
    margin-top: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
  }

  .table-preview {
    margin-top: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    background: #faf7f2;
  }

  .table-preview table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: max-content;
  }

  .table-preview th,
  .table-preview td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    text-align: left;
  }

  .table-preview th:last-child,
  .table-preview td:last-child {
    border-right: none;
  }

  .table-preview thead th {
    background: #f1ede7;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
  }

  .table-preview tbody tr:last-child td {
    border-bottom: none;
  }

  .cell-number {
    text-align: center;
  }

  .add-row {
    display: grid;
    grid-template-columns: 1fr 150px 200px;
    gap: 10px;
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

  .cta-row.split {
    width: 100%;
    flex-wrap: nowrap;
  }

  .cta-row.split > button {
    flex: 1 1 0;
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

  .entry-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
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

  .muted {
    color: var(--muted);
  }

  .error {
    color: #b91c1c;
    font-weight: 600;
    margin-top: 8px;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    z-index: 50;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, 92vw);
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    z-index: 60;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  }

  .modal h3 {
    margin: 0 0 8px;
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
