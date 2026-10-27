import { createRoot } from '@wordpress/element';

// Bundled, so wp-admin never calls out to Google Fonts. Same faces as Routemark: Bricolage
// Grotesque for the wordmark only, Atkinson Hyperlegible for everything else.
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-700.css';

import App from './App';
import './viewer.scss';

const mount = document.getElementById( 'patchmark' );
if ( mount && window.patchmarkReport ) {
	createRoot( mount ).render( <App report={ window.patchmarkReport } /> );
}
