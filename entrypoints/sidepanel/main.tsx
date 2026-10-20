import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerFonts } from '@/lib/fonts';
import '@/lib/tokens.css';
import './style.css';

registerFonts();
createRoot(document.getElementById('root')!).render(<App />);
