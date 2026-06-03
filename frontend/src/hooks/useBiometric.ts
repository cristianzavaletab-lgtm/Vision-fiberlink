import { useState, useCallback } from 'react';
import { api } from '../services/api';

const BIOMETRIC_CREDENTIAL_KEY = 'vc-biometric-credential';
const BIOMETRIC_USER_KEY = 'vc-biometric-user';

interface BiometricCredentialStore {
  credentialId: string;
  privateKeyJwk: JsonWebKey;
  userId: string;
  email: string;
}

interface UseBiometricReturn {
  hasBiometric: boolean;
  isSupported: boolean;
  registerBiometric: () => Promise<boolean>;
  loginWithBiometric: () => Promise<{ accessToken: string; refreshToken: string; user: any } | null>;
  removeBiometric: () => void;
}

function getStoredCredential(): BiometricCredentialStore | null {
  try {
    const raw = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useBiometric(): UseBiometricReturn {
  const [hasBiometric] = useState(() => !!getStoredCredential());

  // Check if WebCrypto + WebAuthn is supported
  const isSupported = typeof window !== 'undefined' && 
    !!window.crypto?.subtle && 
    !!window.PublicKeyCredential;

  /**
   * Register biometric credential (called after user is logged in)
   * Generates ECDSA key pair, stores private key locally, sends public key to server
   */
  const registerBiometric = useCallback(async (): Promise<boolean> => {
    try {
      if (!window.crypto?.subtle) {
        console.error('[Biometric] SubtleCrypto not available');
        return false;
      }

      // Step 1: Get a registration challenge from server
      const challengeRes = await api.post('/auth/webauthn/register-challenge');
      const { challengeId } = challengeRes.data;

      // Step 2: Generate an ECDSA P-256 key pair
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true, // extractable (we need to export)
        ['sign', 'verify']
      );

      // Step 3: Export keys
      const publicKeySpki = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
      
      // Convert public key to base64 for server storage
      const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeySpki)));
      
      // Generate a unique credential ID
      const credentialId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

      // Step 4: Send public key to server
      const registerRes = await api.post('/auth/webauthn/register', {
        credentialId,
        publicKey: publicKeyBase64,
        challengeId
      });

      if (registerRes.data.success) {
        // Step 5: Store credential locally (private key stays on device only)
        const userInfo = JSON.parse(localStorage.getItem('vc-user-info') || '{}');
        const credential: BiometricCredentialStore = {
          credentialId,
          privateKeyJwk,
          userId: userInfo.id || 'unknown',
          email: userInfo.email || 'unknown'
        };
        localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, JSON.stringify(credential));
        localStorage.setItem(BIOMETRIC_USER_KEY, JSON.stringify({ id: userInfo.id, email: userInfo.email, name: userInfo.name }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Biometric] Registration error:', error);
      return false;
    }
  }, []);

  /**
   * Login using stored biometric credential
   * Signs a challenge with the local private key
   */
  const loginWithBiometric = useCallback(async (): Promise<{ accessToken: string; refreshToken: string; user: any } | null> => {
    try {
      const stored = getStoredCredential();
      if (!stored) {
        console.error('[Biometric] No stored credential found');
        return null;
      }

      // Step 1: Get login challenge from server
      const challengeRes = await api.post('/auth/webauthn/login-challenge');
      const { challengeId, challenge } = challengeRes.data;

      // Step 2: Import the private key from JWK
      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        stored.privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
      );

      // Step 3: Sign the challenge
      const encoder = new TextEncoder();
      const signatureBuffer = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        encoder.encode(challenge)
      );

      // Convert signature to base64
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

      // Step 4: Send to server for verification
      const loginRes = await api.post('/auth/webauthn/login', {
        credentialId: stored.credentialId,
        challengeId,
        signature: signatureBase64,
        email: stored.email
      });

      return loginRes.data;
    } catch (error) {
      console.error('[Biometric] Login error:', error);
      return null;
    }
  }, []);

  /**
   * Remove stored biometric credential
   */
  const removeBiometric = useCallback(() => {
    localStorage.removeItem(BIOMETRIC_CREDENTIAL_KEY);
    localStorage.removeItem(BIOMETRIC_USER_KEY);
  }, []);

  return {
    hasBiometric,
    isSupported,
    registerBiometric,
    loginWithBiometric,
    removeBiometric
  };
}
