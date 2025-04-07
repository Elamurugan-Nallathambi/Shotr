import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore, type SecretCipher } from '../src/main/projects.js';
import { defaultForm } from '../src/main/webconfig.js';

// Reversible fake cipher (base64 prefix) standing in for safeStorage.
const fakeCipher: SecretCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (p) => Buffer.from(`enc:${p}`),
  decryptString: (b) => b.toString().replace(/^enc:/, ''),
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shotr-proj-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('ProjectStore', () => {
  it('saves and lists projects', () => {
    const store = new ProjectStore(dir, fakeCipher);
    store.save({ ...defaultForm('a'), name: 'Alpha' });
    store.save({ ...defaultForm('b'), name: 'Beta' });
    const list = store.list();
    expect(list.map((p) => p.name)).toEqual(['Alpha', 'Beta']);
    expect(list[0]).toMatchObject({ id: 'a', pageCount: 1 });
  });

  it('round-trips a project and decrypts the password', () => {
    const store = new ProjectStore(dir, fakeCipher);
    const form = defaultForm('a');
    form.auth = { enabled: true, password: 's3cret', usernameSelector: '#u' };
    store.save(form);
    expect(store.get('a')?.auth.password).toBe('s3cret');
  });

  it('never writes the plaintext password to disk', () => {
    const store = new ProjectStore(dir, fakeCipher);
    const form = defaultForm('a');
    form.auth = { enabled: true, password: 'topsecret' };
    store.save(form);
    const raw = readFileSync(join(dir, 'a.json'), 'utf8');
    expect(raw).not.toContain('topsecret');
    expect(raw).toContain('passwordEnc');
  });

  it('drops the password when encryption is unavailable', () => {
    const store = new ProjectStore(dir, { ...fakeCipher, isEncryptionAvailable: () => false });
    const form = defaultForm('a');
    form.auth = { enabled: true, password: 'x' };
    store.save(form);
    expect(store.get('a')?.auth.password).toBeUndefined();
  });

  it('deletes a project', () => {
    const store = new ProjectStore(dir, fakeCipher);
    store.save(defaultForm('a'));
    store.delete('a');
    expect(store.get('a')).toBeNull();
    expect(store.list()).toHaveLength(0);
  });
});
