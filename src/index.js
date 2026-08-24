import { Midy } from "https://cdn.jsdelivr.net/gh/marmooo/midy@0.6.3/dist/midy.min.js";
import { MIDIPlayer } from "https://cdn.jsdelivr.net/npm/@marmooo/midi-player@0.0.8/+esm";
import { Modal } from "https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/+esm";
import { MidiLibrary } from "https://marmooo.github.io/free-midi/midi-library.js";

function toggleDarkMode() {
  const html = document.documentElement;
  const newTheme = html.getAttribute("data-bs-theme") === "dark"
    ? "light"
    : "dark";
  html.setAttribute("data-bs-theme", newTheme);
  localStorage.setItem("darkMode", newTheme);
}

function getGlobalCSS() {
  const sheet = new CSSStyleSheet();
  let css = "";
  for (const s of document.styleSheets) {
    try {
      for (const r of s.cssRules) css += r.cssText;
    } catch { /* skip cross-origin sheets */ }
  }
  sheet.replaceSync(css);
  return sheet;
}

function setTuningEvents() {
  const tuningForm = document.getElementById("tuningForm");
  tuningForm.addEventListener("change", (event) => {
    const now = midy.audioContext.currentTime;
    const fieldset = event.target.closest("fieldset");
    const target = event.target;
    const value = Number(target.value);
    switch (fieldset.getAttribute("id")) {
      case "ReverbType":
        return midy.setReverbType(value);
      case "ChorusType":
        return midy.setChorusType(value, now);
      case "ScaleOctaveTuning":
        return setScaleOctaveTuning(fieldset, now);
      case "ChannelPressureEffects": {
        const index = Number(target.dataset.index);
        return setChannelPressureEffects(index, value, now);
      }
      case "PolyphonicKeyPressureEffects": {
        const index = Number(target.dataset.index);
        return setPolyphonicKeyPressureEffects(index, value, now);
      }
      case "ControlChangeEffects": {
        const index = Number(target.dataset.index);
        return setControlChangeEffects(index, value, now);
      }
      case "KeyBasedInstrumentControl": {
        const index = Number(target.dataset.index);
        return setKeyBasedController(index, value, now);
      }
    }
  });
}

function setScaleOctaveTuning(fieldset, scheduleTime) {
  const inputs = fieldset.querySelectorAll("input");
  const data = new Uint8Array(19);
  data[0] = 127; // realtime sysEx
  data[1] = 127; // all devices
  data[2] = 8;
  data[3] = 8; // 1-byte format
  data[4] = 0b00000011;
  data[5] = 0b00111111;
  data[6] = 0b00111111;
  for (let i = 0; i < 12; i++) {
    data[i + 7] = Number(inputs[i].value);
  }
  midy.handleScaleOctaveTuning1ByteFormatSysEx(data, true, scheduleTime);
}

function setChannelPressureEffects(index, value, scheduleTime) {
  const data = new Uint8Array(7);
  data[0] = 127; // realtime sysEx
  data[1] = 127; // all devices
  data[2] = 9;
  data[3] = 1;
  data[5] = index;
  data[6] = value;
  for (let i = 0; i < 16; i++) {
    data[4] = i; // channelNumber
    midy.handlePressureSysEx(data, "channelPressureTable", scheduleTime);
  }
}

function setPolyphonicKeyPressureEffects(index, value, scheduleTime) {
  const data = new Uint8Array(7);
  data[0] = 127; // realtime sysEx
  data[1] = 127; // all devices
  data[2] = 9;
  data[3] = 2;
  data[5] = index;
  data[6] = value;
  for (let i = 0; i < 16; i++) {
    data[4] = i; // channelNumber
    midy.handlePressureSysEx(data, "polyphonicKeyPressureTable", scheduleTime);
  }
}

function setControlChangeEffects(index, value, scheduleTime) {
  const data = new Uint8Array(8);
  data[0] = 127; // realtime sysEx
  data[1] = 127; // all devices
  data[2] = 9;
  data[3] = 3;
  data[6] = index;
  data[7] = value;
  for (let i = 0; i < 16; i++) {
    data[4] = i; // channelNumber
    for (let j = 1; j <= 15; j++) {
      data[5] = j; // controllerType
      midy.handleControlChangeSysEx(data, scheduleTime);
    }
    for (let j = 64; j <= 95; j++) {
      data[5] = j; // controllerType
      midy.handleControlChangeSysEx(data, scheduleTime);
    }
  }
}

function setKeyBasedController(index, value, scheduleTime) {
  const data = new Uint8Array(8);
  data[0] = 127; // realtime sysEx
  data[1] = 127; // all devices
  data[2] = 10;
  data[3] = 1;
  data[6] = index;
  data[7] = value;
  for (let i = 0; i < 16; i++) {
    data[4] = i; // channelNumber
    for (let j = 0; j < 128; j++) {
      data[5] = j; // keyNumber
      midy.handleKeyBasedInstrumentControlSysEx(data, scheduleTime);
    }
  }
}

async function setProgramChange(channelNumber, programNumber, scheduleTime) {
  const channel = midy.channels[channelNumber];
  const bankNumber = channel.isDrum ? 128 : channel.bankLSB;
  const index = midy.soundFontTable[programNumber][bankNumber];
  if (index === undefined) {
    const program = programNumber.toString().padStart(3, "0");
    const baseName = bankNumber === 128 ? "128" : program;
    const path = `${midiPlayer.soundFontURL}/${baseName}.sf3`;
    await midy.loadSoundFont(path);
  }
  channel.setProgramChange(programNumber, scheduleTime);
}

function setMixerInputEvents() {
  const tuningForm = document.getElementById("mixerForm");
  tuningForm.addEventListener("change", async (event) => {
    const input = event.target;
    if (input.tagName !== "INPUT") return;
    const tr = input.closest("tr");
    const tds = tr.querySelectorAll("td");
    const now = midy.audioContext.currentTime;
    const channelNumber = Number(tds[1].querySelector("select").value);
    const channels = midy.channels;
    const operation = tds[2].querySelector("select").value;
    if (operation.startsWith("CC")) {
      const controllerType = Number(operation.slice(2));
      const value = Math.ceil(Number(input.value) * 127);
      if (channelNumber < 0) {
        for (let i = 0; i < 16; i++) {
          channels[i].setControlChange(controllerType, value, now);
        }
      } else {
        channels[channelNumber].setControlChange(controllerType, value, now);
      }
    } else if (operation.startsWith("Event")) {
      const funcName = `set${operation.slice(5)}`;
      const value = Math.ceil(Number(input.value) * 127);
      if (funcName === "setProgramChange") {
        if (channelNumber < 0) {
          const promises = new Array(16);
          for (let i = 0; i < 16; i++) {
            promises[i] = setProgramChange(i, value, now);
          }
          await Promise.all(promises);
        } else {
          await setProgramChange(channelNumber, value, now);
        }
      } else {
        if (channelNumber < 0) {
          for (let i = 0; i < 16; i++) {
            channels[i][funcName](value, now);
          }
        } else {
          channels[channelNumber][funcName](value, now);
        }
      }
    } else {
      switch (operation) {
        case "FineTuning": {
          const value = (Number(input.value) - 0.5) * 200;
          if (channelNumber < 0) {
            midy.setMasterFineTuning(value, now);
          } else {
            channels[channelNumber].setFineTuning(value, now);
          }
          break;
        }
        case "CoarseTuning": {
          const value = (Number(input.value) * 127 - 64) * 100;
          if (channelNumber < 0) {
            midy.setMasterCoarseTuning(value, now);
          } else {
            channels[channelNumber].setCoarseTuning(value, now);
          }
          break;
        }
        case "PitchBendRange": {
          const value = Number(input.value) * 12800;
          if (channelNumber < 0) {
            for (let i = 0; i < 16; i++) {
              channels[i].setPitchBendRange(value, now);
            }
          } else {
            channels[channelNumber].setPitchBendRange(value, now);
          }
          break;
        }
        default: {
          const value = Math.ceil(Number(input.value) * 127);
          midy[`set${operation}`](value, now);
        }
      }
    }
  });
}

function setMixerButtonEvents() {
  const mixerForm = document.getElementById("mixerForm");
  mixerForm.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const tr = button.closest("tr");
    const tbody = tr.parentNode;
    if (button.textContent === "➕") {
      const newTr = tr.cloneNode(true);
      tr.insertAdjacentElement("afterend", newTr);
      const oldSelects = tr.querySelectorAll("select");
      const newSelects = newTr.querySelectorAll("select");
      oldSelects.forEach((oldSelect, i) => {
        const newSelect = newSelects[i];
        if (!newSelect) return;
        newSelect.value = oldSelect.value;
        if (newSelect.selectedIndex === -1 && oldSelect.selectedIndex !== -1) {
          newSelect.selectedIndex = oldSelect.selectedIndex;
        }
      });
    } else {
      if (2 < tbody.children.length) {
        tr.remove();
      }
    }
  });
}

function setEvents() {
  setTuningEvents();
  setMixerInputEvents();
  setMixerButtonEvents();
}

async function loadMIDI(file) {
  if (!file) return;
  await midiPlayer.handleStop();
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  await midiPlayer.loadMIDI(uint8Array);
}

async function loadSoundFont(file) {
  if (!file) return;
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  await midy.loadSoundFont(uint8Array);
}

async function loadFile(file) {
  const extName = file.name.split(".").at(-1).toLowerCase();
  switch (extName) {
    case "mid":
    case "midi":
      return await loadMIDI(file);
    case "sf2":
    case "sf3":
      return await loadSoundFont(file);
  }
}

function setDragEvent() {
  const selectPanel = document.getElementById("selectPanel");
  let dragCounter = 0;
  selectPanel.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragCounter++;
    selectPanel.classList.add("border", "border-secondary");
  });
  selectPanel.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      selectPanel.classList.remove("border", "border-secondary");
    }
  });
  selectPanel.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  selectPanel.addEventListener("drop", (event) => {
    event.preventDefault();
    selectPanel.classList.remove("border", "border-secondary");
    const file = event.dataTransfer.files[0];
    loadFile(file);
  });
}

const htmlLang = document.documentElement.lang;
const globalCSS = getGlobalCSS();
setEvents();
setDragEvent();

// ---------------------------------------------------------------------------
// midi library
// ---------------------------------------------------------------------------

const libraryModal = Modal.getOrCreateInstance(
  document.getElementById("screenLibrary"),
);
Modal.getOrCreateInstance(
  document.getElementById("soundFontLibraryModal"),
);

const midiLibrary = new MidiLibrary({
  table: "libraryTable",
  pagination: "libraryPagination",
  columns: "libraryColumns",
  collections: "libraryCollections",
  instruments: "libraryInstruments",
  lang: htmlLang,
  onSelect: async (row) => {
    const buf = await (await fetch(`https://midi-db.pages.dev/${row.file}`))
      .arrayBuffer();
    await midiPlayer.handleStop();
    await midiPlayer.loadMIDI(new Uint8Array(buf));
    libraryModal.hide();
    await midiPlayer.handlePlay();
  },
});
midiLibrary.load();

// ---------------------------------------------------------------------------
// soundfont library
// ---------------------------------------------------------------------------

const SOUNDFONT_BASE = "https://soundfonts.pages.dev/";
let soundFontListLoaded = false;

async function loadSoundFontLibrary() {
  const el = document.getElementById("soundFontLibraryList");
  try {
    const list = await (await fetch(`${SOUNDFONT_BASE}list.json`)).json();
    el.innerHTML = "";
    list.forEach((sf, i) => {
      const id = `soundFontLibraryItem-${i}`;
      const checked = sf.name === "GeneralUser_GS_v1.471";
      const wrap = document.createElement("div");
      wrap.className = "form-check";
      wrap.innerHTML =
        `<input class="form-check-input" type="radio" name="soundFontLibrary" id="${id}" value="${sf.name}" ${
          checked ? "checked" : ""
        }>` +
        `<label class="form-check-label" for="${id}">${sf.name}</label>`;
      el.appendChild(wrap);
      if (checked) midiPlayer.soundFontURL = SOUNDFONT_BASE + sf.name;
    });
    soundFontListLoaded = true;
  } catch (err) {
    console.error("Failed to load SoundFont library:", err);
    el.textContent = t("soundFontLoadFailed");
  }
}

document.getElementById("soundFontLibraryList").addEventListener(
  "change",
  (e) => {
    if (e.target.name !== "soundFontLibrary") return;
    midiPlayer.soundFontURL = SOUNDFONT_BASE + e.target.value;
  },
);

document.getElementById("openSoundFontLibrary").addEventListener(
  "click",
  () => {
    if (!soundFontListLoaded) loadSoundFontLibrary();
  },
);

// ---------------------------------------------------------------------------
// midy playback events
// ---------------------------------------------------------------------------

const audioContext = new AudioContext();
if (audioContext.state === "running") await audioContext.suspend();
const midy = new Midy(audioContext);
const midiPlayer = new MIDIPlayer(midy);
midiPlayer.defaultLayout();
midiPlayer.applyTheme(globalCSS, {
  "midi-player-btn": "btn bg-light-subtle p-1",
  "midi-player-text": "p-1",
  "midi-player-range": "form-range",
});
document.getElementById("midi-player").appendChild(midiPlayer.root);

document.getElementById("toggleDarkMode").onclick = toggleDarkMode;

document.getElementById("selectFile").addEventListener(
  "click",
  () => document.getElementById("inputFile").click(),
);
document.getElementById("inputFile").addEventListener("change", (e) => {
  loadFile(e.target.files[0]);
  e.target.value = "";
});
document.addEventListener("paste", (e) => {
  const f = e.clipboardData?.items[0]?.getAsFile();
  if (f) loadFile(f);
});

const selectPanel = document.getElementById("selectPanel");
let dragN = 0;
selectPanel.addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (++dragN === 1) {
    selectPanel.classList.add("drag-active");
  }
});
selectPanel.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (--dragN === 0) {
    selectPanel.classList.remove("drag-active");
  }
});
selectPanel.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
selectPanel.addEventListener("drop", (e) => {
  e.preventDefault();
  dragN = 0;
  selectPanel.classList.remove("drag-active");
  loadFile(e.dataTransfer.files[0]);
});
