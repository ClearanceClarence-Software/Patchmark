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
import type { FileEntry } from '../types';
import { Dashicon, StatusBadge } from './ui';

export type ViewMode = 'split' | 'unified';

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
		<div className="ccs-ud-diff">
			<div className="ccs-ud-diff-head">
				<StatusBadge status={ file.status } />
				<span className="ccs-ud-diff-path">
					{ file.status === 'renamed' && file.oldPath && (
						<>
							<span className="ccs-ud-muted">
								{ file.oldPath }
							</span>
							<Dashicon name="arrow-right-alt" />
						</>
					) }
					{ file.path }
				</span>
				{ hasText && file.status !== 'renamed' && (
					<span className="ccs-ud-diff-stats">
						<span className="is-added">+{ num( s.added ) }</span>
						<span className="is-removed">
							−{ num( s.removed ) }
						</span>
					</span>
				) }
				<span className="ccs-ud-muted ccs-ud-diff-size">
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
				<p className="ccs-ud-diff-note">
					{ __(
						'Moved without changes. The contents are identical.',
						'ccs-upload-diff'
					) }
				</p>
			) }

			{ file.status !== 'renamed' &&
				! hasText &&
				! file.oldImage &&
				! file.newImage && (
					<p className="ccs-ud-diff-note">
						{ file.kind !== 'text' &&
							__(
								'Binary file. Only the size and checksum are compared.',
								'ccs-upload-diff'
							) }
						{ file.kind === 'text' &&
							file.note === 'large' &&
							__(
								'This file is over 512 KB, so its contents are not shown. It was still compared and checked.',
								'ccs-upload-diff'
							) }
						{ file.kind === 'text' &&
							file.note === 'budget' &&
							__(
								'Left out to keep the page light: the upload has more changed text than fits. It was still compared and checked.',
								'ccs-upload-diff'
							) }
					</p>
				) }

			{ hasText && file.status === 'whitespace' && ignoreWhitespace && (
				<p className="ccs-ud-diff-note">
					{ __(
						'Only line endings or trailing spaces differ. Turn off “Ignore whitespace” to see them.',
						'ccs-upload-diff'
					) }
				</p>
			) }

			{ hasText && rows.length === 0 && file.status !== 'renamed' && (
				<p className="ccs-ud-diff-note">
					{ __( 'The file is empty.', 'ccs-upload-diff' ) }
				</p>
			) }

			{ hasText && rows.length > 0 && (
				<div
					ref={ body }
					className={ `ccs-ud-code is-${ whole ? 'unified' : mode }` }
				>
					<table>
						{ mode === 'split' && ! whole ? (
							<colgroup>
								<col className="ccs-ud-col-num" />
								<col />
								<col className="ccs-ud-col-num" />
								<col />
							</colgroup>
						) : (
							<colgroup>
								<col className="ccs-ud-col-num" />
								<col className="ccs-ud-col-num" />
								<col />
							</colgroup>
						) }
						<tbody>
							{ blocks.map( ( block, i ) =>
								block.kind === 'gap' ? (
									<tr
										key={ `gap-${ block.from }` }
										className="ccs-ud-gap"
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
														'ccs-upload-diff'
													),
													num( block.count )
												) }
											</button>
										</td>
									</tr>
								) : (
									<Fragment key={ `rows-${ i }` }>
										{ mode === 'split' && ! whole ? (
											<SplitRows rows={ block.rows } />
										) : (
											<UnifiedRows rows={ block.rows } />
										) }
									</Fragment>
								)
							) }
						</tbody>
					</table>
					{ whole && ! showAll && rows.length > FIRST_LINES && (
						<button
							type="button"
							className="button ccs-ud-more"
							onClick={ () => setShowAll( true ) }
						>
							{ sprintf(
								/* translators: %s: number of lines */
								__( 'Show all %s lines', 'ccs-upload-diff' ),
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
function SplitRows( { rows }: { rows: Row[] } ) {
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
					<td className="ccs-ud-num">{ r.oldNo }</td>
					<td className="ccs-ud-line">{ r.text }</td>
					<td className="ccs-ud-num">{ r.newNo }</td>
					<td className="ccs-ud-line">{ r.text }</td>
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
					<td
						className={ `ccs-ud-num${ d ? ' is-del' : ' is-blank' }` }
					>
						{ d?.oldNo ?? '' }
					</td>
					<td
						className={ `ccs-ud-line${ d ? ' is-del' : ' is-blank' }` }
					>
						{ d &&
							( words ? (
								<Pieces pieces={ words[ 0 ] } />
							) : (
								d.text
							) ) }
					</td>
					<td
						className={ `ccs-ud-num${ a ? ' is-add' : ' is-blank' }` }
					>
						{ a?.newNo ?? '' }
					</td>
					<td
						className={ `ccs-ud-line${ a ? ' is-add' : ' is-blank' }` }
					>
						{ a &&
							( words ? (
								<Pieces pieces={ words[ 1 ] } />
							) : (
								a.text
							) ) }
					</td>
				</tr>
			);
		}
	}
	return <>{ out }</>;
}

function UnifiedRows( { rows }: { rows: Row[] } ) {
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
						<td className={ `ccs-ud-num${ cls }` }>
							{ r.oldNo || '' }
						</td>
						<td className={ `ccs-ud-num${ cls }` }>
							{ r.newNo || '' }
						</td>
						<td className={ `ccs-ud-line${ cls }` }>
							<span className="ccs-ud-sign" aria-hidden="true">
								{ r.type === 'add'
									? '+'
									: r.type === 'del'
										? '−'
										: ' ' }
							</span>
							{ pieces ? <Pieces pieces={ pieces } /> : r.text }
						</td>
					</tr>
				);
			} ) }
		</>
	);
}

function Pieces( { pieces }: { pieces: Piece[] } ) {
	return (
		<>
			{ pieces.map( ( p, i ) =>
				p.changed ? (
					<mark key={ i }>{ p.text }</mark>
				) : (
					<Fragment key={ i }>{ p.text }</Fragment>
				)
			) }
		</>
	);
}

function ImagePair( { file }: { file: FileEntry } ) {
	return (
		<div className="ccs-ud-images">
			{ [
				[ __( 'Installed', 'ccs-upload-diff' ), file.oldImage ],
				[ __( 'Uploaded', 'ccs-upload-diff' ), file.newImage ],
			].map( ( [ label, src ] ) => (
				<figure key={ label }>
					<figcaption>{ label }</figcaption>
					<div className="ccs-ud-image-well">
						{ src ? (
							<img
								src={ src }
								alt={ `${ label }: ${ file.path }` }
							/>
						) : (
							<span className="ccs-ud-muted">
								{ __( 'None', 'ccs-upload-diff' ) }
							</span>
						) }
					</div>
				</figure>
			) ) }
		</div>
	);
}
