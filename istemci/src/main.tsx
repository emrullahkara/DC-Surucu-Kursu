import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './stil.css';
import { Uygulama } from './Uygulama';
import { PlatformEkrani } from './ekranlar/Platform';
import { Bildirimler, Pencere } from './bilesenler/ortak';
import { YazdirmaAlani } from './yazdir';

const platform = location.pathname.startsWith('/platform');
createRoot(document.getElementById('uygulama')!).render(
  <StrictMode>
    {platform ? <PlatformEkrani /> : <Uygulama />}
    <Pencere />
    <Bildirimler />
    <YazdirmaAlani />
  </StrictMode>,
);

// Telefona uygulama gibi kurulabilmesi ve internet kopukken de açılabilmesi için.
if ('serviceWorker' in navigator && import.meta.env.PROD && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
