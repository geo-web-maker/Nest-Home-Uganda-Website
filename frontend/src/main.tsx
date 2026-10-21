import { ViteReactSSG } from 'vite-react-ssg';
import './lib/i18n';
import './design/tokens.css';
import './design/fonts.css';
import './design/global.css';
import './design/motion.css';
import { routes } from './app/routes';

export const createRoot = ViteReactSSG({ routes });
