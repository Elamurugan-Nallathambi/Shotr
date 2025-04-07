import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { WebCaptureForm } from './webconfig.js';

/** Encrypts/decrypts secret fields; mirrors Electron's safeStorage shape. */
export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(data: Buffer): string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  baseUrl: string;
  pageCount: number;
}

/** On-disk form: the password is replaced by an encrypted blob (base64). */
type StoredForm = Omit<WebCaptureForm, 'auth'> & {
  auth: Omit<WebCaptureForm['auth'], 'password'> & { passwordEnc?: string };
};

export class ProjectStore {
  constructor(
    private readonly dir: string,
    private readonly cipher?: SecretCipher,
  ) {
    mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  private encrypt(plain: string | undefined): string | undefined {
    if (!plain) return undefined;
    if (this.cipher?.isEncryptionAvailable()) {
      return this.cipher.encryptString(plain).toString('base64');
    }
    return undefined; // never persist plaintext secrets
  }

  private decrypt(enc: string | undefined): string | undefined {
    if (!enc || !this.cipher?.isEncryptionAvailable()) return undefined;
    try {
      return this.cipher.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return undefined;
    }
  }

  list(): ProjectSummary[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const form = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as StoredForm;
          return { id: form.id, name: form.name, baseUrl: form.baseUrl, pageCount: form.pages.length };
        } catch {
          return null;
        }
      })
      .filter((x): x is ProjectSummary => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): WebCaptureForm | null {
    const path = this.file(id);
    if (!existsSync(path)) return null;
    const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredForm;
    const { passwordEnc, ...auth } = stored.auth;
    return { ...stored, auth: { ...auth, password: this.decrypt(passwordEnc) } };
  }

  save(form: WebCaptureForm): void {
    const { password, ...auth } = form.auth;
    const stored: StoredForm = { ...form, auth: { ...auth, passwordEnc: this.encrypt(password) } };
    writeFileSync(this.file(form.id), JSON.stringify(stored, null, 2));
  }

  delete(id: string): void {
    const path = this.file(id);
    if (existsSync(path)) rmSync(path);
  }
}
