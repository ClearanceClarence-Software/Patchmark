import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import type { Target } from '../App';
import { diffLines, stats, type DiffStats } from '../lib/diff';
import { num } from '../lib/format';
import { buildPatch } from '../lib/patch';
import type { FileEntry, Report, Status } from '../types';
import DiffView, { type ViewMode } from './DiffView';
import { Dashicon, Empty, STATUS_LABELS, StatusBadge } from './ui';

const ORDER: Status[] = [
	'modified',
	'added',
	'removed',
	'renamed',
	'whitespace',
];

interface Folder {
	name: string;
	path: string;
	folders: Folder[];
	files: FileEntry[];
}

function readPref< T extends string >(
	key: string,
	fallback: T,
	allowed: T[]
): T {
	try {
		const v = window.localStorage.getItem( `pmk-${ key }` ) as T | null;
		return v && allowed.includes( v ) ? v : fallback;
	} catch {
		return fallback;
	}
}

function writePref( key: string, value: string ) {
	try {
		window.localStorage.setItem( `pmk-${ key }`, value );
	} catch {
		// Private windows: the choice just isn't remembered.
	}
}

export default function Files( {
	report,
	target,
}: {
	report: Report;
	target: Target | null;
} ) {
	const files = report.files;
	const [ query, setQuery ] = useState( '' );
	const [ inContents, setInContents ] = useState( false );
	const [ statuses, setStatuses ] = useState< Set< Status > >( new Set() );
	const [ mode, setMode ] = useState< ViewMode >(
		readPref< ViewMode >( 'mode', 'split', [ 'split', 'unified' ] )
	);
	const [ ignoreWs, setIgnoreWs ] = useState(
		readPref< 'on' | 'off' >( 'ws', 'off', [ 'on', 'off' ] ) === 'on'
	);
	const [ selected, setSelected ] = useState< string >(
		target?.path ?? firstChanged( files )?.path ?? ''
	);
	const [ collapsed, setCollapsed ] = useState< Set< string > >( new Set() );
	const [ fileStats, setFileStats ] = useState< Map< string, DiffStats > >(
		new Map()
	);
	const treeRef = useRef< HTMLDivElement >( null );

	useEffect( () => {
		if ( target ) {
			setSelected( target.path );
			setQuery( '' );
			setStatuses( new Set() );
		}
	}, [ target ] );

	// Line counts for the tree, worked out a few files at a time so the page stays responsive.
	useEffect( () => {
		let cancelled = false;
		const queue = files.filter(
			( f ) => f.old !== undefined && f.new !== undefined
		);
		const result = new Map< string, DiffStats >();
		let i = 0;
		const step = () => {
			const until = performance.now() + 12;
			while ( i < queue.length && performance.now() < until ) {
				const f = queue[ i++ ];
				result.set(
					f.path,
					stats( diffLines( f.old ?? '', f.new ?? '', ignoreWs ) )
				);
			}
			if ( cancelled ) {
				return;
			}
			setFileStats( new Map( result ) );
			if ( i < queue.length ) {
				window.setTimeout( step, 0 );
			}
		};
		step();
		return () => {
			cancelled = true;
		};
	}, [ files, ignoreWs ] );

	const q = query.trim().toLowerCase();
	const visible = useMemo(
		() =>
			files.filter( ( f ) => {
				if ( statuses.size && ! statuses.has( f.status ) ) {
					return false;
				}
				if ( ! q ) {
					return true;
				}
				if (
					f.path.toLowerCase().includes( q ) ||
					f.oldPath?.toLowerCase().includes( q )
				) {
					return true;
				}
				return (
					inContents &&
					( ( f.new ?? '' ).toLowerCase().includes( q ) ||
						( f.old ?? '' ).toLowerCase().includes( q ) )
				);
			} ),
		[ files, statuses, q, inContents ]
	);

	const tree = useMemo( () => buildTree( visible ), [ visible ] );
	const order = useMemo(
		() => flatten( tree, collapsed ),
		[ tree, collapsed ]
	);
	const current = files.find( ( f ) => f.path === selected ) ?? null;

	const counts = useMemo( () => {
		const c: Partial< Record< Status, number > > = {};
		files.forEach(
			( f ) => ( c[ f.status ] = ( c[ f.status ] ?? 0 ) + 1 )
		);
		return c;
	}, [ files ] );

	// j / k (or the arrow keys in the tree) move between files.
	useEffect( () => {
		const onKey = ( e: KeyboardEvent ) => {
			const el = e.target as HTMLElement;
			if (
				[ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( el.tagName ) ||
				e.metaKey ||
				e.ctrlKey ||
				e.altKey
			) {
				return;
			}
			const inTree = treeRef.current?.contains( el );
			const next = e.key === 'j' || ( inTree && e.key === 'ArrowDown' );
			const prev = e.key === 'k' || ( inTree && e.key === 'ArrowUp' );
			if ( ! next && ! prev ) {
				return;
			}
			const paths = order.map( ( f ) => f.path );
			const i = paths.indexOf( selected );
			const to =
				paths[
					next
						? Math.min( paths.length - 1, i + 1 )
						: Math.max( 0, i - 1 )
				];
			if ( to ) {
				e.preventDefault();
				setSelected( to );
				treeRef.current
					?.querySelector< HTMLButtonElement >(
						`[data-path="${ CSS.escape( to ) }"]`
					)
					?.focus();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ order, selected ] );

	const toggleStatus = ( s: Status ) =>
		setStatuses( ( prev ) => {
			const next = new Set( prev );
			if ( next.has( s ) ) {
				next.delete( s );
			} else {
				next.add( s );
			}
			return next;
		} );

	const downloadPatch = () => {
		const text = buildPatch( files );
		const url = URL.createObjectURL(
			new Blob( [ text ], { type: 'text/x-diff' } )
		);
		const a = document.createElement( 'a' );
		const { folder, oldVersion, newVersion } = report.plugin;
		a.href = url;
		a.download = `${ folder }-${ oldVersion || 'installed' }-to-${ newVersion || 'uploaded' }.patch`;
		document.body.appendChild( a );
		a.click();
		a.remove();
		window.setTimeout( () => URL.revokeObjectURL( url ), 1000 );
	};

	if ( files.length === 0 ) {
		return (
			<Empty
				icon="yes-alt"
				title={ __(
					'The upload is identical to the installed copy.',
					'patchmark'
				) }
			>
				{ sprintf(
					/* translators: %s: number of files */
					__( 'All %s files have the same contents.', 'patchmark' ),
					num( report.counts.unchanged )
				) }
			</Empty>
		);
	}

	return (
		<div className="pmk-files">
			<div className="pmk-toolbar">
				<label className="pmk-search" htmlFor="pmk-filter">
					<Dashicon name="search" />
					<span className="screen-reader-text">
						{ __( 'Filter files', 'patchmark' ) }
					</span>
					<input
						id="pmk-filter"
						type="search"
						value={ query }
						placeholder={ __( 'Filter files', 'patchmark' ) }
						onChange={ ( e ) => setQuery( e.target.value ) }
					/>
				</label>
				<label className="pmk-check" htmlFor="pmk-contents">
					<input
						id="pmk-contents"
						type="checkbox"
						checked={ inContents }
						onChange={ ( e ) => setInContents( e.target.checked ) }
					/>
					{ __( 'Search contents', 'patchmark' ) }
				</label>
				<div
					className="pmk-chips"
					role="group"
					aria-label={ __( 'Show', 'patchmark' ) }
				>
					{ ORDER.filter( ( s ) => counts[ s ] ).map( ( s ) => (
						<button
							key={ s }
							type="button"
							aria-pressed={ statuses.has( s ) }
							className={ `pmk-chip is-${ s }` }
							onClick={ () => toggleStatus( s ) }
						>
							{ STATUS_LABELS[ s ] }
							<span>{ num( counts[ s ] ?? 0 ) }</span>
						</button>
					) ) }
				</div>
				<span className="pmk-spacer" />
				<label className="pmk-check" htmlFor="pmk-ws">
					<input
						id="pmk-ws"
						type="checkbox"
						checked={ ignoreWs }
						onChange={ ( e ) => {
							setIgnoreWs( e.target.checked );
							writePref( 'ws', e.target.checked ? 'on' : 'off' );
						} }
					/>
					{ __( 'Ignore whitespace', 'patchmark' ) }
				</label>
				<div
					className="pmk-seg"
					role="group"
					aria-label={ __( 'Layout', 'patchmark' ) }
				>
					{ (
						[
							[ 'split', __( 'Split', 'patchmark' ) ],
							[ 'unified', __( 'Unified', 'patchmark' ) ],
						] as Array< [ ViewMode, string ] >
					 ).map( ( [ m, label ] ) => (
						<button
							key={ m }
							type="button"
							aria-pressed={ mode === m }
							onClick={ () => {
								setMode( m );
								writePref( 'mode', m );
							} }
						>
							{ label }
						</button>
					) ) }
				</div>
				<button
					type="button"
					className="button"
					onClick={ downloadPatch }
					title={ __(
						'Download the text changes as a patch for git apply',
						'patchmark'
					) }
				>
					<Dashicon name="download" />
					{ __( '.patch', 'patchmark' ) }
				</button>
			</div>

			<div className="pmk-browser">
				<div
					className="pmk-tree"
					ref={ treeRef }
					aria-label={ __( 'Changed files', 'patchmark' ) }
					role="navigation"
				>
					{ visible.length === 0 ? (
						<p className="pmk-muted pmk-tree-empty">
							{ __( 'No files match.', 'patchmark' ) }
						</p>
					) : (
						<TreeLevel
							folder={ tree }
							depth={ 0 }
							selected={ selected }
							onSelect={ setSelected }
							collapsed={ collapsed }
							onToggle={ ( path ) =>
								setCollapsed( ( prev ) => {
									const next = new Set( prev );
									if ( next.has( path ) ) {
										next.delete( path );
									} else {
										next.add( path );
									}
									return next;
								} )
							}
							stats={ fileStats }
						/>
					) }
					<p className="pmk-tree-foot pmk-muted">
						{ sprintf(
							/* translators: %s: number of files */
							_n(
								'%s file',
								'%s files',
								visible.length,
								'patchmark'
							),
							num( visible.length )
						) }{ ' ' }
						· <kbd>j</kbd>/<kbd>k</kbd>
					</p>
				</div>
				<div className="pmk-view">
					{ current ? (
						<DiffView
							file={ current }
							mode={ mode }
							ignoreWhitespace={ ignoreWs }
							line={
								target?.path === current.path
									? target.line
									: undefined
							}
							jump={ target?.seq ?? 0 }
						/>
					) : (
						<Empty
							icon="media-code"
							title={ __(
								'Pick a file to see its changes.',
								'patchmark'
							) }
						/>
					) }
				</div>
			</div>
		</div>
	);
}

function firstChanged( files: FileEntry[] ) {
	return files.find( ( f ) => f.status === 'modified' ) ?? files[ 0 ];
}

function buildTree( files: FileEntry[] ): Folder {
	const root: Folder = { name: '', path: '', folders: [], files: [] };
	for ( const f of files ) {
		const parts = f.path.split( '/' );
		let node = root;
		for ( let i = 0; i < parts.length - 1; i++ ) {
			const path = parts.slice( 0, i + 1 ).join( '/' );
			let child = node.folders.find( ( x ) => x.path === path );
			if ( ! child ) {
				child = { name: parts[ i ], path, folders: [], files: [] };
				node.folders.push( child );
			}
			node = child;
		}
		node.files.push( f );
	}
	// "src/Admin" instead of "src" holding only "Admin".
	const compact = ( node: Folder ): Folder => {
		node.folders = node.folders.map( compact );
		if (
			node.path &&
			node.folders.length === 1 &&
			node.files.length === 0
		) {
			const only = node.folders[ 0 ];
			return { ...only, name: `${ node.name }/${ only.name }` };
		}
		return node;
	};
	return compact( root );
}

// Files in the order the tree shows them, skipping collapsed folders.
function flatten( node: Folder, collapsed: Set< string > ): FileEntry[] {
	if ( node.path && collapsed.has( node.path ) ) {
		return [];
	}
	return [
		...node.folders.flatMap( ( f ) => flatten( f, collapsed ) ),
		...node.files,
	];
}

function TreeLevel( {
	folder,
	depth,
	selected,
	onSelect,
	collapsed,
	onToggle,
	stats: fileStats,
}: {
	folder: Folder;
	depth: number;
	selected: string;
	onSelect: ( path: string ) => void;
	collapsed: Set< string >;
	onToggle: ( path: string ) => void;
	stats: Map< string, DiffStats >;
} ) {
	return (
		<ul className="pmk-tree-level">
			{ folder.folders.map( ( f ) => {
				const open = ! collapsed.has( f.path );
				return (
					<li key={ f.path }>
						<button
							type="button"
							className="pmk-tree-folder"
							style={ { paddingLeft: 8 + depth * 14 } }
							aria-expanded={ open }
							onClick={ () => onToggle( f.path ) }
						>
							<Dashicon
								name={
									open
										? 'arrow-down-alt2'
										: 'arrow-right-alt2'
								}
							/>
							<span className="pmk-tree-name">{ f.name }</span>
							<span className="pmk-muted">
								{ countFiles( f ) }
							</span>
						</button>
						{ open && (
							<TreeLevel
								folder={ f }
								depth={ depth + 1 }
								selected={ selected }
								onSelect={ onSelect }
								collapsed={ collapsed }
								onToggle={ onToggle }
								stats={ fileStats }
							/>
						) }
					</li>
				);
			} ) }
			{ folder.files.map( ( f ) => {
				const s = fileStats.get( f.path );
				return (
					<li key={ f.path }>
						<button
							type="button"
							data-path={ f.path }
							className={ `pmk-tree-file${ f.path === selected ? ' is-selected' : '' }` }
							style={ { paddingLeft: 8 + depth * 14 + 18 } }
							aria-current={
								f.path === selected ? 'true' : undefined
							}
							onClick={ () => onSelect( f.path ) }
							title={
								f.oldPath && f.oldPath !== f.path
									? `${ f.oldPath } → ${ f.path }`
									: f.path
							}
						>
							<StatusBadge status={ f.status } short />
							<span className="pmk-tree-name">
								{ f.path.split( '/' ).pop() }
							</span>
							{ s && ( s.added > 0 || s.removed > 0 ) && (
								<span className="pmk-tree-stats">
									{ s.added > 0 && (
										<span className="is-added">
											+{ s.added }
										</span>
									) }
									{ s.removed > 0 && (
										<span className="is-removed">
											−{ s.removed }
										</span>
									) }
								</span>
							) }
						</button>
					</li>
				);
			} ) }
		</ul>
	);
}

function countFiles( f: Folder ): number {
	return (
		f.files.length + f.folders.reduce( ( n, x ) => n + countFiles( x ), 0 )
	);
}
