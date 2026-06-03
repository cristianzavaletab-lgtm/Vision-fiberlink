// In-memory store for PWA features: WebAuthn registration and Push Notifications
// Using in-memory store keeps it 100% compatible with both Prisma and Legacy/In-Memory modes.

export interface WebAuthnCredential {
  credentialId: string;
  publicKey: string;
  userId: string;
  counter: number;
}

export interface PushSubscriptionItem {
  id: string;
  userId: string;
  companyId: string;
  subscription: any; // Web Push Subscription object
  createdAt: number;
}

class PwaStore {
  // Map of userId -> array of registered credentials
  private credentials = new Map<string, WebAuthnCredential[]>();
  
  // Map of challengeId -> challenge string
  private challenges = new Map<string, { challenge: string; userId?: string; createdAt: number }>();
  
  // Map of companyId -> array of push subscriptions
  private pushSubscriptions = new Map<string, PushSubscriptionItem[]>();

  // Clean expired challenges periodically (every 5 minutes)
  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, val] of this.challenges.entries()) {
        if (now - val.createdAt > 300000) { // 5 minutes timeout
          this.challenges.delete(key);
        }
      }
    }, 300000);
  }

  // --- WebAuthn Challenges ---
  public createChallenge(userId?: string): string {
    const challenge = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const challengeId = Math.random().toString(36).substring(2);
    this.challenges.set(challengeId, { challenge, userId, createdAt: Date.now() });
    return JSON.stringify({ challengeId, challenge });
  }

  public getChallenge(challengeId: string): string | null {
    const item = this.challenges.get(challengeId);
    if (!item) return null;
    this.challenges.delete(challengeId); // Consume immediately
    return item.challenge;
  }

  // --- WebAuthn Credentials ---
  public registerCredential(userId: string, credential: WebAuthnCredential) {
    const list = this.credentials.get(userId) || [];
    list.push(credential);
    this.credentials.set(userId, list);
    console.log(`[PWA Store] Credencial biometrica registrada para usuario: ${userId}`);
  }

  public getCredentialsByUserId(userId: string): WebAuthnCredential[] {
    return this.credentials.get(userId) || [];
  }

  public findCredentialById(credentialId: string): WebAuthnCredential | null {
    for (const list of this.credentials.values()) {
      const found = list.find(c => c.credentialId === credentialId);
      if (found) return found;
    }
    return null;
  }

  // --- Push Subscriptions ---
  public addPushSubscription(userId: string, companyId: string, subscription: any) {
    const list = this.pushSubscriptions.get(companyId) || [];
    // Avoid duplicates by comparing endpoint URL
    const existingIndex = list.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    
    const newItem: PushSubscriptionItem = {
      id: Math.random().toString(36).substring(2),
      userId,
      companyId,
      subscription,
      createdAt: Date.now()
    };

    if (existingIndex > -1) {
      list[existingIndex] = newItem;
    } else {
      list.push(newItem);
    }
    
    this.pushSubscriptions.set(companyId, list);
    console.log(`[PWA Store] Suscripcion de notificaciones push registrada para usuario ${userId} en empresa ${companyId}`);
  }

  public getPushSubscriptionsByCompany(companyId: string): PushSubscriptionItem[] {
    return this.pushSubscriptions.get(companyId) || [];
  }

  public getPushSubscriptionsByUser(userId: string): PushSubscriptionItem[] {
    const all: PushSubscriptionItem[] = [];
    for (const list of this.pushSubscriptions.values()) {
      all.push(...list.filter(s => s.userId === userId));
    }
    return all;
  }

  public removePushSubscription(endpoint: string) {
    for (const [companyId, list] of this.pushSubscriptions.entries()) {
      const filtered = list.filter(s => s.subscription.endpoint !== endpoint);
      if (filtered.length !== list.length) {
        this.pushSubscriptions.set(companyId, filtered);
        console.log(`[PWA Store] Suscripcion muerta eliminada de empresa ${companyId}`);
      }
    }
  }
}

export const pwaStore = new PwaStore();
