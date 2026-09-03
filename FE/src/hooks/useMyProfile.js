import { useEffect, useState } from 'react';

import { fetchMyProfile, getUser, saveUser } from '../api/client.js';
import { normalizeMemberProfile } from '../utils/memberProfile.js';

export function useMyProfile(enabled) {
  const [profile, setProfile] = useState(() => normalizeMemberProfile(getUser()));
  const [status, setStatus] = useState(() => enabled ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    const cachedProfile = normalizeMemberProfile(getUser());

    setProfile((current) => current ?? cachedProfile);
    setStatus('loading');
    setError('');

    fetchMyProfile({ signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        const nextProfile = normalizeMemberProfile(result);
        if (nextProfile) saveUser(nextProfile);
        setProfile(nextProfile);
        setStatus(nextProfile ? 'success' : 'empty');
      })
      .catch((requestError) => {
        if (cancelled || requestError?.name === 'AbortError') return;

        console.error('회원 정보 조회 실패:', requestError);
        if (requestError?.status === 401) {
          setProfile(null);
          setStatus('unauthorized');
          setError('로그인이 만료됐어요. 다시 로그인하면 회원 정보를 확인할 수 있어요.');
          return;
        }

        setStatus('error');
        setError('회원 정보를 불러오지 못했어요. 네트워크 상태를 확인하고 다시 시도해주세요.');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, retryKey]);

  return {
    profile,
    status,
    error,
    retry: () => setRetryKey((current) => current + 1),
  };
}
