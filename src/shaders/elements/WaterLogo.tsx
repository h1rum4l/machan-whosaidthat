import { useEffect, useMemo, useRef, useState } from 'react';
import waterSource from './sources/machan-water.html?raw';
import { extractLogoInk } from './logoMask';

const OFFICIAL_LOGO = '/assets/aistudio/Untitled_Design__15__76563b80.png';
let cachedMask: Promise<string> | null = null;

function officialLogoMask() {
  if (cachedMask) return cachedMask;
  cachedMask = (async () => {
    const image = new Image();
    image.src = OFFICIAL_LOGO;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(image, 0, 0, 512, 512);
    const ink = extractLogoInk(context.getImageData(0, 0, 512, 512).data, 512, 512);
    context.putImageData(new ImageData(ink.data, 512, 512), 0, 0);
    const mask = document.createElement('canvas');
    mask.width = mask.height = 512;
    const output = mask.getContext('2d');
    if (!output) throw new Error('Canvas is unavailable.');
    const scale = 400 / Math.max(ink.width, ink.height);
    const width = ink.width * scale, height = ink.height * scale;
    output.drawImage(canvas, ink.left, ink.top, ink.width, ink.height, (512 - width) / 2, (512 - height) / 2, width, height);
    return mask.toDataURL('image/png');
  })().catch(error => { cachedMask = null; throw error; });
  return cachedMask;
}

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
    if (reduced) return;
    let active = true;
    officialLogoMask().then(value => { if (active) setMask(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
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
      <img src={OFFICIAL_LOGO} alt="" className={`water-logo-fallback ${ready ? 'invisible' : ''}`} />
      {!reduced && !failed && source && <iframe ref={frame} srcDoc={source} title="Machan Elements Water" sandbox="allow-scripts" aria-hidden="true" tabIndex={-1}
        className={`water-logo-frame ${ready ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'machan-water-controls', paused: document.hidden }, '*')} />}
    </div>
  );
}
