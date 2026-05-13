/* global PDFLib */
const { PDFDocument } = PDFLib || {};

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');

const mergeDropzone = document.getElementById('merge-dropzone');
const mergeInput = document.getElementById('merge-input');
const mergeList = document.getElementById('merge-list');
const mergeRun = document.getElementById('merge-run');
const mergeClear = document.getElementById('merge-clear');
const mergeStatus = document.getElementById('merge-status');
const mergeName = document.getElementById('merge-name');

const splitDropzone = document.getElementById('split-dropzone');
const splitInput = document.getElementById('split-input');
const splitRun = document.getElementById('split-run');
const splitStatus = document.getElementById('split-status');
const splitFileName = document.getElementById('split-filename');
const splitPages = document.getElementById('split-pages');
const splitSingle = document.getElementById('split-single');
const rangeList = document.getElementById('range-list');
const rangeAdd = document.getElementById('range-add');
const rangeEvery = document.getElementById('range-every');
const rangeGenerate = document.getElementById('range-generate');

let mergeItems = [];
let splitFile = null;
let splitPageCount = 0;
let splitRanges = [];
let currentDragId = null;

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isPdfFile = (file) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const stripPdfExtension = (fileName) => fileName.replace(/\.pdf$/i, '');

const ensurePdfExtension = (fileName) =>
  fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;

const getPageIndices = (start, end) =>
  Array.from({ length: end - start + 1 }, (_, idx) => start - 1 + idx);

const setStatus = (element, message, type = '') => {
  element.textContent = message;
  element.className = `status ${type}`.trim();
};

const downloadBlob = (bytes, fileName) => {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const ensurePdfLib = () => {
  if (!PDFDocument) {
    throw new Error('PDF library failed to load. Check your connection or script tag.');
  }
};

const readPageCount = async (file) => {
  ensurePdfLib();
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer);
  return doc.getPageCount();
};

const enableDropzone = (dropzone, onFiles) => {
  const input = dropzone.querySelector('input[type="file"]');
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    onFiles(event.dataTransfer.files);
  });
  input.addEventListener('change', () => onFiles(input.files));
};

const filterPdfFiles = (fileList) => Array.from(fileList).filter(isPdfFile);

const renderMergeList = () => {
  mergeList.innerHTML = '';
  mergeItems.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.draggable = true;
    li.dataset.id = item.id;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const title = document.createElement('strong');
    title.textContent = item.name;
    const detail = document.createElement('span');
    detail.className = 'muted';
    detail.textContent = item.pages
      ? `${item.pages} pages`
      : item.error
      ? item.error
      : 'Reading pages…';
    meta.append(title, detail);

    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.dataset.action = 'remove';
    remove.textContent = 'Remove';

    li.append(handle, meta, remove);
    mergeList.append(li);
  });

  mergeRun.disabled =
    mergeItems.length < 2 || mergeItems.some((item) => item.error || !item.pages);
};

const moveItem = (items, fromIndex, toIndex) => {
  const updated = [...items];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  return updated;
};

mergeList.addEventListener('click', (event) => {
  if (event.target.matches('button[data-action="remove"]')) {
    const id = event.target.closest('li').dataset.id;
    mergeItems = mergeItems.filter((item) => item.id !== id);
    renderMergeList();
  }
});

mergeList.addEventListener('dragstart', (event) => {
  const item = event.target.closest('li');
  if (!item) return;
  currentDragId = item.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
});

mergeList.addEventListener('dragover', (event) => {
  event.preventDefault();
});

mergeList.addEventListener('drop', (event) => {
  event.preventDefault();
  const target = event.target.closest('li');
  if (!target || !currentDragId) return;
  const fromIndex = mergeItems.findIndex((item) => item.id === currentDragId);
  const toIndex = mergeItems.findIndex((item) => item.id === target.dataset.id);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
  mergeItems = moveItem(mergeItems, fromIndex, toIndex);
  renderMergeList();
});

mergeClear.addEventListener('click', () => {
  mergeItems = [];
  renderMergeList();
  setStatus(mergeStatus, '');
});

mergeRun.addEventListener('click', async () => {
  try {
    setStatus(mergeStatus, 'Merging PDFs…');
    ensurePdfLib();
    const merged = await PDFDocument.create();
    for (const item of mergeItems) {
      const sourceBuffer = await item.file.arrayBuffer();
      const sourceDoc = await PDFDocument.load(sourceBuffer);
      const pages = await merged.copyPages(sourceDoc, sourceDoc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    const bytes = await merged.save();
    const outputName = mergeName.value.trim() || 'merged.pdf';
    downloadBlob(bytes, ensurePdfExtension(outputName));
    setStatus(mergeStatus, 'Merge complete.', 'success');
  } catch (error) {
    setStatus(mergeStatus, error.message || 'Failed to merge PDFs.', 'error');
  }
});

const addMergeFiles = async (files) => {
  const pdfFiles = filterPdfFiles(files);
  if (!pdfFiles.length) {
    setStatus(mergeStatus, 'Please add valid PDF files.', 'error');
    return;
  }
  const newItems = pdfFiles.map((file) => ({
    id: createId(),
    file,
    name: file.name,
    pages: null,
    error: null,
  }));
  mergeItems = [...mergeItems, ...newItems];
  renderMergeList();

  await Promise.all(
    newItems.map(async (item) => {
      try {
        item.pages = await readPageCount(item.file);
      } catch (error) {
        item.error = 'Unable to read';
      }
      renderMergeList();
    })
  );
};

const renderRanges = () => {
  rangeList.innerHTML = '';
  splitRanges.forEach((range) => {
    const li = document.createElement('li');
    li.className = 'range-item';
    li.draggable = true;
    li.dataset.id = range.id;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.min = 1;
    startInput.max = splitPageCount || 1;
    startInput.value = range.start;
    startInput.addEventListener('input', () => {
      range.start = Number(startInput.value);
    });

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.min = 1;
    endInput.max = splitPageCount || 1;
    endInput.value = range.end;
    endInput.addEventListener('input', () => {
      range.end = Number(endInput.value);
    });

    const label = document.createElement('span');
    label.className = 'muted';
    label.textContent = 'to';

    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.dataset.action = 'remove';
    remove.textContent = 'Remove';

    li.append(handle, startInput, label, endInput, remove);
    rangeList.append(li);
  });
};

const getValidatedRanges = () => {
  return splitRanges
    .map((range) => ({
      start: Math.max(1, Math.min(range.start, splitPageCount)),
      end: Math.max(1, Math.min(range.end, splitPageCount)),
    }))
    .map((range) => ({
      start: Math.min(range.start, range.end),
      end: Math.max(range.start, range.end),
    }))
    .filter((range) => range.start <= range.end);
};

rangeList.addEventListener('click', (event) => {
  if (event.target.matches('button[data-action="remove"]')) {
    const id = event.target.closest('li').dataset.id;
    splitRanges = splitRanges.filter((range) => range.id !== id);
    renderRanges();
  }
});

rangeList.addEventListener('dragstart', (event) => {
  const item = event.target.closest('li');
  if (!item) return;
  currentDragId = item.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
});

rangeList.addEventListener('dragover', (event) => {
  event.preventDefault();
});

rangeList.addEventListener('drop', (event) => {
  event.preventDefault();
  const target = event.target.closest('li');
  if (!target || !currentDragId) return;
  const fromIndex = splitRanges.findIndex((range) => range.id === currentDragId);
  const toIndex = splitRanges.findIndex((range) => range.id === target.dataset.id);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
  splitRanges = moveItem(splitRanges, fromIndex, toIndex);
  renderRanges();
});

rangeAdd.addEventListener('click', () => {
  const lastEnd = splitRanges.length
    ? splitRanges[splitRanges.length - 1].end
    : splitPageCount || 1;
  const start = Math.min(lastEnd + 1, splitPageCount || 1);
  const end = splitPageCount || 1;
  splitRanges.push({ id: createId(), start, end });
  renderRanges();
});

rangeGenerate.addEventListener('click', () => {
  const every = Number(rangeEvery.value);
  if (!every || every < 1 || !splitPageCount) return;
  splitRanges = [];
  let start = 1;
  while (start <= splitPageCount) {
    const end = Math.min(start + every - 1, splitPageCount);
    splitRanges.push({ id: createId(), start, end });
    start = end + 1;
  }
  renderRanges();
});

const handleSplitFile = async (file) => {
  try {
    setStatus(splitStatus, 'Reading PDF…');
    splitFile = file;
    splitFileName.textContent = file.name;
    splitPageCount = await readPageCount(file);
    splitPages.textContent = `${splitPageCount} pages`;
    splitRanges = [{ id: createId(), start: 1, end: splitPageCount }];
    renderRanges();
    splitRun.disabled = false;
    setStatus(splitStatus, '');
  } catch (error) {
    setStatus(splitStatus, error.message || 'Unable to read PDF.', 'error');
  }
};

splitRun.addEventListener('click', async () => {
  if (!splitFile) return;
  try {
    setStatus(splitStatus, 'Splitting PDF…');
    ensurePdfLib();
    const sourceBuffer = await splitFile.arrayBuffer();
    const sourceDoc = await PDFDocument.load(sourceBuffer);
    const outputRanges = splitSingle.checked
      ? Array.from({ length: splitPageCount }, (_, index) => ({
          start: index + 1,
          end: index + 1,
        }))
      : getValidatedRanges();

    if (!outputRanges.length) {
      setStatus(splitStatus, 'Add at least one valid range.', 'error');
      return;
    }

    let part = 1;
    for (const range of outputRanges) {
      const newDoc = await PDFDocument.create();
      const pages = await newDoc.copyPages(sourceDoc, getPageIndices(range.start, range.end));
      pages.forEach((page) => newDoc.addPage(page));
      const bytes = await newDoc.save();
      const baseName = stripPdfExtension(splitFile.name) || 'split';
      downloadBlob(bytes, `${baseName}-part-${part}.pdf`);
      part += 1;
    }
    setStatus(splitStatus, 'Split complete.', 'success');
  } catch (error) {
    setStatus(splitStatus, error.message || 'Failed to split PDF.', 'error');
  }
});

splitSingle.addEventListener('change', () => {
  const disabled = splitSingle.checked;
  rangeAdd.disabled = disabled;
  rangeGenerate.disabled = disabled;
  rangeEvery.disabled = disabled;
  rangeList.style.opacity = disabled ? 0.5 : 1;
});

const addSplitFiles = (files) => {
  const pdfFiles = filterPdfFiles(files);
  if (!pdfFiles.length) {
    setStatus(splitStatus, 'Please add a valid PDF.', 'error');
    return;
  }
  handleSplitFile(pdfFiles[0]);
};

const initTabs = () => {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((button) => button.classList.remove('active'));
      panels.forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(`${tab.dataset.tab}-panel`);
      panel.classList.add('active');
    });
  });
};

const init = () => {
  initTabs();
  enableDropzone(mergeDropzone, addMergeFiles);
  enableDropzone(splitDropzone, addSplitFiles);
  renderMergeList();
  renderRanges();
  setStatus(mergeStatus, '');
  setStatus(splitStatus, '');
};

init();
