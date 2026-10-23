"use client";

import { useState } from 'react';
import { useSession } from '@/lib/session/SessionProvider';
import { useRouter } from 'next/navigation';

export default function ConnectPage() {
  const { bootstrap } = useSession() as any;
  const [challenge, setChallenge] = useState('');
  const [nonce, setNonce] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await bootstrap(challenge, nonce);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    }
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <form onSubmit={submit} className="border p-6 rounded w-96 space-y-4">
        <h1 className="text-lg font-semibold">Connect local owner</h1>
        <p className="text-sm">Run <code>npm run session:challenge</code> and paste the values.</p>
        <div>
          <label className="text-sm">Challenge</label>
          <input type="password" value={challenge} onChange={e => setChallenge(e.target.value)} className="w-full border p-2" />
        </div>
        <div>
          <label className="text-sm">Client nonce</label>
          <input type="password" value={nonce} onChange={e => setNonce(e.target.value)} className="w-full border p-2" />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" className="w-full border p-2">Connect session</button>
      </form>
    </div>
  );
}
