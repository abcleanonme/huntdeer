// One-time gameplay tips (shown the first time something happens), remembered per device.
const KEY = 'huntdeer.tips';

function seen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function tipSeen(id: string) {
  return seen().includes(id);
}

export function markTip(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...seen(), id])]));
  } catch {
    // ignore
  }
}
