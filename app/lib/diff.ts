// Line and word diffs, computed in the browser so the page only carries the two texts.

export type RowType = 'equal' | 'del' | 'add';

export interface Row {
	type: RowType;
	// 1-based line numbers; 0 when the line is not on that side.
	oldNo: number;
	newNo: number;
	text: string;
}

export interface DiffStats {
	added: number;
	removed: number;
}

// Above this many edit steps the middle of the file is shown as replaced, rather than
// spending seconds finding the smallest edit.
const MAX_EDITS = 2000;

// With raw, carriage returns stay on the lines, so a patch keeps the file's line endings.
export function splitLines( text: string, raw = false ): string[] {
	if ( text === '' ) {
		return [];
	}
	const lines = ( raw ? text : text.replace( /\r\n?/g, '\n' ) ).split( '\n' );
	// A final newline is not an extra empty line.
	if ( lines[ lines.length - 1 ] === '' ) {
		lines.pop();
	}
	return lines;
}

/**
 * Myers' O(ND) diff over sequences of numbers. Returns the edit script as
 * [ type, indexInA, indexInB ] triples in order.
 * @param a
 * @param b
 */
function myers(
	a: number[],
	b: number[]
): Array< [ RowType, number, number ] > | null {
	const n = a.length;
	const m = b.length;
	const max = n + m;
	const offset = max + 1;
	const v = new Int32Array( 2 * max + 3 );
	const trace: Int32Array[] = [];

	for ( let d = 0; d <= max; d++ ) {
		if ( d > MAX_EDITS ) {
			return null;
		}
		// Only the diagonals this step can read are kept, so memory grows with d², not d × (n + m).
		trace.push( v.slice( offset - d - 1, offset + d + 2 ) );
		for ( let k = -d; k <= d; k += 2 ) {
			let x =
				k === -d ||
				( k !== d && v[ offset + k - 1 ] < v[ offset + k + 1 ] )
					? v[ offset + k + 1 ]
					: v[ offset + k - 1 ] + 1;
			let y = x - k;
			while ( x < n && y < m && a[ x ] === b[ y ] ) {
				x++;
				y++;
			}
			v[ offset + k ] = x;
			if ( x >= n && y >= m ) {
				return backtrack( trace, a.length, b.length, d );
			}
		}
	}
	return null;
}

function backtrack(
	trace: Int32Array[],
	n: number,
	m: number,
	dEnd: number
): Array< [ RowType, number, number ] > {
	const out: Array< [ RowType, number, number ] > = [];
	let x = n;
	let y = m;
	for ( let d = dEnd; d > 0; d-- ) {
		const v = trace[ d ];
		const at = ( k: number ) => v[ k + d + 1 ];
		const k = x - y;
		const prevK =
			k === -d || ( k !== d && at( k - 1 ) < at( k + 1 ) )
				? k + 1
				: k - 1;
		const prevX = at( prevK );
		const prevY = prevX - prevK;
		while ( x > prevX && y > prevY ) {
			x--;
			y--;
			out.push( [ 'equal', x, y ] );
		}
		if ( x === prevX ) {
			y--;
			out.push( [ 'add', x, y ] );
		} else {
			x--;
			out.push( [ 'del', x, y ] );
		}
	}
	while ( x > 0 && y > 0 ) {
		x--;
		y--;
		out.push( [ 'equal', x, y ] );
	}
	return out.reverse();
}

/**
 * Line diff. With ignoreWhitespace, lines that differ only in spacing count as equal and the
 * uploaded line is shown.
 * @param oldText
 * @param newText
 * @param ignoreWhitespace
 * @param raw
 */
export function diffLines(
	oldText: string,
	newText: string,
	ignoreWhitespace = false,
	raw = false
): Row[] {
	const a = splitLines( oldText, raw );
	const b = splitLines( newText, raw );
	const key = ignoreWhitespace
		? ( s: string ) => s.replace( /\s+/g, ' ' ).trim()
		: ( s: string ) => s;

	// Lines become small integers, so comparing them is cheap.
	const ids = new Map< string, number >();
	const id = ( s: string ) => {
		const k = key( s );
		let n = ids.get( k );
		if ( n === undefined ) {
			n = ids.size;
			ids.set( k, n );
		}
		return n;
	};
	const ai = a.map( id );
	const bi = b.map( id );

	// Common start and end never need the full algorithm.
	let start = 0;
	while (
		start < ai.length &&
		start < bi.length &&
		ai[ start ] === bi[ start ]
	) {
		start++;
	}
	let endA = ai.length;
	let endB = bi.length;
	while (
		endA > start &&
		endB > start &&
		ai[ endA - 1 ] === bi[ endB - 1 ]
	) {
		endA--;
		endB--;
	}

	const rows: Row[] = [];
	const equal = ( i: number, j: number ) =>
		rows.push( {
			type: 'equal',
			oldNo: i + 1,
			newNo: j + 1,
			text: b[ j ],
		} );

	for ( let i = 0; i < start; i++ ) {
		equal( i, i );
	}

	const script = myers( ai.slice( start, endA ), bi.slice( start, endB ) );
	if ( script ) {
		for ( const [ type, x, y ] of script ) {
			if ( type === 'equal' ) {
				equal( start + x, start + y );
			} else if ( type === 'del' ) {
				rows.push( {
					type,
					oldNo: start + x + 1,
					newNo: 0,
					text: a[ start + x ],
				} );
			} else {
				rows.push( {
					type,
					oldNo: 0,
					newNo: start + y + 1,
					text: b[ start + y ],
				} );
			}
		}
	} else {
		for ( let i = start; i < endA; i++ ) {
			rows.push( { type: 'del', oldNo: i + 1, newNo: 0, text: a[ i ] } );
		}
		for ( let j = start; j < endB; j++ ) {
			rows.push( { type: 'add', oldNo: 0, newNo: j + 1, text: b[ j ] } );
		}
	}

	for ( let i = endA, j = endB; i < ai.length; i++, j++ ) {
		equal( i, j );
	}
	return rows;
}

export function stats( rows: Row[] ): DiffStats {
	let added = 0;
	let removed = 0;
	for ( const r of rows ) {
		if ( r.type === 'add' ) {
			added++;
		} else if ( r.type === 'del' ) {
			removed++;
		}
	}
	return { added, removed };
}

// Pieces of a line, marked where they differ from the other side.
export interface Piece {
	text: string;
	changed: boolean;
}

const TOKEN = /\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu;

/**
 * Word-level differences between two versions of one line. Returns null when the lines have
 * too little in common for highlights to help.
 * @param oldLine
 * @param newLine
 */
export function diffWords(
	oldLine: string,
	newLine: string
): [ Piece[], Piece[] ] | null {
	const a = oldLine.match( TOKEN ) ?? [];
	const b = newLine.match( TOKEN ) ?? [];
	if ( a.length > 500 || b.length > 500 ) {
		return null;
	}
	const ids = new Map< string, number >();
	const id = ( s: string ) => {
		let n = ids.get( s );
		if ( n === undefined ) {
			n = ids.size;
			ids.set( s, n );
		}
		return n;
	};
	const script = myers( a.map( id ), b.map( id ) );
	if ( ! script ) {
		return null;
	}

	const left: Piece[] = [];
	const right: Piece[] = [];
	let same = 0;
	const push = ( list: Piece[], text: string, changed: boolean ) => {
		const last = list[ list.length - 1 ];
		if ( last && last.changed === changed ) {
			last.text += text;
		} else {
			list.push( { text, changed } );
		}
	};
	for ( const [ type, x, y ] of script ) {
		if ( type === 'equal' ) {
			push( left, a[ x ], false );
			push( right, b[ y ], false );
			same += a[ x ].trim() ? a[ x ].length : 0;
		} else if ( type === 'del' ) {
			push( left, a[ x ], true );
		} else {
			push( right, b[ y ], true );
		}
	}
	const longest = Math.max( oldLine.trim().length, newLine.trim().length, 1 );
	return same / longest < 0.3 ? null : [ left, right ];
}

// A run of rows to show, or a run of unchanged rows folded away.
export type Block =
	| { kind: 'rows'; rows: Row[] }
	| { kind: 'gap'; from: number; count: number };

/**
 * Folds unchanged runs longer than 2 × context. `expanded` holds the start index of gaps the
 * reader opened; `reveal` is an index (into rows) that must stay visible.
 * @param rows
 * @param context
 * @param expanded
 * @param reveal
 */
export function fold(
	rows: Row[],
	context: number,
	expanded: Set< number >,
	reveal = -1
): Block[] {
	const blocks: Block[] = [];
	let i = 0;
	let current: Row[] = [];
	const flush = () => {
		if ( current.length ) {
			blocks.push( { kind: 'rows', rows: current } );
			current = [];
		}
	};

	while ( i < rows.length ) {
		if ( rows[ i ].type !== 'equal' ) {
			current.push( rows[ i++ ] );
			continue;
		}
		let j = i;
		while ( j < rows.length && rows[ j ].type === 'equal' ) {
			j++;
		}
		const head = i === 0 ? 0 : context;
		const tail = j === rows.length ? 0 : context;
		const hidden = j - i - head - tail;
		const from = i + head;
		const open =
			expanded.has( from ) ||
			( reveal >= from && reveal < from + hidden );
		if ( hidden > 1 && ! open ) {
			current.push( ...rows.slice( i, from ) );
			flush();
			blocks.push( { kind: 'gap', from, count: hidden } );
			current.push( ...rows.slice( from + hidden, j ) );
		} else {
			current.push( ...rows.slice( i, j ) );
		}
		i = j;
	}
	flush();
	return blocks;
}
