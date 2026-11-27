import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PageAction } from './intents';

/**
 * Runs `run` once when this page was opened by a voice command asking for `action` (router state, never the URL),
 * as soon as `ready` is true. The state is then cleared, so Back or a reload does not run it again.
 */
export function useVoiceAction(action: PageAction, run: () => void, ready = true) {
  const location = useLocation();
  const navigate = useNavigate();
  const done = useRef(false);
  const wanted = (location.state as { voiceAction?: PageAction } | null)?.voiceAction === action;

  useEffect(() => {
    if (!wanted || !ready || done.current) return;
    done.current = true;
    run();
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [wanted, ready, run, navigate, location.pathname, location.search]);
}
