// Window picker: shows capturable windows; clicking one captures it.
interface WindowSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
}

declare global {
  interface Window {
    shotrPicker?: {
      list: () => Promise<WindowSource[]>;
      choose: (id: string) => void;
      cancel: () => void;
    };
  }
}

const api = window.shotrPicker;
const grid = document.getElementById('grid') as HTMLDivElement;

async function render(): Promise<void> {
  const windows = (await api?.list()) ?? [];
  if (!windows.length) {
    grid.innerHTML = '<div class="empty">No capturable windows found.</div>';
    return;
  }
  grid.innerHTML = '';
  for (const w of windows) {
    const card = document.createElement('div');
    card.className = 'win';
    const img = document.createElement('img');
    img.src = w.thumbnailDataUrl;
    img.alt = w.name;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = w.name;
    card.append(img, name);
    card.addEventListener('click', () => api?.choose(w.id));
    grid.append(card);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api?.cancel();
});

void render();
export {};
