// Builds dist/unified-blocklist-<version>.zip with only what the plugin needs to run.
// Run `npm run build` first (`npm run zip` does both).
//
// The list is kept explicit on purpose: anything not named here (app source,
// configs, node_modules, dotfiles) stays out of the zip.
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import archiver from 'archiver';

const SLUG = 'patchmark';
const FILES = [ `${ SLUG }.php`, 'readme.txt' ];
const DIRS = [ 'src', 'build', 'licenses' ];

const { version } = JSON.parse( readFileSync( 'package.json', 'utf8' ) );
const header = readFileSync( `${ SLUG }.php`, 'utf8' ).match( /Version:\s*([\d.]+)/ )?.[ 1 ];

if ( header !== version ) {
	console.error( `Version mismatch: package.json says ${ version }, ${ SLUG }.php says ${ header }.` );
	process.exit( 1 );
}
if ( ! existsSync( 'build/index.js' ) ) {
	console.error( 'No build/ folder. Run `npm run build` first.' );
	process.exit( 1 );
}

mkdirSync( 'dist', { recursive: true } );
const target = `dist/${ SLUG }-${ version }.zip`;
const zip = archiver( 'zip', { zlib: { level: 9 } } );
zip.pipe( createWriteStream( target ) );

// Everything goes under unified-blocklist/, so it unzips straight into wp-content/plugins.
FILES.forEach( ( f ) => zip.file( f, { name: `${ SLUG }/${ f }` } ) );
DIRS.forEach( ( d ) => zip.directory( d, `${ SLUG }/${ d }` ) );

await zip.finalize();
console.log( `${ target } (${ ( zip.pointer() / 1024 ).toFixed( 0 ) } KB)` );
