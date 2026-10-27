import type { FileEntry } from '../types';
import { diffLines, fold, type Row } from './diff';

/**
 * A git-style unified patch of every file whose contents are on the page, which `git apply`
 * (or `patch -p1`) applies to the installed copy. Binary files and files left out for size
 * can't be in a text patch; they are listed in the header, which git ignores.
 * @param files
 */
export function buildPatch( files: FileEntry[] ): string {
	const out: string[] = [];
	const missing: string[] = [];

	for ( const f of files ) {
		const a = `a/${ f.oldPath ?? f.path }`;
		const b = `b/${ f.path }`;
		if ( f.status === 'renamed' ) {
			out.push(
				`diff --git ${ a } ${ b }`,
				'similarity index 100%',
				`rename from ${ f.oldPath }`,
				`rename to ${ f.path }`
			);
			continue;
		}
		if ( f.kind !== 'text' || f.old === undefined || f.new === undefined ) {
			missing.push( `#   ${ f.status }: ${ f.path }` );
			continue;
		}
		out.push( `diff --git ${ a } ${ b }` );
		if ( f.status === 'added' ) {
			out.push( 'new file mode 100644' );
		} else if ( f.status === 'removed' ) {
			out.push( 'deleted file mode 100644' );
		}
		out.push( `--- ${ f.status === 'added' ? '/dev/null' : a }` );
		out.push( `+++ ${ f.status === 'removed' ? '/dev/null' : b }` );
		out.push( ...hunks( f.old, f.new ) );
	}

	const head = missing.length
		? [
				'# Not in this patch (binary, or too large to include). Copy these from the zip:',
				...missing,
				'',
			]
		: [];
	return [ ...head, ...out ].join( '\n' ) + '\n';
}

function hunks( oldText: string, newText: string ): string[] {
	const rows = diffLines( oldText, newText, false, true );
	const oldEnd = oldText !== '' && ! oldText.endsWith( '\n' );
	const newEnd = newText !== '' && ! newText.endsWith( '\n' );
	const lastOld = rows.reduce( ( n, r ) => Math.max( n, r.oldNo ), 0 );
	const lastNew = rows.reduce( ( n, r ) => Math.max( n, r.newNo ), 0 );
	const out: string[] = [];

	for ( const block of fold( rows, 3, new Set() ) ) {
		if ( block.kind !== 'rows' ) {
			continue;
		}
		const r = block.rows;
		const oldLen = r.filter( ( x ) => x.type !== 'add' ).length;
		const newLen = r.filter( ( x ) => x.type !== 'del' ).length;
		const oldStart = start( rows, r[ 0 ], 'oldNo' );
		const newStart = start( rows, r[ 0 ], 'newNo' );
		out.push(
			`@@ -${ oldLen ? oldStart : oldStart - 1 },${ oldLen } +${ newLen ? newStart : newStart - 1 },${ newLen } @@`
		);
		for ( const x of r ) {
			out.push(
				( x.type === 'add' ? '+' : x.type === 'del' ? '-' : ' ' ) +
					x.text
			);
			// git needs to be told when the last line of a side has no newline after it.
			const endsOld = x.type !== 'add' && oldEnd && x.oldNo === lastOld;
			const endsNew = x.type !== 'del' && newEnd && x.newNo === lastNew;
			if ( endsOld || endsNew ) {
				out.push( '\\ No newline at end of file' );
			}
		}
	}
	return out;
}

// Line number where a hunk starts on one side: its first row on that side, or the line after
// the last one before it when the hunk has no rows there.
function start( rows: Row[], first: Row, side: 'oldNo' | 'newNo' ): number {
	if ( first[ side ] ) {
		return first[ side ];
	}
	const i = rows.indexOf( first );
	for ( let j = i; j < rows.length; j++ ) {
		if ( rows[ j ][ side ] ) {
			return rows[ j ][ side ];
		}
	}
	for ( let j = i - 1; j >= 0; j-- ) {
		if ( rows[ j ][ side ] ) {
			return rows[ j ][ side ] + 1;
		}
	}
	return 1;
}
