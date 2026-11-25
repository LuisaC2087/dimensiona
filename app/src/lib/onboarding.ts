import { getItem, setItem } from './storage';

export const WELCOME_KEY = 'dm.bienvenida.v1';
export const welcomeSeen = async () => (await getItem(WELCOME_KEY)) === 'visto';
export const markWelcomeSeen = () => setItem(WELCOME_KEY, 'visto');
export const resetWelcome = () => setItem(WELCOME_KEY, null);
