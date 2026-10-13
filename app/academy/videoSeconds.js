// Reads an .mp4's length (in seconds) in the browser before upload.
export function videoSeconds(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); resolve(Number.isFinite(d) ? d : 0); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}
