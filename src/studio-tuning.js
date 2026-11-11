// The studio calls set() for unsaved edits. On a new visit the saved JSON
// provides the defaults, including when the game is served outside OhMyGame.
export async function connectStudioTuning(onChange) {
  const settings = new Map();
  try {
    const response = await fetch(new URL('../tuning.json', import.meta.url), {cache:'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const file = await response.json();
    for (const item of file.values) {
      if (!Number.isFinite(item.min) || !Number.isFinite(item.max) || item.min > item.max) continue;
      settings.set(item.id, item);
    }
  } catch (error) {
    console.warn('无法读取小屋调参文件，使用默认设置', error);
  }
  function set(id, value) {
    const setting = settings.get(id);
    if (!setting || !Number.isFinite(value)) return;
    onChange(id, Math.min(setting.max, Math.max(setting.min, value)));
  }
  for (const item of settings.values()) set(item.id, item.value);
  window.__OHMYGAME_TUNING__ = {set};
}
