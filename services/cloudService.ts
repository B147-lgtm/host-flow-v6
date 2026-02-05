
/**
 * HostFlow Production Engine - v35 Resilient Access
 * 
 * Secure persistence for badal.london@gmail.com
 */

const BUCKET_ID = "hf_v35_exclusive_vault";
const PROD_KEY = "vault_badal_london_master";

async function api(path: string, options: any = {}) {
  const url = `https://kvdb.io/${BUCKET_ID}/${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    return response;
  } catch (error) {
    console.warn(`Cloud Handshake Error:`, error);
    return null;
  }
}

export const cloudSync = {
  /**
   * AUTH: Validates credentials and returns the full cloud state.
   */
  async login(email: string, password: string): Promise<any | null> {
    const validEmail = "badal.london@gmail.com";
    // Master passwords: with and without the hyphen to be resilient
    const validPass1 = "98290-52963";
    const validPass2 = "9829052963";

    // Normalize input
    const inputEmail = email.trim().toLowerCase();
    const inputPass = password.trim(); 

    // Master account check (Priority path)
    if (inputEmail === validEmail && (inputPass === validPass1 || inputPass === validPass2)) {
      const res = await api(PROD_KEY);
      if (res && res.ok) {
        try {
          const data = await res.json();
          // Always return a valid object for the master user
          return data || { properties: [] };
        } catch (e) {
          return { properties: [] };
        }
      }
      // Failsafe: return default state if cloud is temporarily unreachable
      return { properties: [] };
    }

    // Check for other registered accounts (Dynamic)
    const key = `vault_${inputEmail.replace(/[@.]/g, '_')}_master`;
    const res = await api(key);
    if (res && res.ok) {
      try {
        const data = await res.json();
        // Fallback check for secondary accounts
        if (data._auth && data._auth.password !== inputPass) return null;
        return data;
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  /**
   * PUSH: Saves the entire application state to the secure production vault.
   */
  async pushData(data: any): Promise<boolean> {
    try {
      let targetKey = PROD_KEY;
      // Identify target key based on data content
      if (data.currentUser?.email && data.currentUser.email !== "badal.london@gmail.com") {
        targetKey = `vault_${data.currentUser.email.replace(/[@.]/g, '_')}_master`;
      } else if (data.properties?.[0]?.managerEmail && data.properties[0].managerEmail !== "badal.london@gmail.com") {
        // Fallback to manager email if currentUser isn't present but properties are
        targetKey = `vault_${data.properties[0].managerEmail.replace(/[@.]/g, '_')}_master`;
      }

      // Preserve the _auth object if it exists in the cloud to avoid locking users out during background syncs
      const currentRes = await api(targetKey);
      let existingAuth = null;
      if (currentRes && currentRes.ok) {
        try {
          const currentData = await currentRes.json();
          existingAuth = currentData._auth;
        } catch (e) {}
      }

      const res = await api(targetKey, {
        method: 'PUT',
        body: JSON.stringify({ 
          ...data, 
          _auth: existingAuth, 
          lastSynced: Date.now() 
        })
      });
      return res !== null && res.ok;
    } catch (e) {
      console.warn("Cloud push deferred.");
      return false;
    }
  },

  /**
   * FETCH: Direct pull for background refreshes.
   */
  async fetchLatest(): Promise<any | null> {
    const res = await api(PROD_KEY);
    if (res && res.ok) {
      try { return await res.json(); } catch(e) { return null; }
    }
    return null;
  },

  /**
   * ADMIN: List all keys in the bucket starting with vault_
   * Fetches metadata for each account to populate the Master Admin dashboard.
   */
  async adminListAccounts(): Promise<any[]> {
    const res = await api('');
    if (res && res.ok) {
      try {
        const keys: string[] = await res.json();
        const vaultKeys = keys.filter(k => k.startsWith('vault_'));
        
        // Parallel fetch for account metadata
        const accountData = await Promise.all(vaultKeys.map(async k => {
          const r = await api(k);
          if (r && r.ok) {
            try {
              const data = await r.json();
              return {
                email: data.currentUser?.email || k.replace('vault_', '').replace('_master', '').replace(/_/g, '.'),
                password: data._auth?.password || "********",
                createdAt: data.currentUser?.createdAt || new Date().toISOString()
              };
            } catch (e) { return null; }
          }
          return null;
        }));
        return accountData.filter(a => a !== null);
      } catch (e) { return []; }
    }
    return [];
  },

  /**
   * ADMIN: Fetch full data blob for a specific email identity
   */
  async adminGetUserData(email: string): Promise<any> {
    const key = `vault_${email.replace(/[@.]/g, '_')}_master`;
    const res = await api(key);
    if (res && res.ok) {
      try { return await res.json(); } catch (e) { return null; }
    }
    return null;
  },

  /**
   * ADMIN: Permanently wipe a vault from the production bucket
   */
  async adminDeleteAccount(email: string): Promise<boolean> {
    const key = `vault_${email.replace(/[@.]/g, '_')}_master`;
    const res = await api(key, { method: 'DELETE' });
    return res !== null && res.ok;
  },

  /**
   * ADMIN: Provision a new secure account manually
   */
  async createAccount(email: string, password: string, initialData: any): Promise<boolean> {
    const key = `vault_${email.replace(/[@.]/g, '_')}_master`;
    const dataWithAuth = {
      ...initialData,
      _auth: { password },
      lastSynced: Date.now()
    };
    const res = await api(key, {
      method: 'PUT',
      body: JSON.stringify(dataWithAuth)
    });
    return res !== null && res.ok;
  }
};
