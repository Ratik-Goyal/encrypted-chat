class EncryptionService {
  constructor() {
    this.keyPair = null;
    this.publicKeyBase64 = null;
  }

  async generateKeys() {
    try {
      this.keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      );

      const exported = await crypto.subtle.exportKey('spki', this.keyPair.publicKey);
      this.publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
      
      return this.publicKeyBase64;
    } catch (error) {
      console.error('Key generation failed:', error);
      throw new Error('Failed to generate encryption keys');
    }
  }

  async importPublicKey(keyBase64) {
    try {
      const binary = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
      return await crypto.subtle.importKey(
        'spki',
        binary,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['encrypt']
      );
    } catch (error) {
      console.error('Key import failed:', error);
      throw new Error('Failed to import public key');
    }
  }

  async encrypt(text, publicKey) {
    try {
      const encrypted = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        new TextEncoder().encode(text)
      );
      return Array.from(new Uint8Array(encrypted));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt message');
    }
  }

  async decrypt(encryptedArray) {
    try {
      if (!this.keyPair) {
        throw new Error('Keys not initialized');
      }
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        this.keyPair.privateKey,
        new Uint8Array(encryptedArray)
      );
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt message');
    }
  }

  getPublicKey() {
    return this.publicKeyBase64;
  }
}

export default new EncryptionService();
