import { Midy } from "https://cdn.jsdelivr.net/gh/marmooo/midy@0.4.4/dist/midy.min.js";
import { MIDIPlayer } from "https://cdn.jsdelivr.net/npm/@marmooo/midi-player@0.0.6/+esm";

loadConfig();

function applyTheme(midiPlayer) {
  const root = midiPlayer.root;
  for (const btn of root.getElementsByClassName("midi-player-btn")) {
    btn.classList.add("btn", "btn-light", "p-1");
  }
  for (const btn of root.getElementsByClassName("midi-player-text")) {
    btn.classList.add("p-1");
  }
  for (const btn of root.getElementsByClassName("midi-player-range")) {
    btn.classList.add("form-range", "p-1");
  }
}

function loadConfig() {
  if (localStorage.getItem("darkMode") == 1) {
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
}

function toggleDarkMode() {
  if (localStorage.getItem("darkMode") == 1) {
    localStorage.setItem("darkMode", 0);
    document.documentElement.setAttribute("data-bs-theme", "light");
  } else {
    localStorage.setItem("darkMode", 1);
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }
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
  midy.setProgramChange(channelNumber, programNumber, scheduleTime);
}

function setMixerInputEvents() {
  const tuningForm = document.getElementById("mixerForm");
  tuningForm.addEventListener("change", async (event) => {
    const input = event.target;
    if (input.tagName !== "INPUT") return;
    const tr = input.closest("tr");
    const tds = tr.querySelectorAll("td");
    const now = midy.audioContext.currentTime;
    const channel = Number(tds[1].querySelector("select").value);
    const operation = tds[2].querySelector("select").value;
    if (operation.startsWith("CC")) {
      const controllerType = Number(operation.slice(2));
      const value = Math.ceil(Number(input.value) * 127);
      if (channel < 0) {
        for (let i = 0; i < 16; i++) {
          midy.setControlChange(i, controllerType, value, now);
        }
      } else {
        midy.setControlChange(channel, controllerType, value, now);
      }
    } else if (operation.startsWith("Event")) {
      const funcName = `set${operation.slice(5)}`;
      const value = Math.ceil(Number(input.value) * 127);
      if (funcName === "setProgramChange") {
        if (channel < 0) {
          const promises = new Array(16);
          for (let i = 0; i < 16; i++) {
            promises[i] = setProgramChange(i, value, now);
          }
          await Promise.all(promises);
        } else {
          await setProgramChange(channel, value, now);
        }
      } else {
        if (channel < 0) {
          for (let i = 0; i < 16; i++) {
            midy[funcName](i, value, now);
          }
        } else {
          midy[funcName](channel, value, now);
        }
      }
    } else {
      switch (operation) {
        case "FineTuning": {
          const value = (Number(input.value) - 0.5) * 200;
          if (channel < 0) {
            midy.setMasterFineTuning(value, now);
          } else {
            midy.setFineTuning(channel, value, now);
          }
          break;
        }
        case "CoarseTuning": {
          const value = (Number(input.value) * 127 - 64) * 100;
          if (channel < 0) {
            midy.setMasterCoarseTuning(value, now);
          } else {
            midy.setCoarseTuning(channel, value, now);
          }
          break;
        }
        case "PitchBendRange": {
          const value = Number(input.value) * 12800;
          const funcName = `set${operation}`;
          if (channel < 0) {
            for (let i = 0; i < 16; i++) {
              midy[funcName](i, value, now);
            }
          } else {
            midy[funcName](i, value, now);
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

const audioContext = new AudioContext();
if (audioContext.state === "running") await audioContext.suspend();
const midy = new Midy(audioContext);
const midiPlayer = new MIDIPlayer(midy);
midiPlayer.defaultLayout();
applyTheme(midiPlayer);
document.getElementById("midi-player").appendChild(midiPlayer.root);

setEvents();

document.getElementById("toggleDarkMode").onclick = toggleDarkMode;
document.getElementById("selectFile").onclick = () => {
  document.getElementById("inputFile").click();
};
document.getElementById("inputFile").addEventListener("change", (event) => {
  loadFile(event.target.files[0]);
});
globalThis.ondragover = (event) => {
  event.preventDefault();
};
globalThis.ondrop = (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  loadFile(file);
};
globalThis.addEventListener("paste", (event) => {
  const item = event.clipboardData.items[0];
  const file = item.getAsFile();
  if (!file) return;
  loadFile(file);
});
