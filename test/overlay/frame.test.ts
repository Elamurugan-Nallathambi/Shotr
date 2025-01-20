import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyFrame, backgroundSvg } from '../../src/overlay/frame-renderer.js';
import { DEFAULT_FRAME } from '../../src/config/defaults.js';
import type { ResolvedFrame } from '../../src/core/types.js';

function card(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 40, b: 50 } },
  })
    .png()
    .toBuffer();
}

const frame = (over: Partial<ResolvedFrame> = {}): ResolvedFrame => ({ ...DEFAULT_FRAME, enabled: true, ...over });

describe('backgroundSvg', () => {
  it('renders a solid fill', () => {
    const svg = backgroundSvg(100, 100, { ...DEFAULT_FRAME.background, type: 'solid', color: '#123456' });
    expect(svg).toContain('fill="#123456"');
    expect(svg).not.toContain('linearGradient');
  });

  it('renders an angled gradient with two stops', () => {
    const svg = backgroundSvg(100, 100, { ...DEFAULT_FRAME.background, type: 'gradient', from: '#000000', to: '#ffffff', angle: 90 });
    expect(svg).toContain('linearGradient');
    expect(svg).toContain('stop-color="#000000"');
    expect(svg).toContain('stop-color="#ffffff"');
  });

  it('supports a multi-stop colors array', () => {
    const svg = backgroundSvg(100, 100, { ...DEFAULT_FRAME.background, colors: ['#111111', '#222222', '#333333'] });
    expect(svg.match(/<stop /g)).toHaveLength(3);
  });
});

describe('applyFrame', () => {
  it('adds padding on all sides (gradient + shadow)', async () => {
    const out = await applyFrame(await card(400, 300), frame({ padding: 50 }), 'png');
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(500); // 400 + 2*50
    expect(meta.height).toBe(400); // 300 + 2*50
  });

  it('works with a solid background and no shadow', async () => {
    const out = await applyFrame(
      await card(200, 150),
      frame({ padding: 20, shadow: false, background: { ...DEFAULT_FRAME.background, type: 'solid', color: '#0a0a0a' } }),
      'png',
    );
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(240);
    expect(meta.height).toBe(190);
  });

  it('encodes as JPEG when requested', async () => {
    const out = await applyFrame(await card(120, 90), frame({ padding: 10 }), 'jpeg', 80);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('produces a different image than the bare content', async () => {
    const content = await card(100, 100);
    const framed = await applyFrame(content, frame({ padding: 30 }), 'png');
    expect(Buffer.compare(content, framed)).not.toBe(0);
  });

  it('throws on unreadable content', async () => {
    await expect(applyFrame(Buffer.from('nope'), frame(), 'png')).rejects.toThrow();
  });
});
