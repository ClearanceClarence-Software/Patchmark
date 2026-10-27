// Syntax highlighting with Prism, bundled with the plugin. Each version of a file is
// highlighted as a whole, so comments and strings that span lines come out right, and then
// split into lines that the diff rows look up by line number.

import './prism/manual';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-less';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-twig';

import type { Piece } from './diff';

// One run of text with the token types it belongs to ("keyword", "string", …).
export interface Span {
	text: string;
	types: string;
}

const BY_EXT: Record< string, string > = {
	php: 'php',
	phtml: 'php',
	inc: 'php',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	ts: 'typescript',
	tsx: 'tsx',
	css: 'css',
	scss: 'scss',
	sass: 'scss',
	less: 'less',
	json: 'json',
	map: 'json',
	lock: 'json',
	html: 'markup',
	htm: 'markup',
	xml: 'markup',
	svg: 'markup',
	vue: 'markup',
	yml: 'yaml',
	yaml: 'yaml',
	neon: 'yaml',
	ini: 'ini',
	htaccess: 'bash',
	sql: 'sql',
	sh: 'bash',
	md: 'markdown',
	markdown: 'markdown',
	twig: 'twig',
};

// Past these, highlighting would cost more than it helps (minified bundles, data files).
const MAX_CHARS = 400000;
const MAX_LINE = 3000;

export function languageFor( path: string ): string | null {
	const base = path.split( '/' ).pop()?.toLowerCase() ?? '';
	if ( base === '.htaccess' ) {
		return 'bash';
	}
	const ext = base.includes( '.' ) ? ( base.split( '.' ).pop() ?? '' ) : '';
	const lang = BY_EXT[ ext ];
	return lang && Prism.languages[ lang ] ? lang : null;
}

/**
 * Highlighted lines of one version of a file, 0-based, or null when the file is not worth
 * highlighting. Line splitting matches splitLines() in diff.ts.
 * @param text
 * @param lang
 */
export function highlightLines(
	text: string,
	lang: string | null
): Span[][] | null {
	if ( ! lang || ! text || text.length > MAX_CHARS ) {
		return null;
	}
	const normalized = text.replace( /\r\n?/g, '\n' );
	if ( normalized.split( '\n' ).some( ( l ) => l.length > MAX_LINE ) ) {
		return null;
	}

	let tokens: Array< string | Prism.Token >;
	try {
		tokens = Prism.tokenize( normalized, Prism.languages[ lang ] );
	} catch {
		return null;
	}

	const lines: Span[][] = [ [] ];
	const walk = (
		stream: Array< string | Prism.Token > | string | Prism.Token,
		types: string
	) => {
		if ( typeof stream === 'string' ) {
			const parts = stream.split( '\n' );
			parts.forEach( ( part, i ) => {
				if ( i > 0 ) {
					lines.push( [] );
				}
				if ( part ) {
					lines[ lines.length - 1 ].push( { text: part, types } );
				}
			} );
			return;
		}
		if ( Array.isArray( stream ) ) {
			stream.forEach( ( s ) => walk( s, types ) );
			return;
		}
		const alias = Array.isArray( stream.alias )
			? stream.alias.join( ' ' )
			: ( stream.alias ?? '' );
		walk(
			stream.content as
				Array< string | Prism.Token > | string | Prism.Token,
			`${ types } ${ stream.type } ${ alias }`.trim()
		);
	};
	walk( tokens, '' );

	if ( normalized.endsWith( '\n' ) ) {
		lines.pop();
	}
	return lines;
}

// A piece of a line with both its token types and whether the word diff marked it.
export interface Segment {
	text: string;
	types: string;
	changed: boolean;
}

/**
 * Merges token spans with word-diff pieces. Either may be missing; both describe the same
 * line text, so they are cut at each other's boundaries.
 * @param text
 * @param spans
 * @param pieces
 */
export function segments(
	text: string,
	spans: Span[] | undefined,
	pieces: Piece[] | null | undefined
): Segment[] {
	const a =
		spans && spans.map( ( s ) => s.text ).join( '' ) === text
			? spans
			: [ { text, types: '' } ];
	const b =
		pieces && pieces.map( ( p ) => p.text ).join( '' ) === text
			? pieces
			: [ { text, changed: false } ];

	const out: Segment[] = [];
	let i = 0;
	let j = 0;
	let ai = 0;
	let bj = 0;
	while ( i < a.length && j < b.length ) {
		const restA = a[ i ].text.length - ai;
		const restB = b[ j ].text.length - bj;
		const n = Math.min( restA, restB );
		const piece = a[ i ].text.slice( ai, ai + n );
		const last = out[ out.length - 1 ];
		if (
			last &&
			last.types === a[ i ].types &&
			last.changed === b[ j ].changed
		) {
			last.text += piece;
		} else {
			out.push( {
				text: piece,
				types: a[ i ].types,
				changed: b[ j ].changed,
			} );
		}
		ai += n;
		bj += n;
		if ( ai >= a[ i ].text.length ) {
			i++;
			ai = 0;
		}
		if ( bj >= b[ j ].text.length ) {
			j++;
			bj = 0;
		}
	}
	return out;
}
