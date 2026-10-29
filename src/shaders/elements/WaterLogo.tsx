import { useEffect, useMemo, useRef, useState } from 'react';
import waterSource from './sources/machan-water.html?raw';
import logoMask from './assets/machan-logo-mask.png?inline';

export function WaterLogo() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [mask, setMask] = useState('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const source = useMemo(() => mask ? waterSource.replace('__MACHAN_LOGO_MASK__', JSON.stringify(mask)) : '', [mask]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReady(false); setReduced(preference.matches); };
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!reduced) setMask(logoMask);
  }, [reduced]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'machan-water-ready') setReady(true);
      if (event.data?.type === 'machan-water-failed') { setFailed(true); setReady(false); }
    };
    const visibility = () => frame.current?.contentWindow?.postMessage({ type: 'machan-water-controls', paused: document.hidden }, '*');
    window.addEventListener('message', receive);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('visibilitychange', visibility);
      frame.current?.contentWindow?.postMessage({ type: 'machan-water-controls', stop: true }, '*');
    };
  }, []);

  return (
    <div className="water-logo-stage" role="img" aria-label="Machan, Who Said That? Official Logo" data-water-state={ready ? 'ready' : reduced ? 'reduced' : failed ? 'fallback' : 'preparing'}>
      <img src={logoMask} width={512} height={512} alt="" className={`water-logo-fallback ${ready ? 'invisible' : ''}`} />
      {!reduced && !failed && source && <iframe ref={frame} srcDoc={source} title="Machan Elements Water" sandbox="allow-scripts" aria-hidden="true" tabIndex={-1}
        className={`water-logo-frame ${ready ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'machan-water-controls', paused: document.hidden }, '*')} />}
    </div>
  );
}
