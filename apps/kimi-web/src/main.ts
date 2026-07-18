import { createApp } from 'vue';
import App from './App.vue';
import StudyApp from './study/StudyApp.vue';
import i18n from './i18n';
import { installClientErrorCapture } from './debug/trace';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './style.css';

// Always retain bounded metadata for uncaught failures. With ?debug=1 / the
// debug flag, console output is included too; HMR restores listeners/wrappers.
installClientErrorCapture();

// Product mounting: VITE_KIMI_PRODUCT=study builds/mounts the material-first
// Kimi Study product instead of the default Kimi Code chat client.
const root = import.meta.env.VITE_KIMI_PRODUCT === 'study' ? StudyApp : App;
createApp(root).use(i18n).mount('#app');
