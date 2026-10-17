const KEY = 'emerge.debate.mic';

export function preferredMic(): string | null {
  try {
    return window.localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function preferMic(deviceId: string | null): void {
  try {
    if (deviceId) window.localStorage.setItem(KEY, deviceId);
    else window.localStorage.removeItem(KEY);
  } catch {
    return;
  }
}

export function micConstraints(deviceId: string | null): MediaTrackConstraints {
  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export async function openMicStream(deviceId: string | null): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: micConstraints(deviceId) });
  } catch (cause) {
    const missing = cause instanceof DOMException && (cause.name === 'OverconstrainedError' || cause.name === 'NotFoundError');
    if (!deviceId || !missing) throw cause;
    preferMic(null);
    return navigator.mediaDevices.getUserMedia({ audio: micConstraints(null) });
  }
}
