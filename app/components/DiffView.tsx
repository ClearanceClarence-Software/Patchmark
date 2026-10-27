import {
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { ReactElement } from 'react';

import {
	diffLines,
	diffWords,
	fold,
	stats,
	type Piece,
	type Row,
} from '../lib/diff';
import { bytes, num, sizeChange } from '../lib/format';
import {
	highlightLines,
	languageFor,
	segments,
	type Span,
} from '../lib/highlight';
import type { FileEntry } from '../types';
import { Dashicon, StatusBadge } from './ui';

export type ViewMode = 'split' | 'unified';

// Highlighted lines of each version, 0-based; null when a version isn't highlighted.
interface Highlight {
	old: Span[][] | null;
	new: Span[][] | null;
}

// Token spans for a row: deleted lines come from the installed version, the rest from the
// upload (unchanged rows show the uploaded text).
function spansFor( hl: Highlight, r: Row ): Span[] | undefined {
	return r.type === 'del' ? hl.old?.[ r.oldNo - 1 ] : hl.new?.[ r.newNo - 1 ];
}

const CONTEXT = 3;
// Whole new or deleted files start with this many lines shown.
const FIRST_LINES = 1500;

export default function DiffView( {
	file,
	mode,
	ignoreWhitespace,
	line,
	jump,
}: {
	file: FileEntry;
	mode: ViewMode;
	ignoreWhitespace: boolean;
	line?: number;
	jump: number;
} ) {
	const hasText = file.old !== undefined && file.new !== undefined;
	const rows = useMemo(
		() =>
			hasText
				? diffLines( file.old ?? '', file.new ?? '', ignoreWhitespace )
				: [],
		[ file, hasText, ignoreWhitespace ]
	);
	const s = useMemo( () => stats( rows ), [ rows ] );
	const hl = useMemo< Highlight >( () => {
		const lang = languageFor( file.path );
		return {
			old: hasText ? highlightLines( file.old ?? '', lang ) : null,
			new: hasText ? highlightLines( file.new ?? '', lang ) : null,
		};
	}, [ file, hasText ] );
	const [ expanded, setExpanded ] = useState< Set< number > >( new Set() );
	const [ showAll, setShowAll ] = useState( false );
	const body = useRef< HTMLDivElement >( null );

	useEffect( () => {
		setExpanded( new Set() );
		setShowAll( false );
	}, [ file ] );

	// The row a finding points at stays unfolded.
	const reveal = useMemo( () => {
		if ( ! line ) {
			return -1;
		}
		const key = file.status === 'removed' ? 'oldNo' : 'newNo';
		return rows.findIndex( ( r ) => r[ key ] === line );
	}, [ rows, line, file.status ] );

	useEffect( () => {
		if ( ! line || ! body.current ) {
			return;
		}
		const attr = file.status === 'removed' ? 'data-old' : 'data-new';
		const el = body.current.querySelector( `[${ attr }="${ line }"]` );
		if ( el ) {
			el.scrollIntoView( { block: 'center' } );
			el.classList.remove( 'is-flash' );
			// Restart the animation when the same line is opened again.
			void ( el as HTMLElement ).offsetWidth;
			el.classList.add( 'is-flash' );
		}
	}, [ line, jump, file, rows ] );

	const whole = file.status === 'added' || file.status === 'removed';
	const visible =
		whole && ! showAll && rows.length > FIRST_LINES
			? rows.slice( 0, FIRST_LINES )
			: rows;
	const blocks = whole
		? [ { kind: 'rows' as const, rows: visible } ]
		: fold( rows, CONTEXT, expanded, reveal );

	return (
		<div className="pmk-diff">
			<div className="pmk-diff-head">
				<StatusBadge status={ file.status } />
				<span className="pmk-diff-path">
					{ file.status === 'renamed' && file.oldPath && (
						<>
							<span className="pmk-muted">{ file.oldPath }</span>
							<Dashicon name="arrow-right-alt" />
						</>
					) }
					{ file.path }
				</span>
				{ hasText && file.status !== 'renamed' && (
					<span className="pmk-diff-stats">
						<span className="is-added">+{ num( s.added ) }</span>
						<span className="is-removed">
							−{ num( s.removed ) }
						</span>
					</span>
				) }
				<span className="pmk-muted pmk-diff-size">
					{ file.oldSize !== null && file.newSize !== null
						? `${ bytes( file.oldSize ) } → ${ bytes(
								file.newSize
							) } (${ sizeChange( file.oldSize, file.newSize ) })`
						: bytes( file.newSize ?? file.oldSize ) }
				</span>
			</div>

			{ ( file.oldImage || file.newImage ) && (
				<ImagePair file={ file } />
			) }

			{ file.status === 'renamed' && (
				<p className="pmk-diff-note">
					{ __(
						'Moved without changes. The contents are identical.',
						'patchmark'
					) }
				</p>
			) }

			{ file.status !== 'renamed' &&
				! hasText &&
				! file.oldImage &&
				! file.newImage && (
					<p className="pmk-diff-note">
						{ file.kind !== 'text' &&
							__(
								'Binary file. Only the size and checksum are compared.',
								'patchmark'
							) }
						{ file.kind === 'text' &&
							file.note === 'large' &&
							__(
								'This file is over 512 KB, so its contents are not shown. It was still compared and checked.',
								'patchmark'
							) }
						{ file.kind === 'text' &&
							file.note === 'budget' &&
							__(
								'Left out to keep the page light: the upload has more changed text than fits. It was still compared and checked.',
								'patchmark'
							) }
					</p>
				) }

			{ hasText && file.status === 'whitespace' && ignoreWhitespace && (
				<p className="pmk-diff-note">
					{ __(
						'Only line endings or trailing spaces differ. Turn off “Ignore whitespace” to see them.',
						'patchmark'
					) }
				</p>
			) }

			{ hasText && rows.length === 0 && file.status !== 'renamed' && (
				<p className="pmk-diff-note">
					{ __( 'The file is empty.', 'patchmark' ) }
				</p>
			) }

			{ hasText && rows.length > 0 && (
				<div
					ref={ body }
					className={ `pmk-code is-${ whole ? 'unified' : mode }` }
				>
					<table>
						{ mode === 'split' && ! whole ? (
							<colgroup>
								<col className="pmk-col-num" />
								<col />
								<col className="pmk-col-num" />
								<col />
							</colgroup>
						) : (
							<colgroup>
								<col className="pmk-col-num" />
								<col className="pmk-col-num" />
								<col />
							</colgroup>
						) }
						<tbody>
							{ blocks.map( ( block, i ) =>
								block.kind === 'gap' ? (
									<tr
										key={ `gap-${ block.from }` }
										className="pmk-gap"
									>
										<td
											colSpan={
												mode === 'split' && ! whole
													? 4
													: 3
											}
										>
											<button
												type="button"
												onClick={ () =>
													setExpanded( ( prev ) =>
														new Set( prev ).add(
															block.from
														)
													)
												}
											>
												<Dashicon name="editor-expand" />
												{ sprintf(
													/* translators: %s: number of lines */
													_n(
														'Show %s unchanged line',
														'Show %s unchanged lines',
														block.count,
														'patchmark'
													),
													num( block.count )
												) }
											</button>
										</td>
									</tr>
								) : (
									<Fragment key={ `rows-${ i }` }>
										{ mode === 'split' && ! whole ? (
											<SplitRows
												rows={ block.rows }
												hl={ hl }
											/>
										) : (
											<UnifiedRows
												rows={ block.rows }
												hl={ hl }
											/>
										) }
									</Fragment>
								)
							) }
						</tbody>
					</table>
					{ whole && ! showAll && rows.length > FIRST_LINES && (
						<button
							type="button"
							className="button pmk-more"
							onClick={ () => setShowAll( true ) }
						>
							{ sprintf(
								/* translators: %s: number of lines */
								__( 'Show all %s lines', 'patchmark' ),
								num( rows.length )
							) }
						</button>
					) }
				</div>
			) }
		</div>
	);
}

// Changed lines next to each other, with word highlights when a deleted and an added line pair up.
function SplitRows( { rows, hl }: { rows: Row[]; hl: Highlight } ) {
	const out: ReactElement[] = [];
	let i = 0;
	while ( i < rows.length ) {
		const r = rows[ i ];
		if ( r.type === 'equal' ) {
			out.push(
				<tr
					key={ `e${ r.oldNo }-${ r.newNo }` }
					data-old={ r.oldNo }
					data-new={ r.newNo }
				>
					<td className="pmk-num">{ r.oldNo }</td>
					<td className="pmk-line">
						<Code text={ r.text } spans={ spansFor( hl, r ) } />
					</td>
					<td className="pmk-num">{ r.newNo }</td>
					<td className="pmk-line">
						<Code text={ r.text } spans={ spansFor( hl, r ) } />
					</td>
				</tr>
			);
			i++;
			continue;
		}
		const dels: Row[] = [];
		const adds: Row[] = [];
		while ( i < rows.length && rows[ i ].type !== 'equal' ) {
			( rows[ i ].type === 'del' ? dels : adds ).push( rows[ i ] );
			i++;
		}
		for ( let k = 0; k < Math.max( dels.length, adds.length ); k++ ) {
			const d = dels[ k ];
			const a = adds[ k ];
			const words = d && a ? diffWords( d.text, a.text ) : null;
			out.push(
				<tr
					key={ `c${ d?.oldNo ?? 'x' }-${ a?.newNo ?? 'x' }` }
					data-old={ d?.oldNo || undefined }
					data-new={ a?.newNo || undefined }
				>
					<td className={ `pmk-num${ d ? ' is-del' : ' is-blank' }` }>
						{ d?.oldNo ?? '' }
					</td>
					<td
						className={ `pmk-line${ d ? ' is-del' : ' is-blank' }` }
					>
						{ d && (
							<Code
								text={ d.text }
								spans={ spansFor( hl, d ) }
								pieces={ words?.[ 0 ] }
							/>
						) }
					</td>
					<td className={ `pmk-num${ a ? ' is-add' : ' is-blank' }` }>
						{ a?.newNo ?? '' }
					</td>
					<td
						className={ `pmk-line${ a ? ' is-add' : ' is-blank' }` }
					>
						{ a && (
							<Code
								text={ a.text }
								spans={ spansFor( hl, a ) }
								pieces={ words?.[ 1 ] }
							/>
						) }
					</td>
				</tr>
			);
		}
	}
	return <>{ out }</>;
}

function UnifiedRows( { rows, hl }: { rows: Row[]; hl: Highlight } ) {
	// Word highlights for a run of deletions followed by the same number of additions.
	const words = new Map< Row, Piece[] >();
	let i = 0;
	while ( i < rows.length ) {
		if ( rows[ i ].type === 'equal' ) {
			i++;
			continue;
		}
		const dels: Row[] = [];
		const adds: Row[] = [];
		while ( i < rows.length && rows[ i ].type === 'del' ) {
			dels.push( rows[ i++ ] );
		}
		while ( i < rows.length && rows[ i ].type === 'add' ) {
			adds.push( rows[ i++ ] );
		}
		if ( dels.length === adds.length ) {
			dels.forEach( ( d, k ) => {
				const w = diffWords( d.text, adds[ k ].text );
				if ( w ) {
					words.set( d, w[ 0 ] );
					words.set( adds[ k ], w[ 1 ] );
				}
			} );
		}
	}

	return (
		<>
			{ rows.map( ( r ) => {
				const cls =
					r.type === 'add'
						? ' is-add'
						: r.type === 'del'
							? ' is-del'
							: '';
				const pieces = words.get( r );
				return (
					<tr
						key={ `${ r.type }${ r.oldNo }-${ r.newNo }` }
						data-old={ r.oldNo || undefined }
						data-new={ r.newNo || undefined }
					>
						<td className={ `pmk-num${ cls }` }>
							{ r.oldNo || '' }
						</td>
						<td className={ `pmk-num${ cls }` }>
							{ r.newNo || '' }
						</td>
						<td className={ `pmk-line${ cls }` }>
							<span className="pmk-sign" aria-hidden="true">
								{ r.type === 'add'
									? '+'
									: r.type === 'del'
										? '−'
										: ' ' }
							</span>
							<Code
								text={ r.text }
								spans={ spansFor( hl, r ) }
								pieces={ pieces }
							/>
						</td>
					</tr>
				);
			} ) }
		</>
	);
}

// One line of code: token colors from the highlighter, with the word-diff marks on top.
function Code( {
	text,
	spans,
	pieces,
}: {
	text: string;
	spans?: Span[];
	pieces?: Piece[] | null;
} ) {
	if ( ! spans && ! pieces ) {
		return <>{ text }</>;
	}
	return (
		<>
			{ segments( text, spans, pieces ).map( ( seg, i ) => {
				const cls = seg.types
					? seg.types
							.split( ' ' )
							.map( ( t ) => `tok-${ t }` )
							.join( ' ' )
					: '';
				if ( seg.changed ) {
					return (
						<mark key={ i } className={ cls || undefined }>
							{ seg.text }
						</mark>
					);
				}
				return cls ? (
					<span key={ i } className={ cls }>
						{ seg.text }
					</span>
				) : (
					<Fragment key={ i }>{ seg.text }</Fragment>
				);
			} ) }
		</>
	);
}

function ImagePair( { file }: { file: FileEntry } ) {
	return (
		<div className="pmk-images">
			{ [
				[ __( 'Installed', 'patchmark' ), file.oldImage ],
				[ __( 'Uploaded', 'patchmark' ), file.newImage ],
			].map( ( [ label, src ] ) => (
				<figure key={ label }>
					<figcaption>{ label }</figcaption>
					<div className="pmk-image-well">
						{ src ? (
							<img
								src={ src }
								alt={ `${ label }: ${ file.path }` }
							/>
						) : (
							<span className="pmk-muted">
								{ __( 'None', 'patchmark' ) }
							</span>
						) }
					</div>
				</figure>
			) ) }
		</div>
	);
}
