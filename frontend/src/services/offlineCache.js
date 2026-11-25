export async function clearPrivateOfflineCache() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'clear-private-cache' });
  } catch (error) {
    console.warn('VexRide could not clear cached account data:', error);
  }
}
