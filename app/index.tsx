import { createRoot } from '@wordpress/element';

import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-700.css';

import App from './App';
import './viewer.scss';

const mount = document.getElementById( 'ccs-upload-diff' );
if ( mount && window.ccsUploadDiff ) {
	createRoot( mount ).render( <App report={ window.ccsUploadDiff } /> );
}
