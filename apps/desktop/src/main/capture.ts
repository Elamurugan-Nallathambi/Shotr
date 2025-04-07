import { desktopCapturer, screen, type NativeImage, type Display } from 'electron';

/** Result of a full-screen grab, with the metadata region cropping needs. */
export interface ScreenGrab {
  image: NativeImage;
  display: Display;
  scaleFactor: number;
}

/**
 * Trigger the macOS Screen Recording permission prompt by attempting a tiny
 * capture. This is what registers the app in System Settings → Privacy →
 * Screen Recording (the OS only lists apps that have tried to capture).
 */
export async function triggerScreenAccess(): Promise<void> {
  try {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 8, height: 8 } });
  } catch {
    /* the attempt itself is what registers the app */
  }
}

/** Capture the full screen of the display under the cursor. */
export async function captureScreen(): Promise<ScreenGrab> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const scaleFactor = display.scaleFactor;
  const width = Math.round(display.size.width * scaleFactor);
  const height = Math.round(display.size.height * scaleFactor);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  const source =
    sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0];
  if (!source) throw new Error('No screen source available (check Screen Recording permission).');
  return { image: source.thumbnail, display, scaleFactor };
}

export interface WindowSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
}

/** List capturable windows with preview thumbnails for the picker UI. */
export async function listWindows(): Promise<WindowSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 320, height: 200 },
  });
  return sources
    .filter((s) => s.name)
    .map((s) => ({ id: s.id, name: s.name, thumbnailDataUrl: s.thumbnail.toDataURL() }));
}

/** Capture a specific window at high resolution by its source id. */
export async function captureWindowById(id: string): Promise<NativeImage> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 3840, height: 2160 },
  });
  const source = sources.find((s) => s.id === id);
  if (!source) throw new Error('Selected window is no longer available.');
  return source.thumbnail;
}
