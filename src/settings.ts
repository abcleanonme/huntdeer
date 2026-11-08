// Small player settings kept in localStorage (camera style, vibration).

export type CameraMode = 'follow' | 'classic';

const CAM_KEY = 'huntdeer.camera';
const VIBE_KEY = 'huntdeer.vibration';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // Private mode etc.: the choice just lasts for this session.
  }
}

let camMode: CameraMode = read(CAM_KEY) === 'classic' ? 'classic' : 'follow';
let vibration = read(VIBE_KEY) !== 'off';

/** "follow" (default): the camera swings in behind the way you run. "classic": it only moves when you drag. */
export function cameraMode() {
  return camMode;
}

export function toggleCameraMode() {
  camMode = camMode === 'follow' ? 'classic' : 'follow';
  write(CAM_KEY, camMode);
  return camMode;
}

export function vibrationOn() {
  return vibration;
}

export function toggleVibration() {
  vibration = !vibration;
  write(VIBE_KEY, vibration ? 'on' : 'off');
  return vibration;
}
